// The live view: what's playing on the stairs, and the lights themselves
// from the same stream the Pi uses.

import {api} from './api.js';
import {decodePacket} from './stairs.js';

// Show the stream's frames on stairs, reconnecting when it drops.
// onConnection(connected) is called when the connection opens or closes.
export function watchLights(stairs, onConnection = () => {}) {
  const connect = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/api/0/stream`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => onConnection(true);
    ws.onmessage = (e) => stairs.setFrame(decodePacket(e.data));
    ws.onclose = () => {
      onConnection(false);
      setTimeout(connect, 3000);
    };
  };
  connect();
}

// Call fn({title, author, url, time_left}) every second with the show
// that's playing
export function watchCurrent(fn) {
  const update = async () => {
    try {
      fn(await api('/current'));
      setTimeout(update, 1000);
    } catch (e) {
      setTimeout(update, 5000);
    }
  };
  update();
}
