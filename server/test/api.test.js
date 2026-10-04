import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../app.js';
import {Db} from '../db.js';
import {Scheduler, QUEUED} from '../scheduler.js';

const SITE = 'https://blinken.example';
const GOOD = 'new Blinken({title: "Good", author: "Ann"}).run((l) => () => 50);';
let dir; let db; let scheduler; let server; let base;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinken-test-'));
  db = new Db(path.join(dir, 'test.db'));
  scheduler = new Scheduler({db, strand: {show() {}}, siteUrl: SITE});
  const app = createApp({db, scheduler, siteUrl: SITE, adminUser: 'admin',
    adminPassword: 'pw:with:colons', log: false});
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/0`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(dir, {recursive: true});
});

function api(p, {method, body, headers = {}, auth} = {}) {
  method ??= body === undefined ? 'GET' : 'POST';
  const h = {...headers};
  if (body !== undefined) {
    h['Content-Type'] ??= 'application/json';
  }
  if (auth) {
    h.Authorization = 'Basic ' + Buffer.from(auth).toString('base64');
  }
  return fetch(base + p, {method, headers: h,
    body: body === undefined ? undefined :
      typeof body === 'string' ? body : JSON.stringify(body)});
}

const ADMIN = 'admin:pw:with:colons';

test('legacy publish, status, and cancel', async () => {
  let res = await api('/publish', {body: {code: '(l) => () => 50',
    url: 'javascript:alert(1)', title: 'Legacy'}});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const token = await res.text();
  assert.match(token, /^[0-9a-f]{32}$/);
  const job = scheduler.jobs.get(token);
  assert.equal(job.title, 'Legacy');
  assert.equal(job.url, '');  // non-http URLs are dropped

  res = await api(`/status/${token}`);
  assert.equal((await res.json()).value, QUEUED);
  res = await api(`/cancel/${token}`, {method: 'POST'});
  assert.equal(res.status, 200);
  assert.deepEqual(await (await api(`/status/${token}`)).json(),
      {value: 0, message: 'Canceled'});

  res = await api('/publish', {body: {code: '(l) => { nope(); }'}});
  assert.equal(res.status, 400);
  assert.match(await res.text(), /ReferenceError/);
});

test('run from the playground saves a snippet and reports errors', async () => {
  let res = await api('/run', {body: {code: GOOD}});
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.title, 'Good');
  const id = new URL(out.url).searchParams.get('id');
  assert.equal((await (await api(`/snippets/${id}`)).json()).code, GOOD);

  res = await api('/run', {body: {code: 'console.log("hi"); x.y;'}});
  assert.equal(res.status, 422);
  const err = await res.json();
  assert.match(err.error, /ReferenceError/);
  assert.deepEqual(err.logs, [{level: 'log', text: 'hi'}]);
});

test('state-changing endpoints refuse cross-site and non-JSON requests', async () => {
  let res = await api('/run', {body: {code: GOOD},
    headers: {Origin: 'https://evil.example'}});
  assert.equal(res.status, 403);
  res = await api('/run', {body: 'code=x',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'}});
  assert.equal(res.status, 415);
  res = await api('/run', {body: {code: GOOD}, headers: {Origin: SITE}});
  assert.equal(res.status, 200);
  // Same-origin requests work at any address, not just the site URL
  res = await api('/run', {body: {code: GOOD},
    headers: {Origin: new URL(base).origin}});
  assert.equal(res.status, 200);
});

test('submissions are reviewed before appearing in the gallery', async () => {
  let res = await api('/submissions', {body: {code: GOOD,
    description: 'A good show'}});
  const {id} = await res.json();
  assert.equal((await (await api('/shows')).json()).shows.length, 0);
  assert.equal((await api(`/shows/${id}`)).status, 404);

  assert.equal((await api('/admin/shows')).status, 401);
  assert.equal((await api('/admin/shows', {auth: 'admin:wrong'})).status, 401);
  res = await api('/admin/shows', {auth: ADMIN});
  const pending = await res.json();
  assert.equal(pending.shows[0].title, 'Good');
  assert.equal(pending.counts.pending, 1);

  res = await api(`/admin/shows/${id}`, {method: 'PATCH', auth: ADMIN,
    body: {status: 'approved', title: 'Better', note: 'nice'}});
  assert.equal((await res.json()).note, 'nice');

  const shows = (await (await api('/shows')).json()).shows;
  assert.equal(shows.length, 1);
  assert.equal(shows[0].title, 'Better');
  assert.equal(shows[0].note, undefined);
  assert.equal((await (await api(`/shows/${id}`)).json()).code, GOOD);
  assert.equal((await api('/random')).status, 200);

  res = await api('/submissions', {body: {code: 'nope();'}});
  assert.equal(res.status, 422);

  // A name is required, and the example's placeholder doesn't count
  for (const body of [
    {code: 'new Blinken({title: "T"}).run((l) => () => 50);'},
    {code: 'new Blinken({title: "T", author: "Your Name"}).run((l) => () => 50);'},
    {code: GOOD, author: ' your name '},
  ]) {
    res = await api('/submissions', {body});
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).error, 'Please enter your name');
  }
});

test('votes are one per voter and can be changed', async () => {
  const id = db.createShow({code: GOOD, title: 'Votable', status: 'approved'});
  let res = await api(`/shows/${id}/vote`, {body: {value: 1}});
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /voter=[0-9a-f]{32}; Max-Age=\d+; Path=\/api\/0; .*HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await res.json()).up, 1);
  const voter = cookie.split(';')[0];

  res = await api(`/shows/${id}/vote`, {body: {value: 1}, headers: {Cookie: voter}});
  let show = await res.json();
  assert.deepEqual([show.up, show.down, show.myVote], [1, 0, 1]);
  res = await api(`/shows/${id}/vote`, {body: {value: -1}, headers: {Cookie: voter}});
  show = await res.json();
  assert.deepEqual([show.up, show.down, show.myVote], [0, 1, -1]);
  // A different voter
  res = await api(`/shows/${id}/vote`, {body: {value: 1}});
  show = await res.json();
  assert.deepEqual([show.up, show.down, show.myVote], [1, 1, 1]);
  res = await api(`/shows/${id}/vote`, {body: {value: 0}, headers: {Cookie: voter}});
  assert.deepEqual([(await res.json()).down], [0]);

  assert.equal((await api(`/shows/${id}/vote`, {body: {value: 5}})).status, 400);
  const pendingId = db.createShow({code: GOOD, title: 'Pending'});
  assert.equal((await api(`/shows/${pendingId}/vote`, {body: {value: 1}})).status, 404);
});

test('gallery sorts by Wilson score', async () => {
  const a = db.createShow({code: GOOD, title: 'Few', status: 'approved'});
  const b = db.createShow({code: GOOD, title: 'Many', status: 'approved'});
  for (let i = 0; i < 3; i++) db.vote(a, `a${i}`, 1);
  for (let i = 0; i < 40; i++) db.vote(b, `b${i}`, 1);
  for (let i = 0; i < 5; i++) db.vote(b, `c${i}`, -1);
  const titles = (await (await api('/shows')).json()).shows.map((s) => s.title);
  assert.ok(titles.indexOf('Many') < titles.indexOf('Few'));
});

test('admin can run any show first and delete shows', async () => {
  const id = db.createShow({code: GOOD, title: 'Urgent', status: 'rejected'});
  scheduler.submit({script: GOOD});
  const res = await api(`/admin/shows/${id}/run`, {method: 'POST',
    auth: ADMIN, body: {}});
  const {token} = await res.json();
  assert.equal(scheduler.queue[0], token);
  assert.equal((await api(`/admin/shows/${id}`, {method: 'DELETE',
    auth: ADMIN})).status, 204);
  assert.equal((await api(`/admin/shows/${id}`, {auth: ADMIN})).status, 404);
});

test('admins can edit code, submission date, and vote totals', async () => {
  const id = db.createShow({code: GOOD, title: 'Editable', status: 'approved'});
  db.vote(id, 'v1', 1);
  db.vote(id, 'v2', -1);

  let res = await api(`/admin/shows/${id}`, {method: 'PATCH', auth: ADMIN,
    body: {up: 10, down: 3, created: '2015-12-01T12:00:00Z',
      code: 'new Blinken({title: "Edited"}).run((l) => () => 100);'}});
  let show = await res.json();
  assert.deepEqual([show.up, show.down], [10, 3]);
  assert.equal(show.created, Date.parse('2015-12-01T12:00:00Z'));
  assert.match(show.code, /Edited/);

  // New votes add to the adjusted totals
  db.vote(id, 'v3', 1);
  db.vote(id, 'v2', 1);  // changes a down vote to up
  show = db.getShow(id);
  assert.deepEqual([show.up, show.down], [12, 2]);

  // Broken code is saved along with the other edits, with a warning
  res = await api(`/admin/shows/${id}`, {method: 'PATCH', auth: ADMIN,
    body: {code: 'nope();', title: 'Renamed too'}});
  show = await res.json();
  assert.equal(res.status, 200);
  assert.match(show.warning, /doesn't run on the stairs: ReferenceError/);
  assert.deepEqual([show.code, show.title], ['nope();', 'Renamed too']);
  // Unchanged broken code doesn't warn again
  res = await api(`/admin/shows/${id}`, {method: 'PATCH', auth: ADMIN,
    body: {code: 'nope();', title: 'Again'}});
  assert.equal((await res.json()).warning, undefined);
  const broken = db.createShow({code: 'nope();', title: 'Broken', status: 'hidden'});
  res = await api(`/admin/shows/${broken}`, {method: 'PATCH', auth: ADMIN,
    body: {code: 'nope();', title: 'Still broken'}});
  assert.equal((await res.json()).title, 'Still broken');
  // ...including when the editor changed its line endings
  const crlf = db.createShow({code: '// x\r\nnope();\r\n', title: 'CRLF',
    status: 'hidden'});
  res = await api(`/admin/shows/${crlf}`, {method: 'PATCH', auth: ADMIN,
    body: {code: '// x\nnope();\n', title: 'CRLF renamed'}});
  assert.equal((await res.json()).title, 'CRLF renamed');

  for (const body of [{up: -1}, {down: 1.5}, {created: 'not a date'}]) {
    res = await api(`/admin/shows/${id}`, {method: 'PATCH', auth: ADMIN, body});
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('older databases gain the vote offset columns', async () => {
  const file = path.join(dir, 'old.db');
  const {DatabaseSync} = await import('node:sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE shows (id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, reviewed INTEGER,
    up INTEGER NOT NULL DEFAULT 0, down INTEGER NOT NULL DEFAULT 0)`);
  old.close();
  const migrated = new Db(file);
  const id = migrated.createShow({code: GOOD, title: 'Old', status: 'approved'});
  migrated.vote(id, 'v', 1);
  assert.equal(migrated.getShow(id).up, 1);
  migrated.close();
});
