/**
 * QuickDrop v1.0 - Server Configuration
 * Production-ready environment and signaling configuration
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server port (default 3000)
  port: parseInt(process.env.PORT || '3000', 10),

  // Environment mode
  env: process.env.NODE_ENV || 'development',

  // Room lifecycle duration in milliseconds (10 minutes)
  roomTimeoutMs: parseInt(process.env.ROOM_TIMEOUT_MS || '600000', 10),

  // WebRTC chunk size for DataChannel transfer (64 KB)
  chunkSize: parseInt(process.env.CHUNK_SIZE || '65536', 10),

  // Rate limiting (requests per minute per IP)
  rateLimit: {
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },

  // WebRTC ICE Servers (STUN default, extendable with TURN)
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    },
    ...(process.env.TURN_SERVER_URL
      ? [
          {
            urls: process.env.TURN_SERVER_URL,
            username: process.env.TURN_USERNAME,
            credential: process.env.TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
};
