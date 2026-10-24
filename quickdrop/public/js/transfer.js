/**
 * QuickDrop v1.0 - WebRTC Chunked Transfer Engine (ES Module)
 * 64KB chunk streaming using File.slice() with backpressure flow control.
 * Zero server storage, pure browser-to-browser streaming.
 */

export const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512 KB backpressure threshold

export class TransferEngine {
  /**
   * @param {Object} options
   * @param {import('./rtc.js').WebRTCConnection} options.rtc WebRTC connection wrapper
   * @param {Function} options.onProgress Callback for progress, speed, ETA updates
   * @param {Function} options.onFileComplete Callback when an individual file finishes
   * @param {Function} options.onAllComplete Callback when all queued files finish
   * @param {Function} options.onError Callback on error
   */
  constructor(options = {}) {
    this.rtc = options.rtc;
    this.onProgress = options.onProgress || (() => {});
    this.onFileComplete = options.onFileComplete || (() => {});
    this.onAllComplete = options.onAllComplete || (() => {});
    this.onError = options.onError || (() => {});

    this.isCanceled = false;
    this.isSending = false;

    // Receiver state
    this.currentReceivingFile = null;
    this.receivedChunks = [];
    this.receivedBytesCurrent = 0;
    this.totalTransferredBytes = 0;
    this.totalTransferSize = 0;
    this.completedFiles = [];

    // Metrics tracking
    this.metricsTimer = null;
    this.lastTransferredBytes = 0;
    this.lastMetricsTime = Date.now();
    this.currentSpeed = 0;
  }

  /**
   * Start sending an array of Files/Folders via DataChannel
   * Uses File.slice() to stream in 64KB chunks without reading full file to RAM.
   * @param {File[]} fileList
   */
  async sendFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    this.isCanceled = false;
    this.isSending = true;

    // Calculate total size across all files
    this.totalTransferSize = fileList.reduce((acc, f) => acc + f.size, 0);
    this.totalTransferredBytes = 0;
    this.startMetricsTimer();

    console.log(`%c[QuickDrop:Transfer]%c Starting transfer of ${fileList.length} files (${this.totalTransferSize} bytes)`, 'color:#3B82F6;font-weight:bold', 'color:inherit');

    try {
      for (let i = 0; i < fileList.length; i++) {
        if (this.isCanceled) break;
        const file = fileList[i];
        await this.sendFile(file, i, fileList.length);
      }

      if (!this.isCanceled) {
        // Send all-complete signal
        this.rtc.send(JSON.stringify({ type: 'all-complete' }));
        this.stopMetricsTimer();
        this.onAllComplete({
          isSender: true,
          files: fileList.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          totalBytes: this.totalTransferSize,
        });
      }
    } catch (err) {
      this.stopMetricsTimer();
      console.error('Transfer failed:', err);
      this.onError(err);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Stream a single file in 64KB chunks with backpressure
   * @param {File} file
   * @param {number} fileIndex
   * @param {number} totalFiles
   */
  async sendFile(file, fileIndex, totalFiles) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Send Header JSON
    const header = {
      type: 'header',
      fileIndex,
      totalFiles,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
    };
    this.rtc.send(JSON.stringify(header));

    // 2. Stream chunks using File.slice()
    let offset = 0;

    while (offset < file.size) {
      if (this.isCanceled) break;

      // Backpressure control: Wait if DataChannel buffer is full
      if (this.rtc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await this.waitForBufferLow();
      }

      const chunkSlice = file.slice(offset, offset + CHUNK_SIZE);
      const chunkBuffer = await chunkSlice.arrayBuffer();

      this.rtc.send(chunkBuffer);

      offset += chunkBuffer.byteLength;
      this.totalTransferredBytes += chunkBuffer.byteLength;

      // Update progress callback
      this.notifyProgress({
        currentFileName: file.name,
        fileIndex,
        totalFiles,
      });
    }

    // 3. Send file-end marker
    if (!this.isCanceled) {
      this.rtc.send(JSON.stringify({ type: 'file-end', fileIndex }));
    }
  }

  /**
   * Waits for RTCDataChannel bufferedamountlow event before resuming send
   */
  waitForBufferLow() {
    return new Promise((resolve) => {
      const channel = this.rtc.dataChannel;
      if (!channel || channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
        return resolve();
      }

      const onLow = () => {
        channel.removeEventListener('bufferedamountlow', onLow);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', onLow);
    });
  }

  /**
   * Handles raw DataChannel incoming data (either string metadata or ArrayBuffer chunk)
   * @param {string|ArrayBuffer} data
   */
  handleIncomingData(data) {
    if (this.isCanceled) return;

    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'header') {
          // New file starting
          this.currentReceivingFile = msg;
          this.receivedChunks = [];
          this.receivedBytesCurrent = 0;

          if (this.totalTransferSize === 0) {
            this.totalTransferSize = msg.size;
          }
          this.startMetricsTimer();
          console.log(`%c[QuickDrop:Receiver]%c Receiving file "${msg.name}" (${msg.size} bytes)`, 'color:#10B981', 'color:inherit');
        } else if (msg.type === 'file-end') {
          // File finished receiving, construct Blob
          if (this.currentReceivingFile) {
            const blob = new Blob(this.receivedChunks, {
              type: this.currentReceivingFile.mimeType || 'application/octet-stream',
            });
            const url = URL.createObjectURL(blob);

            const fileRecord = {
              name: this.currentReceivingFile.name,
              size: this.currentReceivingFile.size,
              type: this.currentReceivingFile.mimeType,
              blob,
              url,
            };

            this.completedFiles.push(fileRecord);
            this.onFileComplete(fileRecord);

            // Clean chunk array from RAM
            this.receivedChunks = [];
            this.currentReceivingFile = null;
          }
        } else if (msg.type === 'all-complete') {
          this.stopMetricsTimer();
          this.onAllComplete({
            isSender: false,
            files: this.completedFiles,
            totalBytes: this.totalTransferredBytes,
          });
        }
      } catch (e) {
        console.error('Error parsing DataChannel text message:', e);
      }
    } else if (data instanceof ArrayBuffer) {
      // Chunk received
      this.receivedChunks.push(data);
      this.receivedBytesCurrent += data.byteLength;
      this.totalTransferredBytes += data.byteLength;

      this.notifyProgress({
        currentFileName: this.currentReceivingFile ? this.currentReceivingFile.name : '',
        fileIndex: this.currentReceivingFile ? this.currentReceivingFile.fileIndex : 0,
        totalFiles: this.currentReceivingFile ? this.currentReceivingFile.totalFiles : 1,
      });
    }
  }

  /**
   * Periodic speed (MB/s) and ETA calculator
   */
  startMetricsTimer() {
    this.stopMetricsTimer();
    this.lastTransferredBytes = this.totalTransferredBytes;
    this.lastMetricsTime = Date.now();

    this.metricsTimer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - this.lastMetricsTime) / 1000;
      if (elapsedSec <= 0) return;

      const bytesDiff = this.totalTransferredBytes - this.lastTransferredBytes;
      this.currentSpeed = Math.max(0, bytesDiff / elapsedSec);

      this.lastTransferredBytes = this.totalTransferredBytes;
      this.lastMetricsTime = now;
    }, 1000);
  }

  stopMetricsTimer() {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  notifyProgress(extra = {}) {
    const total = this.totalTransferSize || 1;
    const transferred = this.totalTransferredBytes;
    const percent = Math.min(100, (transferred / total) * 100);

    // Calculate speed string (MB/s or KB/s)
    let speedStr = '0 KB/s';
    if (this.currentSpeed >= 1024 * 1024) {
      speedStr = `${(this.currentSpeed / (1024 * 1024)).toFixed(2)} MB/s`;
    } else if (this.currentSpeed > 0) {
      speedStr = `${(this.currentSpeed / 1024).toFixed(1)} KB/s`;
    }

    // Calculate ETA (Remaining time)
    let etaStr = '--';
    if (this.currentSpeed > 0) {
      const remainingBytes = Math.max(0, total - transferred);
      const remainingSec = remainingBytes / this.currentSpeed;
      etaStr = this.formatETA(remainingSec);
    }

    this.onProgress({
      percent,
      speed: speedStr,
      eta: etaStr,
      transferredBytes: transferred,
      totalBytes: total,
      ...extra,
    });
  }

  formatETA(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
    const s = Math.round(seconds);
    if (s < 60) return `${s} giây`;
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${mins} phút ${rem} giây` : `${mins} phút`;
  }

  /**
   * Cancel ongoing transfer
   */
  cancel() {
    this.isCanceled = true;
    this.isSending = false;
    this.stopMetricsTimer();
    this.receivedChunks = [];
  }

  /**
   * Clean up Blob URLs to free browser memory
   */
  cleanup() {
    this.cancel();
    this.completedFiles.forEach((f) => {
      if (f.url) {
        URL.revokeObjectURL(f.url);
      }
    });
    this.completedFiles = [];
  }
}
