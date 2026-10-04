// Turns frames into the strand's wire format and sends them to every
// stream client, including the Pi.
//
// Each packet is NUM_LIGHTS 4-byte words, last light first:
// brightness (0-255), red, green, blue (0-15 each).

import {NUM_LIGHTS} from './sandbox.js';

// Average power limit, empirically determined by a red/white
// alternation test
const MAX_POWER = 0.55;

// Skip clients more than this many packets behind instead of queueing
const MAX_STREAM_BACKLOG = 4 * NUM_LIGHTS * 4;

export function encode(frame) {
  let power = 0;
  for (let i = 0; i < NUM_LIGHTS; i++) {
    const [r, g, b, a] = frame.slice(i * 4, i * 4 + 4);
    power += (r + g + b) * a / 3;
  }
  power /= NUM_LIGHTS;
  const scale = power > MAX_POWER ? MAX_POWER / power : 1;

  const packet = Buffer.alloc(NUM_LIGHTS * 4);
  for (let i = 0; i < NUM_LIGHTS; i++) {
    const [r, g, b, a] = frame.slice(i * 4, i * 4 + 4);
    const o = (NUM_LIGHTS - 1 - i) * 4;
    packet[o] = Math.round(scale * a * 255);
    packet[o + 1] = Math.round(r * 15);
    packet[o + 2] = Math.round(g * 15);
    packet[o + 3] = Math.round(b * 15);
  }
  return packet;
}

export class Strand {
  constructor() {
    this.streams = new Set();
    this.packet = null;
  }

  addStream(ws) {
    this.streams.add(ws);
    ws.on('close', () => this.streams.delete(ws));
    if (this.packet) {
      ws.send(this.packet);
    }
  }

  show(frame) {
    this.packet = encode(frame);
    for (const ws of this.streams) {
      if (ws.readyState === ws.OPEN &&
          ws.bufferedAmount < MAX_STREAM_BACKLOG) {
        ws.send(this.packet);
      }
    }
  }
}
