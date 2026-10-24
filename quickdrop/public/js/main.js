/**
 * QuickDrop v1.0 - Main Application Coordinator (ES Module)
 * Connects UI, Signaling, WebRTC, and Chunked Transfer Engine.
 */

import { UIController } from './ui.js';
import { SignalingClient } from './socket.js';
import { WebRTCConnection } from './rtc.js';
import { TransferEngine } from './transfer.js';

class QuickDropApp {
  constructor() {
    this.ui = new UIController();
    this.signaling = new SignalingClient();
    this.rtc = null;
    this.transfer = null;

    this.isSender = false;
    this.currentCode = null;
    this.iceServers = [];

    this.init();
  }

  async init() {
    console.log('%c[QuickDrop]%c Initializing QuickDrop v1.0 Client Engine...', 'color:#2563EB;font-weight:bold', 'color:inherit');

    this.bindUIEvents();
    this.setupSignalingListeners();

    try {
      await this.signaling.connect();
      this.ui.setConnectionStatus('online', 'Sẵn sàng kết nối');

      // Check URL parameters: e.g. ?room=483921
      this.checkUrlParams();
    } catch (err) {
      console.error('Signaling connection error:', err);
      this.ui.showToast('Không thể kết nối đến máy chủ tín hiệu. Vui lòng thử lại.', 'error');
    }
  }

  /**
   * Check for ?room=123456 query parameter from QR code scan
   */
  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.length === 6 && /^\d+$/.test(roomParam)) {
      this.ui.showJoinView(roomParam);
      this.ui.showToast(`Đã nhận diện mã phòng ${roomParam} từ liên kết QR.`, 'info');
      // Auto-trigger join
      setTimeout(() => {
        this.handleJoinRoom(roomParam);
      }, 500);
    } else {
      this.ui.showHomeView();
    }
  }

  /**
   * Setup UI button and drag-drop events
   */
  bindUIEvents() {
    // Home Action: Create Room
    const btnGoCreate = document.getElementById('btnGoCreate');
    if (btnGoCreate) {
      btnGoCreate.addEventListener('click', () => this.handleCreateRoom());
    }

    // Home Action: Join Room
    const btnGoJoin = document.getElementById('btnGoJoin');
    if (btnGoJoin) {
      btnGoJoin.addEventListener('click', () => this.ui.showJoinView());
    }

    // Cancel Create / Back to Home
    if (this.ui.btnCancelCreate) {
      this.ui.btnCancelCreate.addEventListener('click', () => this.handleLeaveAndReset());
    }

    // Join View: Back
    if (this.ui.btnBackJoin) {
      this.ui.btnBackJoin.addEventListener('click', () => this.ui.showHomeView());
    }

    // Join View: Submit Code
    if (this.ui.btnConnectJoin) {
      this.ui.btnConnectJoin.addEventListener('click', () => {
        const code = this.ui.getEnteredCode();
        if (code.length !== 6) {
          this.ui.showToast('Vui lòng nhập đủ 6 chữ số mã phòng.', 'warning');
          return;
        }
        this.handleJoinRoom(code);
      });
    }

    // Dropzone Drag & Drop
    const dropzone = this.ui.dropzone;
    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('drag-over');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          this.ui.addFiles(files);
        }
      });

      dropzone.addEventListener('click', (e) => {
        // Prevent clicking file/folder buttons inside dropzone from triggering fileInput
        if (e.target.closest('#btnPickFiles') || e.target === dropzone || e.target.closest('.dropzone-icon') || e.target.closest('.dropzone-text')) {
          this.ui.fileInput.click();
        }
      });
    }

    // File Input change
    if (this.ui.fileInput) {
      this.ui.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.ui.addFiles(e.target.files);
        }
      });
    }

    // Folder Input change
    if (this.ui.folderInput) {
      this.ui.folderInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.ui.addFiles(e.target.files);
        }
      });
    }

    const btnPickFolder = document.getElementById('btnPickFolder');
    if (btnPickFolder && this.ui.folderInput) {
      btnPickFolder.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ui.folderInput.click();
      });
    }

    // Send Files Action
    if (this.ui.btnSendFiles) {
      this.ui.btnSendFiles.addEventListener('click', () => this.handleInitiateSend());
    }

    // Disconnect Action
    if (this.ui.btnDisconnect) {
      this.ui.btnDisconnect.addEventListener('click', () => this.handleLeaveAndReset());
    }

    // Cancel Transfer Action
    if (this.ui.btnCancelTransfer) {
      this.ui.btnCancelTransfer.addEventListener('click', () => {
        if (this.transfer) {
          this.transfer.cancel();
        }
        this.signaling.cancelTransfer('Người dùng đã hủy quá trình truyền.');
        this.ui.showToast('Bạn đã hủy quá trình truyền file.', 'info');
        this.ui.showConnectedView({ isSender: this.isSender });
      });
    }

    // Start New Transfer
    if (this.ui.btnStartNew) {
      this.ui.btnStartNew.addEventListener('click', () => this.handleLeaveAndReset());
    }
  }

  /**
   * Listen to Signaling Socket Events
   */
  setupSignalingListeners() {
    // Room created event
    this.signaling.on('room-created', (data) => {
      this.currentCode = data.code;
      this.iceServers = data.iceServers;
      const roomUrl = `${window.location.origin}/?room=${data.code}`;
      this.ui.showCreateView({
        code: data.code,
        expiresAt: data.expiresAt,
        roomUrl,
      });
    });

    // Receiver joined notification (received by Sender)
    this.signaling.on('receiver-joined', async (data) => {
      console.log(`%c[QuickDrop]%c Receiver joined room: ${data.code}`, 'color:#10B981;font-weight:bold', 'color:inherit');
      this.ui.showToast('Thiết bị nhận đã kết nối! Đang thiết lập kênh P2P...', 'info');

      // Sender creates WebRTC Peer Connection and sends Offer
      await this.initWebRTC(true);
      const offer = await this.rtc.createOffer();
      this.signaling.sendOffer(offer);
    });

    // Joined room confirmation (received by Receiver)
    this.signaling.on('joined-room', (data) => {
      this.currentCode = data.code;
      this.iceServers = data.iceServers;
      this.ui.showToast(`Đã tham gia phòng ${data.code}. Chờ kết nối P2P...`, 'success');
      this.initWebRTC(false);
    });

    // Join error
    this.signaling.on('join-error', (data) => {
      this.ui.showToast(data.error || 'Không thể tham gia phòng.', 'error');
    });

    // SDP Offer received (by Receiver)
    this.signaling.on('offer', async (data) => {
      console.log('%c[QuickDrop]%c Received SDP Offer from Sender', 'color:#3B82F6', 'color:inherit');
      if (!this.rtc) await this.initWebRTC(false);

      const answer = await this.rtc.handleOfferAndCreateAnswer(data.sdp);
      this.signaling.sendAnswer(answer);
    });

    // SDP Answer received (by Sender)
    this.signaling.on('answer', async (data) => {
      console.log('%c[QuickDrop]%c Received SDP Answer from Receiver', 'color:#3B82F6', 'color:inherit');
      if (this.rtc) {
        await this.rtc.handleAnswer(data.sdp);
      }
    });

    // ICE Candidate received
    this.signaling.on('ice', async (data) => {
      if (this.rtc && data.candidate) {
        await this.rtc.addIceCandidate(data.candidate);
      }
    });

    // Incoming file metadata announcement (received by Receiver)
    this.signaling.on('incoming-file', (data) => {
      const metadata = data.metadata;
      this.ui.showIncomingFileModal({
        metadata,
        onAccept: () => {
          this.signaling.acceptFile();
          this.ui.showTransferProgress({ isSender: false, totalSize: metadata.size });
        },
        onReject: () => {
          this.signaling.rejectFile('Người nhận đã từ chối nhận file.');
          this.ui.showToast('Bạn đã từ chối nhận file.', 'info');
        },
      });
    });

    // File accepted (received by Sender)
    this.signaling.on('file-accepted', async () => {
      this.ui.showToast('Người nhận đã chấp nhận file. Bắt đầu truyền dữ liệu...', 'success');
      const files = this.ui.getSelectedFiles();
      const totalSize = files.reduce((acc, f) => acc + f.size, 0);

      this.ui.showTransferProgress({ isSender: true, totalSize });

      if (this.transfer) {
        await this.transfer.sendFiles(files);
      }
    });

    // File rejected (received by Sender)
    this.signaling.on('file-rejected', (data) => {
      this.ui.showToast(data.reason || 'Người nhận đã từ chối nhận file.', 'warning');
    });

    // Transfer canceled
    this.signaling.on('transfer-canceled', (data) => {
      if (this.transfer) this.transfer.cancel();
      this.ui.showToast(data.reason || 'Quá trình truyền file đã bị hủy.', 'warning');
      this.ui.showConnectedView({ isSender: this.isSender });
    });

    // Room expired
    this.signaling.on('expired', (data) => {
      this.ui.showToast(data.message || 'Phòng đã hết hạn.', 'warning');
      this.handleLeaveAndReset();
    });

    // Peer disconnected
    this.signaling.on('peer-disconnected', (data) => {
      this.ui.showToast(data.message || 'Đối tác đã ngắt kết nối.', 'warning');
      this.handleLeaveAndReset();
    });

    // Room closed
    this.signaling.on('room-closed', () => {
      this.handleLeaveAndReset();
    });
  }

  /**
   * Initializes WebRTC connection and binds DataChannel transfer engine
   * @param {boolean} isInitiator
   */
  async initWebRTC(isInitiator) {
    this.isSender = isInitiator;

    this.rtc = new WebRTCConnection({
      iceServers: this.iceServers,
      onIceCandidate: (candidate) => {
        this.signaling.sendIceCandidate(candidate);
      },
      onDataChannelOpen: () => {
        this.ui.showToast('Kênh P2P WebRTC đã kết nối thành công!', 'success');
        this.ui.showConnectedView({ isSender: this.isSender });
      },
      onDataChannelMessage: (data) => {
        if (this.transfer) {
          this.transfer.handleIncomingData(data);
        }
      },
      onConnectionStateChange: (state) => {
        if (state === 'connected') {
          this.ui.setConnectionStatus('connected', 'P2P Trực tiếp');
        } else if (state === 'disconnected' || state === 'failed') {
          this.ui.setConnectionStatus('online', 'Mất kết nối P2P');
        }
      },
    });

    this.transfer = new TransferEngine({
      rtc: this.rtc,
      onProgress: (metrics) => {
        this.ui.updateProgress(metrics);
      },
      onFileComplete: (fileRecord) => {
        console.log(`File complete: ${fileRecord.name}`);
      },
      onAllComplete: ({ isSender, files, totalBytes }) => {
        this.ui.showTransferComplete({ isSender, files, totalBytes });

        // Signal room completion so server purges room from RAM
        this.signaling.completeTransfer();

        // If receiver, trigger download of first file automatically
        if (!isSender && files.length === 1 && files[0].url) {
          const a = document.createElement('a');
          a.href = files[0].url;
          a.download = files[0].name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      },
      onError: (err) => {
        this.ui.showToast(`Lỗi truyền file: ${err.message}`, 'error');
        this.ui.showConnectedView({ isSender: this.isSender });
      },
    });

    return this.rtc;
  }

  /**
   * Create Room handler
   */
  async handleCreateRoom() {
    try {
      this.isSender = true;
      const res = await this.signaling.createRoom();
      this.currentCode = res.code;
      this.iceServers = res.iceServers;
      const roomUrl = `${window.location.origin}/?room=${res.code}`;

      this.ui.showCreateView({
        code: res.code,
        expiresAt: res.expiresAt,
        roomUrl,
      });
      this.ui.showToast(`Phòng [${res.code}] đã tạo! Hãy chia sẻ mã hoặc QR code.`, 'success');
    } catch (err) {
      this.ui.showToast(err.message || 'Không thể tạo phòng.', 'error');
    }
  }

  /**
   * Join Room handler
   */
  async handleJoinRoom(code) {
    try {
      this.isSender = false;
      const res = await this.signaling.joinRoom(code);
      this.currentCode = res.code;
      this.iceServers = res.iceServers;
      this.ui.showToast(`Đang kết nối đến phòng ${code}...`, 'info');
      await this.initWebRTC(false);
    } catch (err) {
      this.ui.showToast(err.message || 'Mã phòng không hợp lệ hoặc đã hết hạn.', 'error');
    }
  }

  /**
   * Sender initiates file transmission
   */
  handleInitiateSend() {
    const files = this.ui.getSelectedFiles();
    if (!files || files.length === 0) {
      this.ui.showToast('Vui lòng chọn ít nhất một file.', 'warning');
      return;
    }

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    // Announce metadata to receiver first
    this.signaling.sendFileMetadata({
      name: files.length === 1 ? files[0].name : `${files[0].name} (và ${files.length - 1} file khác)`,
      size: totalSize,
      fileCount: files.length,
      type: files.length === 1 ? files[0].type : 'multiple',
    });

    this.ui.showToast('Đang chờ người nhận chấp nhận file...', 'info');
  }

  /**
   * Cleanly leave room and reset to initial state
   */
  handleLeaveAndReset() {
    if (this.transfer) {
      this.transfer.cleanup();
      this.transfer = null;
    }

    if (this.rtc) {
      this.rtc.close();
      this.rtc = null;
    }

    this.isSender = false;
    this.currentCode = null;

    // Reset clean URL without ?room=
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this.ui.showHomeView();
  }
}

// Bootstrap application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new QuickDropApp();
});
