/**
 * QuickDrop v1.0 - Main Application Server
 * High-performance, zero-storage signaling server built with Express & Socket.IO.
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { initSocketServer } from './socket.js';
import { roomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO Signaling Server
const io = initSocketServer(server);

// Security Headers with Helmet (Customized for WebRTC & CDN assets)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
        ],
        fontSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.gstatic.com',
          'data:',
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'http:',
          'https:',
        ],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: null,
      },
    },
    frameguard: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Compression Middleware (Gzip/Brotli)
app.use(compression());

// Global Rate Limiting: 100 requests / minute / IP
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau 1 phút.',
  },
});
app.use('/api/', limiter);

// Serve Static Frontend Assets
app.use(express.static(publicDir, {
  maxAge: config.env === 'production' ? '1d' : 0,
  etag: true,
}));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'QuickDrop',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    stats: roomManager.getStats(),
  });
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start Server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n\x1b[32m==================================================\x1b[0m`);
  console.log(`\x1b[1m\x1b[34m  🚀 QuickDrop v1.0 - In-Browser P2P File Transfer\x1b[0m`);
  console.log(`\x1b[32m==================================================\x1b[0m`);
  console.log(`  \x1b[36m• Server running at:\x1b[0m   http://localhost:${config.port}`);
  console.log(`  \x1b[36m• Environment:\x1b[0m         ${config.env}`);
  console.log(`  \x1b[36m• Zero file storage:\x1b[0m   Active (RAM signaling only)`);
  console.log(`  \x1b[36m• Room lifetime:\x1b[0m       ${config.roomTimeoutMs / 60000} minutes`);
  console.log(`  \x1b[36m• STUN Server:\x1b[0m         ${config.iceServers[0].urls[0]}`);
  console.log(`\x1b[32m==================================================\x1b[0m\n`);
});

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\n\x1b[33mReceived ${signal}. Shutting down QuickDrop gracefully...\x1b[0m`);
  io.close(() => {
    server.close(() => {
      console.log('\x1b[32mQuickDrop server closed. All memory cleaned up.\x1b[0m');
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export default app;
