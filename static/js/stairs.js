// 3D view of the 100 lights spiraling down the stairwell, drawn on a
// canvas (adapted from the CSS simulator in the original client.js).
//
//   const stairs = new Stairs(element, {interactive: true});
//   stairs.setFrame(frame);  // NUM_LIGHTS * 4 numbers: r, g, b, a in 0-1

export const NUM_LIGHTS = 100;
const GAMMA = 0.33;

// The scene, in world units: the lights spiral around the z axis with
// this radius, and the camera looks from this distance (as with CSS
// perspective)
const RADIUS = 256;
const PERSPECTIVE = 2048;
const BULB_RADIUS = 13;
const GLOW_RADIUS = 47;
// The glow's opacity by distance from the center, as a fraction of
// GLOW_RADIUS, measured from the CSS box-shadow (0 0 28px 6px) that
// earlier versions used
const GLOW_STOPS = [[0, 1], [0.277, 0.45], [0.319, 0.41], [0.426, 0.31],
  [0.532, 0.21], [0.638, 0.125], [0.745, 0.07], [0.851, 0.03], [1, 0]];
const FLOOR_Z = -768;
const FLOOR_RADIUS = 384;

// A bulb before the first frame: dim and grey
const UNLIT = [130, 135, 160, 0.3];

// Styles live here rather than in site.css so the view also works on
// other sites, through client.js. Pages can set --stairs-bg to change
// the background.
const STYLES = `
.stairs {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: none;
  touch-action: pan-y;
  background: var(--stairs-bg,
    radial-gradient(ellipse at 50% 45%, #2e3249 0%, #151724 75%));
  cursor: grab;
}
.stairs.dragging {
  cursor: grabbing;
}
.stairs.static {
  cursor: inherit;
  touch-action: auto;
}
.stairs canvas {
  display: block;
  width: 100%;
  height: 100%;
}
`;

function addStyles() {
  if (!document.getElementById('blinken-stairs-styles')) {
    const style = document.createElement('style');
    style.id = 'blinken-stairs-styles';
    style.textContent = STYLES;
    document.head.append(style);
  }
}

export class Stairs {
  constructor(container, {interactive = true} = {}) {
    addStyles();
    this.view = document.createElement('div');
    this.view.className = 'stairs';
    this.canvas = document.createElement('canvas');
    this.view.append(this.canvas);
    container.append(this.view);
    this.ctx = this.canvas.getContext('2d');

    this.positions = [];
    for (let n = 0; n < NUM_LIGHTS; n++) {
      const angle = n / NUM_LIGHTS * 6 * Math.PI;
      this.positions.push([Math.sin(angle) * RADIUS,
        Math.cos(angle) * RADIUS, (n - NUM_LIGHTS / 2) * 15]);
    }
    this.colors = Array.from({length: NUM_LIGHTS}, () => UNLIT);
    this.xAngle = 90;
    this.zAngle = 0;
    this.depth = 0;
    this.pending = false;

    new ResizeObserver(() => this.resize()).observe(this.view);
    this.resize();
    if (interactive) {
      this.enableControls();
    } else {
      this.view.classList.add('static');
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Scale the strand (about 1725 by 540 units on screen) to fill the
    // view with a margin, whichever dimension limits it
    this.scale = Math.min(h / 2000, w / 760) * dpr;
    this.draw();
  }

  // Project a point in the world onto the canvas: [x, y, depth, size],
  // where size is how much perspective enlarges it
  project([x, y, z]) {
    const az = this.zAngle * Math.PI / 180;
    const ax = this.xAngle * Math.PI / 180;
    const x1 = x * Math.cos(az) - y * Math.sin(az);
    const y1 = x * Math.sin(az) + y * Math.cos(az);
    const y2 = y1 * Math.cos(ax) - z * Math.sin(ax);
    const z2 = y1 * Math.sin(ax) + z * Math.cos(ax) + this.depth;
    const size = PERSPECTIVE / (PERSPECTIVE - z2);
    return [this.canvas.width / 2 + x1 * this.scale * size,
      this.canvas.height / 2 + y2 * this.scale * size, z2, size];
  }

  // Draw on the next animation frame, at most once per frame
  draw() {
    if (!this.pending) {
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.render();
      });
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderFloor();

    // Farthest first, so nearer bulbs cover them
    const bulbs = this.positions.map((p, i) => [...this.project(p), i])
        .filter((b) => b[2] < PERSPECTIVE - 1)
        .sort((a, b) => a[2] - b[2]);
    for (const [x, y, , size, i] of bulbs) {
      const [r, g, b, a] = this.colors[i];
      const k = this.scale * size;
      const rgba = (alpha) => `rgba(${r},${g},${b},${a * alpha})`;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, GLOW_RADIUS * k);
      for (const [offset, alpha] of GLOW_STOPS) {
        glow.addColorStop(offset, rgba(alpha));
      }
      ctx.fillStyle = glow;
      ctx.fillRect(x - GLOW_RADIUS * k, y - GLOW_RADIUS * k,
          GLOW_RADIUS * k * 2, GLOW_RADIUS * k * 2);
      ctx.beginPath();
      ctx.arc(x, y, BULB_RADIUS * k, 0, 2 * Math.PI);
      ctx.fillStyle = rgba(1);
      ctx.fill();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.stroke();
    }
  }

  // A soft pool of light on the floor below the strand: a circle on the
  // floor, drawn as the ellipse it projects to
  renderFloor() {
    const [cx, cy] = this.project([0, 0, FLOOR_Z]);
    const [xx, xy] = this.project([FLOOR_RADIUS, 0, FLOOR_Z]);
    const [yx, yy] = this.project([0, FLOOR_RADIUS, FLOOR_Z]);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(xx - cx, xy - cy, yx - cx, yy - cy, cx, cy);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    pool.addColorStop(0, 'rgba(150,160,255,0.12)');
    pool.addColorStop(1, 'rgba(150,160,255,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  enableControls() {
    const view = this.view;
    let start = null;
    view.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) {
        return;
      }
      start = {x: e.clientX, y: e.clientY, xAngle: this.xAngle,
        zAngle: this.zAngle};
      view.setPointerCapture(e.pointerId);
      view.classList.add('dragging');
    });
    view.addEventListener('pointermove', (e) => {
      if (!start) {
        return;
      }
      this.zAngle = start.zAngle -
        (e.clientX - start.x) / view.clientWidth * 180;
      // On touch screens, vertical swipes scroll the page instead
      if (e.pointerType !== 'touch') {
        this.xAngle = Math.max(0, Math.min(180, start.xAngle -
          (e.clientY - start.y) / view.clientHeight * 180));
      }
      this.draw();
    });
    const end = () => {
      start = null;
      view.classList.remove('dragging');
    };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.depth = Math.max(-3000, Math.min(1500, this.depth - e.deltaY * 2));
      this.draw();
    }, {passive: false});
  }

  setFrame(frame) {
    for (let i = 0; i < NUM_LIGHTS; i++) {
      const a = clamp(frame[i * 4 + 3]);
      const c = (v) => Math.round(Math.pow(a * clamp(v), GAMMA) * 255);
      this.colors[i] = [c(frame[i * 4]), c(frame[i * 4 + 1]),
        c(frame[i * 4 + 2]), 1];
    }
    this.draw();
  }

  clear() {
    this.colors.fill(UNLIT);
    this.draw();
  }
}

// Decode a packet from the /api/0/stream WebSocket into a frame
export function decodePacket(data) {
  const bytes = new Uint8Array(data);
  const frame = new Float32Array(NUM_LIGHTS * 4);
  for (let i = 0; i < NUM_LIGHTS; i++) {
    const o = (NUM_LIGHTS - 1 - i) * 4;
    frame.set([bytes[o + 1] / 15, bytes[o + 2] / 15, bytes[o + 3] / 15,
      bytes[o] / 255], i * 4);
  }
  return frame;
}

function clamp(x) {
  return Math.min(1, Math.max(0, Number(x) || 0));
}
