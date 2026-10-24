/**
 * QuickDrop v1.0 - UI Controller Module (ES Module)
 * Handles Fluent Design DOM manipulation, screens, toasts, countdowns, and user interactions.
 */

export class UIController {
  constructor() {
    this.countdownTimer = null;
    this.selectedFiles = [];
    this.initElements();
    this.bindGlobalEvents();
  }

  /**
   * Cache DOM elements for high performance
   */
  initElements() {
    // Views
    this.viewHome = document.getElementById('viewHome');
    this.viewCreate = document.getElementById('viewCreate');
    this.viewJoin = document.getElementById('viewJoin');
    this.viewConnected = document.getElementById('viewConnected');
    this.viewProgress = document.getElementById('viewProgress');
    this.viewSuccess = document.getElementById('viewSuccess');

    // Status & Header
    this.headerStatusDot = document.getElementById('headerStatusDot');
    this.headerStatusText = document.getElementById('headerStatusText');

    // Create / Waiting Room elements
    this.displayRoomCode = document.getElementById('displayRoomCode');
    this.btnCopyCode = document.getElementById('btnCopyCode');
    this.qrContainer = document.getElementById('qrCodeContainer');
    this.countdownEl = document.getElementById('countdownTimer');
    this.btnCancelCreate = document.getElementById('btnCancelCreate');

    // Join elements
    this.digitInputs = Array.from(document.querySelectorAll('.digit-input'));
    this.btnConnectJoin = document.getElementById('btnConnectJoin');
    this.btnBackJoin = document.getElementById('btnBackJoin');

    // Connected / File selection elements
    this.dropzone = document.getElementById('dropzone');
    this.fileInput = document.getElementById('fileInput');
    this.folderInput = document.getElementById('folderInput');
    this.fileListEl = document.getElementById('fileList');
    this.btnSendFiles = document.getElementById('btnSendFiles');
    this.btnDisconnect = document.getElementById('btnDisconnect');
    this.selectedFilesSummary = document.getElementById('selectedFilesSummary');
    this.senderControls = document.getElementById('senderControls');
    this.receiverWaitingPrompt = document.getElementById('receiverWaitingPrompt');

    // Progress elements
    this.progressBarFill = document.getElementById('progressBarFill');
    this.progressPercentText = document.getElementById('progressPercentText');
    this.progressStatusTitle = document.getElementById('progressStatusTitle');
    this.metricSpeed = document.getElementById('metricSpeed');
    this.metricETA = document.getElementById('metricETA');
    this.metricTransferred = document.getElementById('metricTransferred');
    this.metricTotal = document.getElementById('metricTotal');
    this.btnCancelTransfer = document.getElementById('btnCancelTransfer');

    // Success elements
    this.successSummaryText = document.getElementById('successSummaryText');
    this.downloadButtonsList = document.getElementById('downloadButtonsList');
    this.btnStartNew = document.getElementById('btnStartNew');

    // Incoming file modal
    this.incomingModalOverlay = document.getElementById('incomingModalOverlay');
    this.incomingFileName = document.getElementById('incomingFileName');
    this.incomingFileSize = document.getElementById('incomingFileSize');
    this.incomingFileCount = document.getElementById('incomingFileCount');
    this.incomingFileIcon = document.getElementById('incomingFileIcon');
    this.btnAcceptFile = document.getElementById('btnAcceptFile');
    this.btnRejectFile = document.getElementById('btnRejectFile');

    // Toast container
    this.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * Sets up 6-digit input auto-tabbing and paste handling
   */
  bindGlobalEvents() {
    // Digit inputs auto-advance and backspace handling
    this.digitInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val ? val[0] : '';
        if (val && index < this.digitInputs.length - 1) {
          this.digitInputs[index + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          this.digitInputs[index - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pasted.replace(/\D/g, '').slice(0, 6).split('');
        digits.forEach((digit, i) => {
          if (this.digitInputs[i]) {
            this.digitInputs[i].value = digit;
          }
        });
        if (digits.length > 0) {
          const nextIndex = Math.min(digits.length, this.digitInputs.length - 1);
          this.digitInputs[nextIndex].focus();
        }
      });
    });

    // Copy room code to clipboard
    if (this.btnCopyCode) {
      this.btnCopyCode.addEventListener('click', () => {
        const rawCode = this.displayRoomCode.textContent.replace(/\s+/g, '');
        if (rawCode) {
          navigator.clipboard.writeText(rawCode).then(() => {
            this.showToast('Đã sao chép mã phòng vào clipboard!', 'success');
            const icon = this.btnCopyCode.querySelector('i');
            if (icon) {
              icon.className = 'fa-solid fa-check';
              setTimeout(() => {
                icon.className = 'fa-regular fa-copy';
              }, 2000);
            }
          }).catch(() => {
            this.showToast('Không thể sao chép tự động.', 'warning');
          });
        }
      });
    }
  }

  /**
   * Helper to switch between application views
   * @param {HTMLElement} targetView
   */
  switchView(targetView) {
    const views = [
      this.viewHome,
      this.viewCreate,
      this.viewJoin,
      this.viewConnected,
      this.viewProgress,
      this.viewSuccess,
    ];
    views.forEach((v) => {
      if (v) v.classList.add('d-none');
    });
    if (targetView) targetView.classList.remove('d-none');
  }

  /**
   * Update header status indicator
   */
  setConnectionStatus(status, text) {
    if (!this.headerStatusDot || !this.headerStatusText) return;
    this.headerStatusDot.className = 'status-dot';
    if (status === 'online') {
      this.headerStatusDot.classList.add('online');
    } else if (status === 'connected') {
      this.headerStatusDot.classList.add('connected');
    }
    this.headerStatusText.textContent = text;
  }

  showHomeView() {
    this.stopCountdown();
    this.clearSelectedFiles();
    this.switchView(this.viewHome);
    this.setConnectionStatus('online', 'Sẵn sàng kết nối');
  }

  showCreateView({ code, expiresAt, roomUrl }) {
    this.switchView(this.viewCreate);
    this.setConnectionStatus('online', `Chờ người nhận (${code})`);

    // Format 6 digits with space: 483 921
    const formatted = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
    this.displayRoomCode.textContent = formatted;

    // Render QR Code
    this.renderQRCode(roomUrl || `${window.location.origin}/?room=${code}`);

    // Start 10-minute countdown
    this.startCountdown(expiresAt, () => {
      this.showToast('Phòng kết nối đã hết hạn sau 10 phút.', 'warning');
      this.showHomeView();
    });
  }

  showJoinView(presetCode = '') {
    this.switchView(this.viewJoin);
    this.setConnectionStatus('online', 'Nhập mã kết nối');

    this.digitInputs.forEach((inp, idx) => {
      inp.value = presetCode[idx] || '';
    });

    if (presetCode.length === 6) {
      this.digitInputs[5].focus();
    } else if (this.digitInputs[0]) {
      this.digitInputs[0].focus();
    }
  }

  getEnteredCode() {
    return this.digitInputs.map((i) => i.value.trim()).join('');
  }

  showConnectedView({ isSender }) {
    this.stopCountdown();
    this.switchView(this.viewConnected);
    this.setConnectionStatus('connected', 'Đã kết nối WebRTC');

    if (isSender) {
      this.senderControls.classList.remove('d-none');
      this.receiverWaitingPrompt.classList.add('d-none');
    } else {
      this.senderControls.classList.add('d-none');
      this.receiverWaitingPrompt.classList.remove('d-none');
    }
  }

  showTransferProgress({ isSender, totalSize }) {
    this.switchView(this.viewProgress);
    this.progressStatusTitle.textContent = isSender ? 'Đang gửi file qua WebRTC DataChannel...' : 'Đang nhận file qua WebRTC DataChannel...';
    this.progressBarFill.style.width = '0%';
    this.progressPercentText.textContent = '0%';
    this.metricSpeed.textContent = '0 MB/s';
    this.metricETA.textContent = '--';
    this.metricTransferred.textContent = '0 MB';
    this.metricTotal.textContent = this.formatBytes(totalSize);
  }

  updateProgress({ percent, speed, eta, transferredBytes, totalBytes, currentFileName, fileIndex, totalFiles }) {
    const clampedPercent = Math.min(100, Math.max(0, percent));
    this.progressBarFill.style.width = `${clampedPercent}%`;
    this.progressPercentText.textContent = `${clampedPercent.toFixed(1)}%`;
    this.metricSpeed.textContent = speed;
    this.metricETA.textContent = eta;
    this.metricTransferred.textContent = this.formatBytes(transferredBytes);
    this.metricTotal.textContent = this.formatBytes(totalBytes);

    if (currentFileName && totalFiles > 1) {
      this.progressStatusTitle.textContent = `Đang truyền (${fileIndex + 1}/${totalFiles}): ${currentFileName}`;
    }
  }

  showTransferComplete({ files, isSender, totalBytes }) {
    this.switchView(this.viewSuccess);
    this.setConnectionStatus('online', 'Truyền file hoàn tất');

    const totalStr = this.formatBytes(totalBytes || 0);
    this.successSummaryText.textContent = isSender
      ? `Đã gửi thành công ${files.length} file (${totalStr}) trực tiếp qua WebRTC P2P.`
      : `Đã nhận thành công ${files.length} file (${totalStr}) từ đối tác. Không có dữ liệu lưu trên máy chủ.`;

    // Render download buttons for receiver
    this.downloadButtonsList.innerHTML = '';
    if (!isSender && files.length > 0) {
      files.forEach((f) => {
        const btn = document.createElement('a');
        btn.className = 'btn-fluent-primary text-decoration-none';
        btn.href = f.url;
        btn.download = f.name;
        btn.innerHTML = `<i class="fa-solid fa-download"></i> Tải về ${f.name} (${this.formatBytes(f.size)})`;
        this.downloadButtonsList.appendChild(btn);
      });
    }
  }

  /**
   * Generates or updates QR Code canvas/image
   */
  renderQRCode(url) {
    if (!this.qrContainer) return;
    this.qrContainer.innerHTML = '';

    // Check if QRCode library is loaded
    if (typeof window.QRCode !== 'undefined') {
      try {
        new window.QRCode(this.qrContainer, {
          text: url,
          width: 170,
          height: 170,
          colorDark: '#0F172A',
          colorLight: '#FFFFFF',
          correctLevel: window.QRCode.CorrectLevel.M,
        });
        return;
      } catch (err) {
        console.warn('QRCode lib error, fallback to SVG generator:', err);
      }
    }

    // Fallback: Embed dynamic SVG QR via fast QR generator API or clean fallback link
    const qrImg = document.createElement('img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(url)}`;
    qrImg.alt = 'QuickDrop QR Code';
    qrImg.width = 170;
    qrImg.height = 170;
    this.qrContainer.appendChild(qrImg);
  }

  /**
   * 10-minute room countdown timer
   */
  startCountdown(expiresAt, onExpired) {
    this.stopCountdown();

    const updateTimer = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        this.stopCountdown();
        if (this.countdownEl) this.countdownEl.textContent = '00:00 (Hết hạn)';
        if (typeof onExpired === 'function') onExpired();
        return;
      }

      const totalSec = Math.floor(remainingMs / 1000);
      const minutes = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const seconds = (totalSec % 60).toString().padStart(2, '0');

      if (this.countdownEl) {
        this.countdownEl.textContent = `${minutes}:${seconds}`;
      }
    };

    updateTimer();
    this.countdownTimer = setInterval(updateTimer, 1000);
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Incoming file approval modal
   */
  showIncomingFileModal({ metadata, onAccept, onReject }) {
    if (!this.incomingModalOverlay) return;

    this.incomingFileName.textContent = metadata.name || 'File';
    this.incomingFileSize.textContent = this.formatBytes(metadata.size || 0);
    this.incomingFileCount.textContent = metadata.fileCount ? `${metadata.fileCount} file` : '1 file';
    this.incomingFileIcon.className = `file-type-icon ${this.getFileIcon(metadata.name, metadata.type)}`;

    this.incomingModalOverlay.classList.add('active');

    const handleAccept = () => {
      this.hideIncomingFileModal();
      cleanup();
      if (typeof onAccept === 'function') onAccept();
    };

    const handleReject = () => {
      this.hideIncomingFileModal();
      cleanup();
      if (typeof onReject === 'function') onReject();
    };

    const cleanup = () => {
      this.btnAcceptFile.removeEventListener('click', handleAccept);
      this.btnRejectFile.removeEventListener('click', handleReject);
    };

    this.btnAcceptFile.addEventListener('click', handleAccept, { once: true });
    this.btnRejectFile.addEventListener('click', handleReject, { once: true });
  }

  hideIncomingFileModal() {
    if (this.incomingModalOverlay) {
      this.incomingModalOverlay.classList.remove('active');
    }
  }

  /**
   * Add selected files from input or drag-drop
   * @param {FileList|File[]} files
   */
  addFiles(files) {
    for (let i = 0; i < files.length; i++) {
      this.selectedFiles.push(files[i]);
    }
    this.renderSelectedFiles();
  }

  removeFile(index) {
    if (index >= 0 && index < this.selectedFiles.length) {
      this.selectedFiles.splice(index, 1);
      this.renderSelectedFiles();
    }
  }

  clearSelectedFiles() {
    this.selectedFiles = [];
    if (this.fileInput) this.fileInput.value = '';
    if (this.folderInput) this.folderInput.value = '';
    this.renderSelectedFiles();
  }

  getSelectedFiles() {
    return this.selectedFiles;
  }

  renderSelectedFiles() {
    if (!this.fileListEl) return;
    this.fileListEl.innerHTML = '';

    if (this.selectedFiles.length === 0) {
      this.btnSendFiles.disabled = true;
      this.selectedFilesSummary.textContent = 'Chưa chọn file nào';
      return;
    }

    let totalBytes = 0;

    this.selectedFiles.forEach((file, index) => {
      totalBytes += file.size;
      const item = document.createElement('div');
      item.className = 'file-item';

      const iconClass = this.getFileIcon(file.name, file.type);

      item.innerHTML = `
        <div class="file-item-left">
          <div class="file-type-icon">
            <i class="${iconClass}"></i>
          </div>
          <div class="file-info">
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${this.formatBytes(file.size)}</div>
          </div>
        </div>
        <button type="button" class="btn-remove-file" title="Xóa file">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      item.querySelector('.btn-remove-file').addEventListener('click', () => {
        this.removeFile(index);
      });

      this.fileListEl.appendChild(item);
    });

    this.btnSendFiles.disabled = false;
    this.selectedFilesSummary.textContent = `Tổng cộng: ${this.selectedFiles.length} file • ${this.formatBytes(totalBytes)}`;
  }

  /**
   * Fluent Toast Notification
   */
  showToast(message, type = 'info', duration = 4000) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `fluent-toast toast-${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon} mt-1"></i>
      <div class="flex-grow-1">${message}</div>
    `;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  /**
   * Format bytes to readable B, KB, MB, GB
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format speed in MB/s or KB/s
   */
  formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
    }
    return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  }

  /**
   * Format remaining time (ETA)
   * Examples: "12 giây", "1 phút 20 giây"
   */
  formatETA(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
    const s = Math.round(seconds);
    if (s < 60) {
      return `${s} giây`;
    }
    const mins = Math.floor(s / 60);
    const remSec = s % 60;
    return remSec > 0 ? `${mins} phút ${remSec} giây` : `${mins} phút`;
  }

  /**
   * Determine FontAwesome icon by extension/mime
   */
  getFileIcon(name = '', type = '') {
    const ext = name.split('.').pop().toLowerCase();
    if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
      return 'fa-regular fa-file-image';
    }
    if (type.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
      return 'fa-regular fa-file-video';
    }
    if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
      return 'fa-regular fa-file-audio';
    }
    if (ext === 'pdf') {
      return 'fa-regular fa-file-pdf';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return 'fa-regular fa-file-zipper';
    }
    if (['js', 'ts', 'py', 'json', 'html', 'css', 'cpp', 'java'].includes(ext)) {
      return 'fa-regular fa-file-code';
    }
    if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
      return 'fa-regular fa-file-word';
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return 'fa-regular fa-file-excel';
    }
    return 'fa-regular fa-file';
  }
}
