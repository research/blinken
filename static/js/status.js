// Live status: what's playing, and a live view of the lights from the
// same stream the Pi uses.

import {api} from './api.js';
import {Stairs, decodePacket} from './stairs.js';

const $ = (id) => document.getElementById(id);
const stairs = new Stairs($('view'));

async function updateTitle() {
  try {
    const now = await api('/current');
    $('title').textContent = now.title || 'Untitled';
    $('author').textContent = now.author ? `by ${now.author}` : '';
    const link = $('link');
    if (/^https?:/.test(now.url || '')) {
      link.href = now.url;
    } else {
      link.removeAttribute('href');
    }
    const secs = Math.max(0, Math.round(now.time_left));
    $('time').textContent =
      `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} left`;
    setTimeout(updateTitle, 1000);
  } catch (e) {
    setTimeout(updateTitle, 5000);
  }
}

function connect() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${location.host}/api/0/stream`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    $('connection').textContent = '';
  };
  ws.onmessage = (e) => stairs.setFrame(decodePacket(e.data));
  ws.onclose = () => {
    $('connection').textContent = 'Reconnecting to the live view…';
    setTimeout(connect, 3000);
  };
}

updateTitle();
connect();
