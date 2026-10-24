/**
 * QuickDrop v1.0 - In-Memory Room Manager
 * Handles 6-digit room codes, peer pairing, and auto-expiration entirely in RAM.
 */

import { config } from './config.js';

/**
 * ANSI Color utilities for structured server logging
 */
const log = {
  info: (msg) => console.log(`\x1b[36m[QuickDrop:Room]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[QuickDrop:Room:OK]\x1b[0m ${msg}`),
  warn: (msg) => console.warn(`\x1b[33m[QuickDrop:Room:WARN]\x1b[0m ${msg}`),
  error: (msg) => console.error(`\x1b[31m[QuickDrop:Room:ERR]\x1b[0m ${msg}`),
};

export class RoomManager {
  constructor() {
    /**
     * Map of active rooms stored in memory: code -> RoomObject
     * @type {Map<string, Object>}
     */
    this.rooms = new Map();

    /**
     * Reverse lookup map: socketId -> code
     * @type {Map<string, string>}
     */
    this.socketToRoom = new Map();
  }

  /**
   * Generates a unique 6-digit numeric room code (e.g. 483921)
   * Ensures no collisions with currently active rooms.
   * @returns {string} 6-digit code
   */
  generateCode() {
    let code;
    let attempts = 0;
    const maxAttempts = 10000;

    do {
      // Generate a random integer between 100000 and 999999
      code = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error('Room space saturated. Unable to generate unique code.');
      }
    } while (this.rooms.has(code));

    return code;
  }

  /**
   * Creates a new room for a sender peer.
   * @param {string} senderSocketId
   * @param {Function} onExpired Callback fired when room expires after 10 minutes
   * @returns {Object} Created room object
   */
  createRoom(senderSocketId, onExpired) {
    // If socket is already hosting another room, clean it up first
    if (this.socketToRoom.has(senderSocketId)) {
      const existingCode = this.socketToRoom.get(senderSocketId);
      this.deleteRoom(existingCode);
    }

    const code = this.generateCode();
    const now = Date.now();
    const expiresAt = now + config.roomTimeoutMs;

    // Schedule 10-minute automatic expiration
    const timer = setTimeout(() => {
      log.warn(`Room [${code}] expired after 10 minutes.`);
      if (typeof onExpired === 'function') {
        onExpired(code);
      }
      this.deleteRoom(code);
    }, config.roomTimeoutMs);

    const room = {
      code,
      senderSocketId,
      receiverSocketId: null,
      createdAt: now,
      expiresAt,
      timer,
      status: 'waiting', // 'waiting' | 'paired' | 'transferring' | 'completed'
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(senderSocketId, code);

    log.success(`Created Room [${code}] for Sender [${senderSocketId}]. Expires in 10 mins.`);
    return room;
  }

  /**
   * Gets room details by 6-digit code.
   * @param {string} code
   * @returns {Object|null}
   */
  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toString().trim()) || null;
  }

  /**
   * Allows a receiver peer to join an existing room.
   * @param {string} code
   * @param {string} receiverSocketId
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  joinRoom(code, receiverSocketId) {
    const cleanCode = code ? code.toString().trim() : '';
    const room = this.rooms.get(cleanCode);

    if (!room) {
      log.warn(`Join failed: Room [${cleanCode}] does not exist or expired.`);
      return { success: false, error: 'Room không tồn tại hoặc đã hết hạn.' };
    }

    if (Date.now() > room.expiresAt) {
      this.deleteRoom(cleanCode);
      return { success: false, error: 'Room đã hết hạn.' };
    }

    if (room.senderSocketId === receiverSocketId) {
      return { success: false, error: 'Bạn không thể tự kết nối với chính mình.' };
    }

    if (room.receiverSocketId && room.receiverSocketId !== receiverSocketId) {
      log.warn(`Join failed: Room [${cleanCode}] is already full.`);
      return { success: false, error: 'Phòng đã có người kết nối (đã đầy).' };
    }

    // Attach receiver to room
    room.receiverSocketId = receiverSocketId;
    room.status = 'paired';
    this.socketToRoom.set(receiverSocketId, cleanCode);

    log.success(`Receiver [${receiverSocketId}] joined Room [${cleanCode}]. Peers paired.`);
    return { success: true, room };
  }

  /**
   * Deletes a room immediately from memory and clears its timer.
   * @param {string} code
   */
  deleteRoom(code) {
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    if (room.senderSocketId) {
      this.socketToRoom.delete(room.senderSocketId);
    }
    if (room.receiverSocketId) {
      this.socketToRoom.delete(room.receiverSocketId);
    }

    this.rooms.delete(code);
    log.info(`Deleted Room [${code}] completely from RAM. Zero data retained.`);
  }

  /**
   * Handles peer disconnection. Cleans up associations or closes room.
   * @param {string} socketId
   * @returns {{ code: string, otherPeerId: string|null, isSender: boolean }|null}
   */
  handleDisconnect(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return null;
    }

    const isSender = room.senderSocketId === socketId;
    const otherPeerId = isSender ? room.receiverSocketId : room.senderSocketId;

    log.info(`Socket [${socketId}] (${isSender ? 'Sender' : 'Receiver'}) disconnected from Room [${code}].`);

    // Delete room from memory when sender leaves or transfer was active
    this.deleteRoom(code);

    return {
      code,
      otherPeerId,
      isSender,
    };
  }

  /**
   * Retrieves active room code by socket ID.
   * @param {string} socketId
   * @returns {string|null}
   */
  getRoomBySocket(socketId) {
    return this.socketToRoom.get(socketId) || null;
  }

  /**
   * Returns current statistics (for debugging or monitoring)
   */
  getStats() {
    return {
      activeRooms: this.rooms.size,
      connectedSockets: this.socketToRoom.size,
    };
  }
}

export const roomManager = new RoomManager();
