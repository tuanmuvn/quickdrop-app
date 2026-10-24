/**
 * QuickDrop v1.0 - Socket.IO Signaling Server
 * Coordinates WebRTC peer negotiation, room events, and real-time handshakes.
 * Zero files pass through this server - signaling only.
 */

import { Server } from 'socket.io';
import { config } from './config.js';
import { roomManager } from './roomManager.js';

/**
 * ANSI Color logger for socket signaling events
 */
const log = {
  info: (msg) => console.log(`\x1b[35m[QuickDrop:Socket]\x1b[0m ${msg}`),
  signal: (msg) => console.log(`\x1b[34m[QuickDrop:Signal]\x1b[0m ${msg}`),
  warn: (msg) => console.warn(`\x1b[33m[QuickDrop:Socket:WARN]\x1b[0m ${msg}`),
  err: (msg) => console.error(`\x1b[31m[QuickDrop:Socket:ERR]\x1b[0m ${msg}`),
};

/**
 * Initializes and binds Socket.IO signaling event handlers
 * @param {import('http').Server} httpServer
 * @returns {Server}
 */
export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: config.cors.methods,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    log.info(`Client connected: [${socket.id}]`);

    /**
     * Event: create-room
     * Sender requests creation of a new P2P room with 6-digit code.
     */
    socket.on('create-room', (callback) => {
      try {
        const room = roomManager.createRoom(socket.id, (expiredCode) => {
          // Callback when room expires after 10 minutes
          io.to(expiredCode).emit('expired', {
            message: 'Phòng đã hết hạn (sau 10 phút). Dữ liệu kết nối đã được xóa.',
          });
        });

        // Join Socket.io room channel
        socket.join(room.code);

        const responseData = {
          success: true,
          code: room.code,
          expiresAt: room.expiresAt,
          iceServers: config.iceServers,
        };

        log.signal(`[${socket.id}] created Room [${room.code}]`);

        if (typeof callback === 'function') {
          callback(responseData);
        } else {
          socket.emit('room-created', responseData);
        }
      } catch (err) {
        log.err(`Error creating room: ${err.message}`);
        const errResp = { success: false, error: 'Không thể tạo phòng kết nối. Vui lòng thử lại.' };
        if (typeof callback === 'function') callback(errResp);
        else socket.emit('error-message', errResp);
      }
    });

    /**
     * Event: join-room
     * Receiver provides a 6-digit code to pair with the sender.
     */
    socket.on('join-room', (data, callback) => {
      const code = data?.code?.toString().trim();
      if (!code || code.length !== 6) {
        const errResp = { success: false, error: 'Mã phòng phải gồm 6 chữ số.' };
        if (typeof callback === 'function') callback(errResp);
        else socket.emit('join-error', errResp);
        return;
      }

      const joinResult = roomManager.joinRoom(code, socket.id);

      if (!joinResult.success) {
        log.warn(`[${socket.id}] failed to join Room [${code}]: ${joinResult.error}`);
        if (typeof callback === 'function') callback(joinResult);
        else socket.emit('join-error', joinResult);
        return;
      }

      // Receiver joins the Socket.IO room channel
      socket.join(code);

      const joinPayload = {
        success: true,
        code,
        expiresAt: joinResult.room.expiresAt,
        iceServers: config.iceServers,
      };

      if (typeof callback === 'function') {
        callback(joinPayload);
      } else {
        socket.emit('joined-room', joinPayload);
      }

      // Notify the sender that receiver has arrived
      io.to(joinResult.room.senderSocketId).emit('receiver-joined', {
        receiverId: socket.id,
        code,
      });

      log.signal(`Peers paired in Room [${code}]: Sender [${joinResult.room.senderSocketId}] <-> Receiver [${socket.id}]`);
    });

    /**
     * Event: ready
     * A peer informs the other that they are ready to initiate WebRTC offer.
     */
    socket.on('ready', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        socket.to(code).emit('ready', { peerId: socket.id });
        log.signal(`Peer [${socket.id}] ready in Room [${code}]`);
      }
    });

    /**
     * Event: offer
     * Forward WebRTC SDP Offer to the other peer in the room.
     */
    socket.on('offer', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code && data?.sdp) {
        socket.to(code).emit('offer', {
          sdp: data.sdp,
          senderId: socket.id,
        });
        log.signal(`Forwarded SDP Offer in Room [${code}]`);
      }
    });

    /**
     * Event: answer
     * Forward WebRTC SDP Answer back to the offerer.
     */
    socket.on('answer', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code && data?.sdp) {
        socket.to(code).emit('answer', {
          sdp: data.sdp,
          senderId: socket.id,
        });
        log.signal(`Forwarded SDP Answer in Room [${code}]`);
      }
    });

    /**
     * Event: ice
     * Forward ICE candidate to remote peer.
     */
    socket.on('ice', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code && data?.candidate) {
        socket.to(code).emit('ice', {
          candidate: data.candidate,
          senderId: socket.id,
        });
      }
    });

    /**
     * Event: send-file (Metadata only)
     * Sender transmits file metadata (name, size, type, count) before chunking.
     */
    socket.on('send-file', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code && data?.metadata) {
        socket.to(code).emit('incoming-file', {
          metadata: data.metadata,
          senderId: socket.id,
        });
        log.signal(`File transfer requested in Room [${code}]: "${data.metadata.name}" (${data.metadata.size} bytes)`);
      }
    });

    /**
     * Event: accept-file
     * Receiver confirms acceptance of the incoming file transfer.
     */
    socket.on('accept-file', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        socket.to(code).emit('file-accepted', {
          receiverId: socket.id,
        });
        log.signal(`File transfer accepted by receiver in Room [${code}]`);
      }
    });

    /**
     * Event: reject
     * Receiver rejects incoming file transfer.
     */
    socket.on('reject', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        socket.to(code).emit('file-rejected', {
          reason: data?.reason || 'Người nhận đã từ chối nhận file.',
        });
        log.signal(`File transfer rejected in Room [${code}]`);
      }
    });

    /**
     * Event: cancel
     * Transfer canceled by either sender or receiver.
     */
    socket.on('cancel', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        socket.to(code).emit('transfer-canceled', {
          reason: data?.reason || 'Quá trình truyền file đã bị hủy.',
          senderId: socket.id,
        });
        log.signal(`Transfer canceled in Room [${code}]`);
      }
    });

    /**
     * Event: chunk (Backup signaling indicator if needed)
     */
    socket.on('chunk', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        socket.to(code).emit('chunk', data);
      }
    });

    /**
     * Event: complete
     * Transfer successfully completed. Immediately deletes room from RAM.
     */
    socket.on('complete', (data) => {
      const code = data?.code || roomManager.getRoomBySocket(socket.id);
      if (code) {
        log.signal(`Transfer completed in Room [${code}]. Purging room immediately.`);
        io.to(code).emit('transfer-completed', {
          message: 'Truyền file hoàn tất thành công! Phòng đã được giải phóng.',
        });
        roomManager.deleteRoom(code);
      }
    });

    /**
     * Event: disconnect
     * Cleans up room association and notifies remaining peer.
     */
    socket.on('disconnect', (reason) => {
      log.info(`Client disconnected: [${socket.id}] (${reason})`);
      const cleanup = roomManager.handleDisconnect(socket.id);

      if (cleanup) {
        const { code, otherPeerId } = cleanup;
        if (otherPeerId) {
          io.to(otherPeerId).emit('peer-disconnected', {
            message: 'Đối phương đã ngắt kết nối. Phòng đã đóng.',
          });
        }
        io.to(code).emit('room-closed');
      }
    });
  });

  return io;
}
