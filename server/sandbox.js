// Runs untrusted show code in a QuickJS sandbox on a worker thread.
//
//   const show = await Show.start(script);   // title, author, frame
//   const {delay, frame} = await show.next();
//   show.stop();
//
// Frames are arrays of NUM_LIGHTS * 4 numbers (r, g, b, a per light).

import {Worker} from 'node:worker_threads';
import {NUM_LIGHTS, wrapLegacy} from './prelude.js';

export {NUM_LIGHTS, wrapLegacy};

export const MAX_CODE_LENGTH = 64 * 1024;

const START_TIMEOUT_MS = 1000;   // loading the script and initializing
const STEP_TIMEOUT_MS = 100;     // each call to the step function
const DEFAULT_DELAY_MS = 30;
const MIN_DELAY_MS = 10;
const MAX_DELAY_MS = 60 * 1000;
// If the worker doesn't answer within this much longer than the
// QuickJS deadline, assume the engine is stuck and kill it
const WATCHDOG_SLACK_MS = 3000;

export class ShowError extends Error {
  constructor(message, logs = []) {
    super(message);
    this.logs = logs;
  }
}

export class Show {
  static async start(script) {
    if (typeof script !== 'string') {
      throw new ShowError('No code given');
    }
    if (script.length > MAX_CODE_LENGTH) {
      throw new ShowError(
          `Code is too long (limit ${MAX_CODE_LENGTH / 1024} KB)`);
    }
    const show = new Show();
    try {
      await show.ready;
      const res = await show.request(
          {type: 'start', script, timeoutMs: START_TIMEOUT_MS});
      return Object.assign(show, {
        title: cleanText(res.title),
        author: cleanText(res.author),
        animated: res.animated === true,
        frame: cleanFrame(res.frame),
        logs: res.logs,
      });
    } catch (e) {
      show.stop();
      throw e;
    }
  }

  constructor() {
    this.worker = new Worker(new URL('./sandbox-worker.js', import.meta.url));
    this.pending = null;
    this.stopped = false;
    this.ready = new Promise((resolve, reject) => {
      this.pending = {resolve, reject, ready: true};
    });
    this.worker.on('message', (msg) => this.onMessage(msg));
    this.worker.on('error', (e) => this.fail(`Sandbox failed: ${e.message}`));
    this.worker.on('exit', () => this.fail('Sandbox stopped'));
  }

  onMessage(msg) {
    const pending = this.pending;
    this.pending = null;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    if (pending.ready) {
      pending.resolve();
    } else if (msg.ok) {
      pending.resolve({...msg.value, logs: msg.logs});
    } else {
      pending.reject(new ShowError(msg.error, msg.logs));
    }
  }

  fail(message) {
    const pending = this.pending;
    this.pending = null;
    this.stop();
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new ShowError(message));
    }
  }

  request(msg) {
    if (this.stopped) {
      return Promise.reject(new ShowError('Show was stopped'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(`Took longer than ${msg.timeoutMs} ms`);
      }, msg.timeoutMs + WATCHDOG_SLACK_MS);
      this.pending = {resolve, reject, timer};
      this.worker.postMessage(msg);
    });
  }

  // Run one step. Returns {delay, frame, logs}, with delay null when the
  // show has finished.
  async next() {
    if (!this.animated) {
      return {delay: null, frame: this.frame, logs: []};
    }
    const res = await this.request({type: 'next', timeoutMs: STEP_TIMEOUT_MS});
    return {delay: cleanDelay(res.delay), frame: cleanFrame(res.frame),
      logs: res.logs};
  }

  stop() {
    if (!this.stopped) {
      this.stopped = true;
      this.worker.terminate();
    }
  }
}

// Run a show without waiting between steps to check that it works:
// it must initialize and run through `simulateMs` of steps (or finish)
// without errors. Returns {title, author, logs}; throws ShowError.
export async function checkShow(script, {simulateMs = 5000, maxSteps = 500} = {}) {
  const show = await Show.start(script);
  const logs = [...show.logs];
  try {
    let elapsed = 0;
    for (let i = 0; i < maxSteps && elapsed < simulateMs; i++) {
      let res;
      try {
        res = await show.next();
      } catch (e) {
        e.logs = [...logs, ...e.logs];
        throw e;
      }
      logs.push(...res.logs);
      if (res.delay === null) {
        break;
      }
      elapsed += res.delay;
    }
    return {title: show.title, author: show.author, logs};
  } finally {
    show.stop();
  }
}

function cleanText(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.slice(0, 200);
}

function cleanDelay(delay) {
  if (typeof delay !== 'number' || Number.isNaN(delay)) {
    return DEFAULT_DELAY_MS;
  }
  if (delay < 0) {
    return null;
  }
  return Math.min(Math.max(delay, MIN_DELAY_MS), MAX_DELAY_MS);
}

function cleanFrame(frame) {
  const out = new Array(NUM_LIGHTS * 4).fill(0);
  if (Array.isArray(frame)) {
    for (let i = 0; i < out.length; i++) {
      const v = frame[i];
      out[i] = typeof v === 'number' && Number.isFinite(v) ?
        Math.min(Math.max(v, 0), 1) : 0;
    }
  }
  return out;
}
