// Runs inside /sandbox.html, which pages load in an iframe with
// sandbox="allow-scripts". The iframe has an opaque origin, so show code
// can't read this site's cookies or call its API as the visitor.
//
// Each show runs in its own Web Worker, which can be killed if a step
// never returns. The worker mimics the environment on the stairs: Bulb,
// Blinken, and a stub `window`, without timers, network, or the DOM.
//
// Messages from the page: {id, type: 'start', code} and {id, type: 'stop'}.
// Messages to the page: {id, type: 'started' | 'frame' | 'log' | 'error' |
// 'done', ...} and {type: 'ready'} once loaded.

/* global Bulb */
(() => {
  // Limits on the stairs, and how long to wait past them before
  // assuming a show is stuck
  const START_LIMIT_MS = 1000;
  const STEP_LIMIT_MS = 100;
  const WATCHDOG_MS = 3000;

  // Runs inside the worker
  function workerMain(START_LIMIT_MS, STEP_LIMIT_MS) {
    const NUM_LIGHTS = 100;
    const MAX_LOGS_PER_STEP = 20;
    const post = self.postMessage.bind(self);
    const later = self.setTimeout.bind(self);
    const load = self.importScripts.bind(self);
    const now = performance.now.bind(performance);
    const Bulb = self.Bulb;

    let logCount = 0;
    const format = (args) => args.map((a) => {
      if (typeof a === 'string') {
        return a;
      }
      try {
        return JSON.stringify(a) ?? String(a);
      } catch (e) {
        return String(a);
      }
    }).join(' ').slice(0, 1000);
    const logger = (level) => (...args) => {
      if (++logCount <= MAX_LOGS_PER_STEP) {
        post({type: 'log', level, text: format(args)});
      } else if (logCount === MAX_LOGS_PER_STEP + 1) {
        post({type: 'log', level: 'warn', text: '(more output not shown)'});
      }
    };

    const shows = [];
    const loadListeners = [];
    const protect = function() {};
    protect.protect = () => false;

    self.window = {
      runnerWindow: {protect},
      onload: null,
      addEventListener(type, fn) {
        if (type === 'load' || type === 'DOMContentLoaded') {
          loadListeners.push(fn);
        }
      },
    };
    self.Blinken = class Blinken {
      constructor(obj) {
        obj = obj || {};
        this.title = obj.title;
        this.author = obj.author;
        shows.push(this);
      }
      run(fn) {
        this.fn = fn;
      }
      stop() {}
    };
    self.console = {log: logger('log'), info: logger('info'),
      debug: logger('log'), warn: logger('warn'), error: logger('error')};
    // Hide what the stairs don't have, so shows that depend on it fail
    // here rather than on the stairs
    for (const name of ['fetch', 'XMLHttpRequest', 'importScripts',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'requestAnimationFrame', 'WebSocket', 'EventSource', 'postMessage',
      'close', 'indexedDB', 'caches']) {
      self[name] = undefined;
    }

    let codeUrl = null;
    function describe(e) {
      if (!(e instanceof Error)) {
        return `Uncaught ${String(e)}`;
      }
      const message = e.message.replace(
          /^Failed to execute 'importScripts' on 'WorkerGlobalScope': /, '');
      let text = `${e.name}: ${message}`;
      // Point at the first frame in the show's own code
      const at = codeUrl && (e.stack || '').indexOf(codeUrl + ':');
      if (at >= 0) {
        text += ` (line ${parseInt(e.stack.slice(at + codeUrl.length + 1))})`;
      }
      return text;
    }

    const lights = new Array(NUM_LIGHTS);
    function fix() {
      for (let i = 0; i < NUM_LIGHTS; i++) {
        if (typeof lights[i] !== 'object' || !(lights[i] instanceof Bulb)) {
          lights[i] = new Bulb();
        }
      }
    }
    function frame() {
      fix();
      const out = new Float32Array(NUM_LIGHTS * 4);
      for (let i = 0; i < NUM_LIGHTS; i++) {
        const l = lights[i];
        out.set([+l.r, +l.g, +l.b, +l.a].map(
            (v) => Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0),
        i * 4);
      }
      return out;
    }
    function warnSlow(what, ms, limit) {
      post({type: 'log', level: 'warn', text:
        `${what} took ${Math.round(ms)} ms. On the stairs, anything over ` +
        `${limit} ms is stopped.`});
    }

    let step = null;
    let warnedSlow = false;
    function runStep() {
      logCount = 0;
      let delay;
      const t0 = now();
      try {
        fix();
        delay = step(lights);
      } catch (e) {
        post({type: 'error', message: describe(e)});
        return;
      }
      const ms = now() - t0;
      if (ms > STEP_LIMIT_MS && !warnedSlow) {
        warnedSlow = true;
        warnSlow('A step', ms, STEP_LIMIT_MS);
      }
      if (typeof delay !== 'number' || Number.isNaN(delay)) {
        delay = 30;
      }
      const f = frame();
      if (delay < 0) {
        post({type: 'frame', frame: f, delay: null}, [f.buffer]);
        post({type: 'done'});
        return;
      }
      delay = Math.min(Math.max(delay, 10), 60000);
      post({type: 'frame', frame: f, delay}, [f.buffer]);
      later(runStep, delay);
    }

    self.onmessage = (e) => {
      self.onmessage = null;
      const t0 = now();
      try {
        codeUrl = URL.createObjectURL(
            new Blob([e.data.code], {type: 'text/javascript'}));
        load(codeUrl);
        if (typeof self.window.onload === 'function') {
          self.window.onload();
        }
        for (const fn of loadListeners) {
          fn();
        }
        const show = shows.filter((s) => typeof s.fn === 'function').pop();
        if (!show) {
          throw new Error('The code never called run() on a Blinken object');
        }
        fix();
        const result = show.fn(lights);
        step = typeof result === 'function' ? result : null;
        const ms = now() - t0;
        if (ms > START_LIMIT_MS) {
          warnSlow('Starting the show', ms, START_LIMIT_MS);
        }
        const f = frame();
        post({type: 'started', frame: f, animated: step !== null,
          title: typeof show.title === 'string' ? show.title : '',
          author: typeof show.author === 'string' ? show.author : ''},
        [f.buffer]);
      } catch (e) {
        post({type: 'error', message: describe(e)});
        return;
      }
      if (step) {
        later(runStep, 0);
      }
    };
  }

  const workerSource =
    `self.Bulb = (() => {\n${Bulb.toString()}\nreturn Bulb;\n})();\n` +
    `(${workerMain.toString()})(${START_LIMIT_MS}, ${STEP_LIMIT_MS});\n`;
  const workerUrl = URL.createObjectURL(
      new Blob([workerSource], {type: 'text/javascript'}));

  const sessions = new Map();

  function send(id, msg, transfer) {
    parent.postMessage({...msg, id}, '*', transfer);
  }

  function stop(id) {
    const s = sessions.get(id);
    if (s) {
      clearTimeout(s.timer);
      s.worker.terminate();
      sessions.delete(id);
    }
  }

  // Kill the worker if it doesn't answer in time
  function arm(id, ms) {
    const s = sessions.get(id);
    clearTimeout(s.timer);
    if (ms !== null) {
      s.timer = setTimeout(() => {
        stop(id);
        send(id, {type: 'error', message:
          'The show stopped responding (is there an infinite loop?)'});
      }, ms + WATCHDOG_MS);
    }
  }

  function start(id, code) {
    stop(id);
    const worker = new Worker(workerUrl);
    sessions.set(id, {worker, timer: null});
    arm(id, START_LIMIT_MS);
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'started') {
        arm(id, msg.animated ? STEP_LIMIT_MS : null);
      } else if (msg.type === 'frame') {
        arm(id, msg.delay === null ? null : msg.delay + STEP_LIMIT_MS);
      }
      send(id, msg, msg.frame ? [msg.frame.buffer] : []);
      if (msg.type === 'error' || msg.type === 'done') {
        stop(id);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      stop(id);
      send(id, {type: 'error', message: e.message || 'Error'});
    };
    worker.postMessage({code});
  }

  window.addEventListener('message', (e) => {
    if (e.source !== parent || typeof e.data !== 'object') {
      return;
    }
    const {id, type, code} = e.data;
    if (type === 'start' && typeof code === 'string') {
      start(id, code);
    } else if (type === 'stop') {
      stop(id);
    }
  });

  send(undefined, {type: 'ready'});
})();
