// Worker thread that runs one show inside a QuickJS (WebAssembly) context.
//
// Show code can reach only what the prelude defines: no Node APIs, no
// network, no timers. Each evaluation has a deadline, and the context
// has fixed memory and stack limits. The main thread talks to this worker
// through sandbox.js and terminates it when the show ends.

import {parentPort} from 'node:worker_threads';
import {getQuickJS, shouldInterruptAfterDeadline} from 'quickjs-emscripten';
import {prelude} from './prelude.js';

const MEMORY_LIMIT = 32 * 1024 * 1024;
// Small enough that QuickJS reports a stack overflow before the
// WebAssembly stack itself overflows
const STACK_LIMIT = 256 * 1024;
const MAX_LOG_LINES = 100;
const MAX_LOG_LENGTH = 1000;

const QuickJS = await getQuickJS();
const runtime = QuickJS.newRuntime();
runtime.setMemoryLimit(MEMORY_LIMIT);
runtime.setMaxStackSize(STACK_LIMIT);
const vm = runtime.newContext();

let logs = [];
let droppedLogs = 0;

const logFn = vm.newFunction('__log', (levelHandle, textHandle) => {
  if (logs.length >= MAX_LOG_LINES) {
    droppedLogs++;
    return;
  }
  const level = vm.getString(levelHandle);
  const text = vm.getString(textHandle).slice(0, MAX_LOG_LENGTH);
  logs.push({level, text});
});
vm.setProp(vm.global, '__log', logFn);
logFn.dispose();

vm.unwrapResult(vm.evalCode(prelude, 'prelude.js')).dispose();

function takeLogs() {
  const out = logs;
  if (droppedLogs) {
    out.push({level: 'warn', text: `(${droppedLogs} more lines not shown)`});
  }
  logs = [];
  droppedLogs = 0;
  return out;
}

class ShowError extends Error {}

// Evaluate code with a deadline, returning the result as a JS value
function evaluate(code, filename, timeoutMs) {
  runtime.setInterruptHandler(
      shouldInterruptAfterDeadline(Date.now() + timeoutMs));
  const result = vm.evalCode(code, filename);
  runtime.removeInterruptHandler();
  if (result.error) {
    const err = vm.dump(result.error);
    result.error.dispose();
    throw new ShowError(describeError(err, timeoutMs));
  }
  const value = vm.dump(result.value);
  result.value.dispose();
  return value;
}

function describeError(err, timeoutMs) {
  if (typeof err !== 'object' || err === null) {
    return `Uncaught ${String(err)}`;
  }
  if (err.message === 'interrupted') {
    return `Took longer than ${timeoutMs} ms`;
  }
  let text = err.name ? `${err.name}: ${err.message}` : String(err.message);
  // Point at the first frame in the show's own code
  const where = /show\.js:(\d+):(\d+)/.exec(err.stack || '');
  if (where) {
    text += ` (line ${where[1]})`;
  }
  return text;
}

const handlers = {
  start({script, timeoutMs}) {
    evaluate(script, 'show.js', timeoutMs);
    evaluate('__blinken.load()', 'load.js', timeoutMs);
    return JSON.parse(evaluate('__blinken.start()', 'start.js', timeoutMs));
  },
  next({timeoutMs}) {
    return JSON.parse(evaluate('__blinken.next()', 'step.js', timeoutMs));
  },
};

parentPort.on('message', (msg) => {
  let reply;
  try {
    reply = {ok: true, value: handlers[msg.type](msg)};
  } catch (e) {
    if (!(e instanceof ShowError) && !(e instanceof SyntaxError)) {
      // Something went wrong in the engine itself; let the main
      // thread see the worker die and clean up
      throw e;
    }
    reply = {ok: false, error: e.message};
  }
  reply.logs = takeLogs();
  parentPort.postMessage(reply);
});

parentPort.postMessage({ready: true});
