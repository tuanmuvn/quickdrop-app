/**
 * QuickDrop v1.0 - Client Socket.IO Signaling Wrapper (ES Module)
 * Manages signaling connection, room handshakes, and WebRTC SDP/ICE message forwarding.
 */

export class SignalingClient {
  constructor() {
    this.socket = null;
    this.currentCode = null;
    this.isSender = false;
    this.listeners = new Map();
  }

  async waitForIoClient(timeoutMs = 5000) {
    if (typeof window.io !== 'undefined') return window.io;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
      if (typeof window.io !== 'undefined') return window.io;
    }
    throw new Error('Thư viện Socket.IO client chưa sẵn sàng.');
  }

  /**
   * Initializes Socket.IO connection
   */
  async connect() {
    if (this.socket) return this.socket;

    await this.waitForIoClient();

    return new Promise((resolve) => {
      this.socket = window.io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log(`%c[QuickDrop:Socket]%c Connected with ID: ${this.socket.id}`, 'color:#3B82F6;font-weight:bold', 'color:inherit');
        resolve(this.socket);
      });

      this.socket.on('connect_error', (err) => {
        console.error(`%c[QuickDrop:Socket:ERR]%c Connection error:`, 'color:#EF4444;font-weight:bold', 'color:inherit', err);
      });

      // Bind common forwarding events
      const forwardEvents = [
        'room-created',
        'receiver-joined',
        'joined-room',
        'join-error',
        'ready',
        'offer',
        'answer',
        'ice',
        'incoming-file',
        'file-accepted',
        'file-rejected',
        'transfer-canceled',
        'transfer-completed',
        'peer-disconnected',
        'room-closed',
        'expired',
        'error-message',
      ];

      forwardEvents.forEach((evt) => {
        this.socket.on(evt, (data) => {
          this.emitInternal(evt, data);
        });
      });
    });
  }

  /**
   * Register event listener
   * @param {string} event
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Dispatch event to registered callbacks
   */
  emitInternal(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in socket listener [${event}]:`, e);
        }
      });
    }
  }

  /**
   * Create a new transfer room
   * @returns {Promise<{ success: boolean, code: string, expiresAt: number, iceServers: Array }>}
   */
  createRoom() {
    return new Promise((resolve, reject) => {
      this.isSender = true;
      this.socket.emit('create-room', (response) => {
        if (response && response.success) {
          this.currentCode = response.code;
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Không thể tạo phòng'));
        }
      });
    });
  }

  /**
   * Join an existing room via 6-digit code
   * @param {string} code
   * @returns {Promise<{ success: boolean, code: string, iceServers: Array }>}
   */
  joinRoom(code) {
    return new Promise((resolve, reject) => {
      this.isSender = false;
      this.socket.emit('join-room', { code }, (response) => {
        if (response && response.success) {
          this.currentCode = response.code;
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Không thể tham gia phòng'));
        }
      });
    });
  }

  /**
   * Notify peer ready to negotiate WebRTC
   */
  sendReady() {
    this.socket.emit('ready', { code: this.currentCode });
  }

  /**
   * Send WebRTC SDP Offer
   */
  sendOffer(sdp) {
    this.socket.emit('offer', { code: this.currentCode, sdp });
  }

  /**
   * Send WebRTC SDP Answer
   */
  sendAnswer(sdp) {
    this.socket.emit('answer', { code: this.currentCode, sdp });
  }

  /**
   * Send ICE Candidate
   */
  sendIceCandidate(candidate) {
    this.socket.emit('ice', { code: this.currentCode, candidate });
  }

  /**
   * Notify peer of incoming file transfer metadata
   */
  sendFileMetadata(metadata) {
    this.socket.emit('send-file', { code: this.currentCode, metadata });
  }

  /**
   * Accept incoming file transfer
   */
  acceptFile() {
    this.socket.emit('accept-file', { code: this.currentCode });
  }

  /**
   * Reject incoming file transfer
   */
  rejectFile(reason) {
    this.socket.emit('reject', { code: this.currentCode, reason });
  }

  /**
   * Cancel ongoing file transfer
   */
  cancelTransfer(reason) {
    this.socket.emit('cancel', { code: this.currentCode, reason });
  }

  /**
   * Mark transfer complete and trigger room purge
   */
  completeTransfer() {
    this.socket.emit('complete', { code: this.currentCode });
  }

  getSocketId() {
    return this.socket?.id || null;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentCode = null;
    }
  }
}
