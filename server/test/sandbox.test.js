import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Show, ShowError, checkShow, wrapLegacy, NUM_LIGHTS} from '../sandbox.js';

const circus = fs.readFileSync(new URL('../idle.js', import.meta.url), 'utf8');

function bulb(frame, i) {
  return frame.slice(i * 4, i * 4 + 4);
}

test('runs a legacy show (initializer source only)', async () => {
  const show = await Show.start(wrapLegacy(circus));
  try {
    assert.equal(show.animated, true);
    assert.equal(show.frame.length, NUM_LIGHTS * 4);
    assert.deepEqual(bulb(show.frame, 0), [1, 0, 0, 1]);
    const res = await show.next();
    assert.equal(res.delay, 200);
    // Circus rotates the lights by one each step
    assert.deepEqual(bulb(res.frame, 1), [1, 0, 0, 1]);
  } finally {
    show.stop();
  }
});

test('runs a jsbin-style script with metadata and window.onload', async () => {
  const script = `
    window.onload = function() {
      var b = new Blinken({title: "Red", author: "Ann"});
      b.run(function(lights) {
        for (var i = 0; i < lights.length; i++) lights[i].rgb(1, 0, 0);
        return function() { console.log("step"); };
      });
    };
    if (window.runnerWindow.protect.protect({line: 1})) {}
  `;
  const show = await Show.start(script);
  try {
    assert.equal(show.title, 'Red');
    assert.equal(show.author, 'Ann');
    const res = await show.next();
    assert.equal(res.delay, 30);
    assert.deepEqual(res.logs, [{level: 'log', text: 'step'}]);
    assert.deepEqual(bulb(res.frame, 99), [1, 0, 0, 1]);
  } finally {
    show.stop();
  }
});

test('shows may redeclare sandbox globals', async () => {
  const script = `
    let window = {};
    const _limit = 3;
    function console() {}
    new Blinken().run((lights) => () => -1);
  `;
  const show = await Show.start(script);
  show.stop();
});

test('replaced or invalid bulbs are fixed up', async () => {
  const show = await Show.start(wrapLegacy(`(lights) => {
    lights[0] = 'nope'; lights[1] = new Bulb(2, -1, NaN, 0.5);
    return () => { lights.length = 3; return 5; };
  }`));
  try {
    assert.deepEqual(bulb(show.frame, 0), [0, 0, 0, 1]);
    assert.deepEqual(bulb(show.frame, 1), [1, 0, 0, 0.5]);
    const res = await show.next();
    assert.equal(res.delay, 10);  // clamped to the minimum
    assert.deepEqual(bulb(res.frame, 50), [0, 0, 0, 1]);
  } finally {
    show.stop();
  }
});

test('negative delay finishes the show; static shows have no steps', async () => {
  let show = await Show.start(wrapLegacy('(l) => () => -1'));
  assert.equal((await show.next()).delay, null);
  show.stop();
  show = await Show.start(wrapLegacy('(l) => { l[0].red(); }'));
  assert.equal(show.animated, false);
  assert.equal((await show.next()).delay, null);
  show.stop();
});

async function startError(script) {
  const err = await Show.start(script).then(
      (s) => {
        s.stop(); return null;
      }, (e) => e);
  assert.ok(err instanceof ShowError, `expected ShowError, got ${err}`);
  return err.message;
}

async function stepError(script) {
  const show = await Show.start(script);
  try {
    const err = await show.next().then(() => null, (e) => e);
    assert.ok(err instanceof ShowError, `expected ShowError, got ${err}`);
    return err.message;
  } finally {
    show.stop();
  }
}

test('reports syntax and runtime errors with line numbers', async () => {
  assert.match(await startError('new Blinken().run(\n(l) => {'), /SyntaxError/);
  assert.match(await startError('\n\nnope();'), /ReferenceError.*nope.*line 3/);
  assert.match(await startError('var x = 1;'), /never called run/);
  assert.match(await stepError(wrapLegacy('(l) => () => { l.x.y = 1; }')),
      /TypeError/);
});

test('stops infinite loops, runaway memory, and deep recursion', async () => {
  assert.match(await startError('while (true) {}'), /longer than 1000 ms/);
  assert.match(await stepError(wrapLegacy('(l) => () => { for (;;) {} }')),
      /longer than 100 ms/);
  assert.match(await startError(
      'const a = []; while (true) a.push(new Array(1e5).fill(1));'),
  /out of memory|longer than/);
  assert.match(await startError('function f() { f(); } f();'),
      /stack overflow/);
});

test('cannot reach the host', async () => {
  const probes = [
    'Bulb.constructor("return typeof process")()',
    'Blinken.constructor("return typeof require")()',
    'this.constructor.constructor("return typeof process")()',
    'typeof process + typeof require + typeof fetch + typeof setTimeout + ' +
      'typeof WebSocket + typeof __log',
  ];
  for (const probe of probes) {
    const show = await Show.start(
        `const r = ${probe}; console.log(r); new Blinken().run(() => {});`);
    assert.doesNotMatch(show.logs[0].text, /object|function[^ ]/, probe);
    show.stop();
  }
});

test('rejects oversized code', async () => {
  assert.match(await startError('x'.repeat(70 * 1024)), /too long/);
});

test('checkShow simulates a few seconds of steps', async () => {
  const res = await checkShow(
      'new Blinken({title: "T"}).run((l) => { let n = 0; ' +
      'return () => { if (++n === 3) console.log("three"); return 100; }; });');
  assert.equal(res.title, 'T');
  assert.deepEqual(res.logs, [{level: 'log', text: 'three'}]);
  await assert.rejects(
      checkShow(wrapLegacy('(l) => { let n = 0; ' +
        'return () => { if (++n > 20) throw new Error("late"); }; }')),
      /late/);
});
