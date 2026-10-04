// 3D view of the 100 lights spiraling down the stairwell, drawn with CSS
// transforms (adapted from the simulator in client.js).
//
//   const stairs = new Stairs(element, {interactive: true});
//   stairs.setFrame(frame);  // NUM_LIGHTS * 4 numbers: r, g, b, a in 0-1

export const NUM_LIGHTS = 100;
const GAMMA = 0.33;

// Styles live here rather than in site.css so the view also works on
// other sites, through client.js. Pages can set --stairs-bg and
// --stairs-floor to change the colors.
const STYLES = `
.stairs {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: none;
  touch-action: none;
  perspective: 2048px;
  background: var(--stairs-bg, #ececef);
  cursor: grab;
}
.stairs.dragging {
  cursor: grabbing;
}
.stairs.static {
  cursor: inherit;
  touch-action: auto;
}
.stairs-scale, .stairs-world {
  position: absolute;
  width: 512px;
  height: 512px;
  left: 50%;
  top: 50%;
  margin: -256px 0 0 -256px;
  transform-style: preserve-3d;
}
.stairs-floor {
  position: absolute;
  width: 768px;
  height: 768px;
  left: -128px;
  top: -128px;
  background: var(--stairs-floor, rgba(190, 190, 198, 0.5));
  transform: translateZ(-768px);
}
.stairs-holder {
  position: absolute;
  left: 256px;
  top: 256px;
  transform-style: preserve-3d;
}
.stairs-light {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  background-color: rgba(127, 127, 127, 0.5);
  border: 0.5px solid rgba(0, 0, 0, 0.6);
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
    this.container = container;
    const view = el('div', 'stairs');
    const scale = el('div', 'stairs-scale');
    const world = el('div', 'stairs-world');
    const floor = el('div', 'stairs-floor');
    view.append(scale);
    scale.append(world);
    world.append(floor);
    container.append(view);

    this.lights = [];
    for (let n = 0; n < NUM_LIGHTS; n++) {
      const x = Math.sin(n / NUM_LIGHTS * 6 * Math.PI) * 256;
      const y = Math.cos(n / NUM_LIGHTS * 6 * Math.PI) * 256;
      const z = (n - NUM_LIGHTS / 2) * 15;
      const holder = el('div', 'stairs-holder');
      holder.style.transform =
        `translate3d(${x.toFixed(4)}px,${y.toFixed(4)}px,${z.toFixed(4)}px)`;
      const light = el('div', 'stairs-light');
      holder.append(light);
      world.append(holder);
      this.lights.push(light);
    }

    this.view = view;
    this.scale = scale;
    this.world = world;
    this.xAngle = 90;
    this.zAngle = 0;
    this.depth = 0;

    new ResizeObserver(() => this.fit()).observe(view);
    this.fit();
    this.update();
    if (interactive) {
      this.enableControls();
    } else {
      view.classList.add('static');
    }
  }

  fit() {
    const s = this.view.clientHeight / (4 * 512);
    this.scale.style.transform = `scale(${s.toFixed(4)})`;
  }

  update() {
    this.world.style.transform = `translateZ(${this.depth.toFixed(4)}px) ` +
      `rotateX(${this.xAngle.toFixed(4)}deg) rotateZ(${this.zAngle.toFixed(4)}deg)`;
    // Keep the lights facing the viewer
    const face = `rotateZ(${(-this.zAngle).toFixed(4)}deg) ` +
      `rotateX(${(-this.xAngle).toFixed(4)}deg)`;
    for (const light of this.lights) {
      light.style.transform = face;
    }
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
      this.xAngle = Math.max(0, Math.min(180, start.xAngle -
        (e.clientY - start.y) / view.clientHeight * 180));
      this.update();
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
      this.update();
    }, {passive: false});
  }

  setFrame(frame) {
    for (let i = 0; i < NUM_LIGHTS; i++) {
      const a = clamp(frame[i * 4 + 3]);
      const c = (v) => Math.round(Math.pow(a * clamp(v), GAMMA) * 255);
      this.lights[i].style.backgroundColor =
        `rgb(${c(frame[i * 4])},${c(frame[i * 4 + 1])},${c(frame[i * 4 + 2])})`;
    }
  }

  clear() {
    for (const light of this.lights) {
      light.style.backgroundColor = '';
    }
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

function el(tag, className) {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function clamp(x) {
  return Math.min(1, Math.max(0, Number(x) || 0));
}
