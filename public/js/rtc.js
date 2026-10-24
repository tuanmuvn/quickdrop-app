/**
 * QuickDrop v1.0 - WebRTC RTCPeerConnection & DataChannel Manager (ES Module)
 * Direct browser-to-browser P2P communication without server relay.
 */

export class WebRTCConnection {
  /**
   * @param {Object} options
   * @param {Array} options.iceServers STUN/TURN configurations
   * @param {Function} options.onIceCandidate Callback when local candidate is found
   * @param {Function} options.onDataChannelOpen Callback when DataChannel is open and ready
   * @param {Function} options.onDataChannelMessage Callback when DataChannel receives raw chunk or message
   * @param {Function} options.onConnectionStateChange Callback for connection states
   */
  constructor(options = {}) {
    this.iceServers = options.iceServers || [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ];
    this.onIceCandidate = options.onIceCandidate || (() => {});
    this.onDataChannelOpen = options.onDataChannelOpen || (() => {});
    this.onDataChannelMessage = options.onDataChannelMessage || (() => {});
    this.onConnectionStateChange = options.onConnectionStateChange || (() => {});
    this.onDataChannelBufferedLow = options.onDataChannelBufferedLow || (() => {});

    /** @type {RTCPeerConnection|null} */
    this.peerConnection = null;

    /** @type {RTCDataChannel|null} */
    this.dataChannel = null;

    this.isInitiator = false;
    this.candidateQueue = [];
  }

  /**
   * Initializes RTCPeerConnection
   */
  initPeerConnection() {
    this.close();

    const rtcConfig = {
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
    };

    console.log('%c[QuickDrop:WebRTC]%c Initializing RTCPeerConnection...', 'color:#10B981;font-weight:bold', 'color:inherit');
    this.peerConnection = new RTCPeerConnection(rtcConfig);
    this.candidateQueue = [];

    // ICE Candidate generation
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    // Connection state changes & automatic reconnection
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`%c[QuickDrop:WebRTC:State]%c ${state}`, 'color:#8B5CF6;font-weight:bold', 'color:inherit');
      this.onConnectionStateChange(state);

      if (state === 'failed') {
        console.warn('%c[QuickDrop:WebRTC:WARN]%c ICE Failed. Attempting restart...', 'color:#F59E0B', 'color:inherit');
        this.restartIce();
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      console.log(`%c[QuickDrop:WebRTC:ICE]%c ${iceState}`, 'color:#6366F1', 'color:inherit');
      if (iceState === 'failed') {
        this.restartIce();
      }
    };

    // Receiver handles incoming data channel
    this.peerConnection.ondatachannel = (event) => {
      console.log('%c[QuickDrop:WebRTC]%c Received remote DataChannel', 'color:#10B981;font-weight:bold', 'color:inherit');
      this.setupDataChannel(event.channel);
    };

    return this.peerConnection;
  }

  /**
   * Sender creates DataChannel and generates SDP Offer
   */
  async createOffer() {
    this.isInitiator = true;
    this.initPeerConnection();

    // Create high-throughput reliable DataChannel
    const channel = this.peerConnection.createDataChannel('quickdrop-channel', {
      ordered: true, // Guarantees chunk ordering
    });

    this.setupDataChannel(channel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    return this.peerConnection.localDescription;
  }

  /**
   * Receiver handles remote SDP Offer and creates SDP Answer
   * @param {RTCSessionDescriptionInit} remoteOffer
   */
  async handleOfferAndCreateAnswer(remoteOffer) {
    this.isInitiator = false;
    this.initPeerConnection();

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer));
    await this.flushIceCandidates();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return this.peerConnection.localDescription;
  }

  /**
   * Sender sets remote SDP Answer received from receiver
   * @param {RTCSessionDescriptionInit} remoteAnswer
   */
  async handleAnswer(remoteAnswer) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
    await this.flushIceCandidates();
  }

  /**
   * Add incoming ICE candidate or queue it if remote description is pending
   * @param {RTCIceCandidateInit} candidate
   */
  async addIceCandidate(candidate) {
    if (!candidate) return;
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.candidateQueue.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Error adding ICE candidate:', err);
    }
  }

  /**
   * Flushes queued ICE candidates after remote description is set
   */
  async flushIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.candidateQueue.length > 0) {
      const candidate = this.candidateQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error flushing queued ICE candidate:', err);
      }
    }
  }

  /**
   * Configures RTCDataChannel properties and listeners
   * @param {RTCDataChannel} channel
   */
  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    // Flow-control threshold (64KB buffer low threshold)
    this.dataChannel.bufferedAmountLowThreshold = 65536;

    this.dataChannel.onopen = () => {
      console.log('%c[QuickDrop:DataChannel]%c Channel OPEN & Ready for 64KB chunk transfer.', 'color:#10B981;font-weight:bold', 'color:inherit');
      this.onDataChannelOpen();
    };

    this.dataChannel.onclose = () => {
      console.log('%c[QuickDrop:DataChannel]%c Channel CLOSED.', 'color:#EF4444;font-weight:bold', 'color:inherit');
    };

    this.dataChannel.onerror = (err) => {
      console.error('%c[QuickDrop:DataChannel:ERR]%c', 'color:#EF4444;font-weight:bold', err);
    };

    this.dataChannel.onmessage = (event) => {
      this.onDataChannelMessage(event.data);
    };

    this.dataChannel.onbufferedamountlow = () => {
      this.onDataChannelBufferedLow();
    };
  }

  /**
   * Restarts ICE in case of network interruption or NAT traversal failure
   */
  async restartIce() {
    if (!this.peerConnection || !this.isInitiator) return;
    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      return this.peerConnection.localDescription;
    } catch (err) {
      console.error('Failed to restart ICE:', err);
    }
  }

  /**
   * Send data through the DataChannel
   * @param {ArrayBuffer|string} data
   */
  send(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('DataChannel is not open.');
    }
    this.dataChannel.send(data);
  }

  /**
   * Current bufferedAmount in DataChannel
   */
  get bufferedAmount() {
    return this.dataChannel ? this.dataChannel.bufferedAmount : 0;
  }

  /**
   * Close peer connection and channel
   */
  close() {
    this.candidateQueue = [];

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (e) {
        // Ignore
      }
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        // Ignore
      }
      this.peerConnection = null;
    }
  }
}
