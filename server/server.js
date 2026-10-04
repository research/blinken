#!/usr/bin/env node
// blinken.org server: API, show scheduler, and frame stream.
//
// Configuration (environment variables):
//   PORT, HOST              where to listen (default localhost:3000)
//   BLINKEN_DB              SQLite database path (default ./blinken.db)
//   BLINKEN_SITE_URL        public URL of the site (default https://blinken.org)
//   BLINKEN_ADMIN_USER      admin login; the admin API is disabled
//   BLINKEN_ADMIN_PASSWORD    unless both are set

import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createApp} from './app.js';
import {Db} from './db.js';
import {Scheduler} from './scheduler.js';
import {Strand} from './strand.js';

const env = process.env;
const host = env.HOST || 'localhost';
const port = Number(env.PORT || 3000);
const siteUrl = env.BLINKEN_SITE_URL || 'https://blinken.org';

const db = new Db(env.BLINKEN_DB || 'blinken.db');
const strand = new Strand();
const scheduler = new Scheduler({db, strand, siteUrl});

const app = createApp({
  db, scheduler, strand, siteUrl,
  adminUser: env.BLINKEN_ADMIN_USER,
  adminPassword: env.BLINKEN_ADMIN_PASSWORD,
  staticDir: fileURLToPath(new URL('../static', import.meta.url)),
});

const server = http.createServer(app);

// Anyone may watch the stream; the Pi drives the lights from it
const wss = new WebSocketServer({noServer: true, maxPayload: 1024});
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/api/0/stream') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    console.log('stream websocket',
        req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    strand.addStream(ws);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Is another blinken ` +
      'server running? Stop it, or set PORT to use a different port.');
    process.exit(1);
  }
  throw e;
});
server.listen(port, host, () => {
  console.log(`Listening on ${host}:${port}`);
});
scheduler.loop();
