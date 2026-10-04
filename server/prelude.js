// Code evaluated inside each show's QuickJS context before the show itself.
//
// It recreates the environment shows were written for: Bulb, a Blinken
// class whose run() captures the show's initializer, and enough of
// `window` for shows saved from jsbin. The host drives the show by
// evaluating __blinken.start() and __blinken.next(), which return JSON.

import fs from 'node:fs';

export const NUM_LIGHTS = 100;

const bulbSource = fs.readFileSync(
    new URL('../static/js/bulb.js', import.meta.url), 'utf8');

// Globals are properties of the global object rather than top-level
// const or class declarations, so shows can redeclare them freely
// (as they could under the old server).
const driverSource = `
globalThis.console = (() => {
  const format = (args) => args.map((a) => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a) ?? String(a);
    } catch (e) {
      return String(a);
    }
  }).join(' ');
  const make = (level) => (...args) => __log(level, format(args));
  return {log: make('log'), info: make('info'), debug: make('log'),
    warn: make('warn'), error: make('error')};
})();

const __Bulb = Bulb;
const __loadListeners = [];

globalThis.window = (() => {
  // jsbin's loop protection calls window.runnerWindow.protect.protect()
  const protect = function() {};
  protect.protect = () => false;
  return {
    runnerWindow: {protect},
    onload: null,
    addEventListener(type, fn) {
      if (type === 'load' || type === 'DOMContentLoaded') {
        __loadListeners.push(fn);
      }
    },
  };
})();

const __shows = [];

globalThis.Blinken = class Blinken {
  constructor(obj) {
    obj = obj || {};
    this.title = obj.title;
    this.author = obj.author;
    __shows.push(this);
  }
  run(fn) {
    this.fn = fn;
  }
  stop() {}
};

const __blinken = Object.freeze({
  lights: new Array(${NUM_LIGHTS}),
  step: [null],

  load() {
    if (typeof window.onload === 'function') {
      window.onload();
    }
    for (const fn of __loadListeners) {
      fn();
    }
  },

  start() {
    const show = __shows.filter((s) => typeof s.fn === 'function').pop();
    if (!show) {
      throw new Error('The code never called run() on a Blinken object');
    }
    this.fix();
    const step = show.fn(this.lights);
    this.step[0] = typeof step === 'function' ? step : null;
    return JSON.stringify({
      title: show.title, author: show.author,
      animated: this.step[0] !== null, frame: this.frame(),
    });
  },

  next() {
    this.fix();
    const delay = this.step[0](this.lights);
    return JSON.stringify({delay, frame: this.frame()});
  },

  fix() {
    const lights = this.lights;
    for (let i = 0; i < ${NUM_LIGHTS}; i++) {
      if (typeof lights[i] !== 'object' || !(lights[i] instanceof __Bulb)) {
        lights[i] = new __Bulb();
      }
    }
  },

  frame() {
    this.fix();
    const out = [];
    for (let i = 0; i < ${NUM_LIGHTS}; i++) {
      const l = this.lights[i];
      out.push(+l.r, +l.g, +l.b, +l.a);
    }
    return out;
  },
});
Object.defineProperty(globalThis, '__blinken', {value: __blinken});
`;

export const prelude = `
globalThis.Bulb = (() => {
${bulbSource}
return Bulb;
})();
{
${driverSource}
}
`;

// Shows published by the legacy client.js are the source of the
// initializer function alone; wrap them so they run like a full script.
// Like the old server, assign the code rather than parenthesizing it, so
// a trailing semicolon is allowed.
export function wrapLegacy(code) {
  return `globalThis.__legacyInit =\n${code}\n;\n` +
    'new Blinken().run(globalThis.__legacyInit);';
}
