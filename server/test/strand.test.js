import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {encode} from '../strand.js';
import {Db} from '../db.js';
import {Scheduler, RUNNING, DONE} from '../scheduler.js';

function frameOf(fn) {
  const f = [];
  for (let i = 0; i < 100; i++) f.push(...fn(i));
  return f;
}

test('encodes like the old server: last light first, power-limited', () => {
  // Mostly dark: no power scaling
  let packet = encode(frameOf((i) => i === 0 ? [1, 0.5, 0, 1] : [0, 0, 0, 1]));
  assert.deepEqual([...packet.subarray(396)], [255, 15, 8, 0]);
  assert.deepEqual([...packet.subarray(0, 4)], [255, 0, 0, 0]);
  // All white at full brightness is scaled to 55% power
  packet = encode(frameOf(() => [1, 1, 1, 1]));
  assert.equal(packet[0], Math.round(0.55 * 255));
  assert.equal(packet[1], 15);
});

test('scheduler plays queued jobs, then idles on gallery shows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinken-sched-'));
  const db = new Db(path.join(dir, 'test.db'));
  db.createShow({status: 'approved', title: 'Gallery',
    code: 'new Blinken().run((l) => () => 20);'});
  const frames = [];
  const scheduler = new Scheduler({db, strand: {show: (f) => frames.push(f)},
    log: {warn() {}}});
  const token = scheduler.submit({title: 'Job',
    script: 'new Blinken().run((l) => { let n = 0; return () => ++n < 5 ? 20 : -1; });'});
  scheduler.loop();
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(scheduler.status(token), {value: DONE, message: 'Completed'});
  assert.ok(frames.length >= 5);
  assert.equal(scheduler.nowPlaying().title, 'Gallery');
  assert.equal(scheduler.nowPlaying().is_idle, true);

  // Queueing a job interrupts the idle show
  const t2 = scheduler.submit({title: 'Second', script: 'new Blinken().run((l) => () => 20);'});
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(scheduler.status(t2).value, RUNNING);
  assert.equal(scheduler.nowPlaying().title, 'Second');
  scheduler.cancel(t2);
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(scheduler.status(t2), {value: DONE, message: 'Canceled'});
  scheduler.stop();
  await new Promise((r) => setTimeout(r, 400));
  db.close();
  fs.rmSync(dir, {recursive: true});
});
