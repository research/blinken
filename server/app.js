// HTTP API for blinken.org.
//
// Legacy endpoints (/publish, /status, /cancel, /current, /random,
// /hello-pi, /stream) keep their original behavior, including CORS, for
// client.js on other sites and older embedded clients. Newer endpoints
// serve the playground, gallery, and admin pages on this site only.

import crypto from 'node:crypto';
import express from 'express';
import logger from 'morgan';
import {checkShow, wrapLegacy, MAX_CODE_LENGTH} from './sandbox.js';
import {STATUSES} from './db.js';

const PREFIX = '/api/0';
const VOTER_COOKIE = 'voter';
const VOTER_MAX_AGE_S = 5 * 365 * 24 * 60 * 60;
const MAX_TITLE = 100;
const MAX_AUTHOR = 100;
const MAX_DESCRIPTION = 1000;
// The author in the playground's example code
const PLACEHOLDER_AUTHOR = 'your name';

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (e) {
    return '';
  }
}

function showId(req) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(404, 'No such show');
  }
  return id;
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function voterId(req) {
  const id = cookies(req)[VOTER_COOKIE];
  return /^[0-9a-f]{32}$/.test(id || '') ? id : '';
}

// Run a show briefly in the sandbox; turn failures into a 422 the
// playground can show
async function check(script) {
  try {
    return await checkShow(script);
  } catch (e) {
    if (e.logs) {
      throw new HttpError(422, e.message, {logs: e.logs});
    }
    throw e;
  }
}

// Whether a request's Origin is the host it was sent to (Caddy passes
// the original Host header through)
function sameHost(origin, req) {
  try {
    return new URL(origin).host === req.get('Host');
  } catch (e) {
    return false;
  }
}

function safeEqual(a, b) {
  const hash = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

export function createApp({db, scheduler, strand, siteUrl,
  adminUser, adminPassword, staticDir, log = true}) {
  const site = new URL(siteUrl);
  const app = express();
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  if (log) {
    app.use(logger('combined', {
      // Clients poll these frequently
      skip: (req) => /^\/api\/0\/(status|current)\b/.test(req.originalUrl),
    }));
  }
  app.use(express.json({limit: MAX_CODE_LENGTH * 2}));
  app.use(express.urlencoded({extended: false, limit: MAX_CODE_LENGTH * 2}));

  const api = express.Router();
  app.use(PREFIX, api);

  // --- Legacy endpoints ---

  const cors = (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    next();
  };

  api.options('/publish', cors, (req, res) => {
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });

  // Queue code from client.js, which sends the initializer's source
  api.post('/publish', cors, async (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string') {
      return res.status(400).send('Missing code');
    }
    let checked;
    try {
      checked = await checkShow(wrapLegacy(code));
    } catch (e) {
      return res.status(400).send(`Error: ${e.message}`);
    }
    res.send(scheduler.submit({
      script: wrapLegacy(code),
      title: text(req.body.title, MAX_TITLE) || checked.title,
      author: text(req.body.author, MAX_AUTHOR) || checked.author,
      url: httpUrl(req.body.url),
    }));
  });

  api.get('/status/:token', cors, (req, res) => {
    const status = scheduler.status(req.params.token);
    if (!status) {
      return res.sendStatus(404);
    }
    res.json(status);
  });

  api.all('/cancel/:token', cors, (req, res) => {
    if (!scheduler.cancel(req.params.token)) {
      return res.sendStatus(404);
    }
    res.send('');
  });

  api.get('/current', cors, (req, res) => {
    res.json(scheduler.nowPlaying());
  });

  // A random gallery show, for older embedded clients
  api.get('/random', cors, (req, res) => {
    const shows = db.listShows({status: 'approved', sort: 'new'});
    if (shows.length === 0) {
      return res.sendStatus(404);
    }
    const pick = shows[Math.floor(Math.random() * shows.length)];
    res.json({
      title: pick.title,
      url: `${site.origin}/play/?show=${pick.id}`,
      code: db.getShow(pick.id).code,
    });
  });

  // Connectivity check for the Pi's network watchdog. The Pi receives
  // frames by connecting to /stream.
  api.get('/hello-pi', (req, res) => {
    console.log('hello from pi:', req.ip);
    res.send('👋');
  });

  // --- Site endpoints ---

  // Requests that change state must be JSON from this site, which
  // browsers won't send cross-site without a CORS preflight
  const sameSite = (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && origin !== site.origin && !sameHost(origin, req)) {
      throw new HttpError(403, 'Cross-site request refused');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' &&
        req.method !== 'DELETE' && !req.is('application/json')) {
      throw new HttpError(415, 'Expected JSON');
    }
    next();
  };

  // Run code from the playground on the stairs
  api.post('/run', sameSite, async (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string') {
      throw new HttpError(400, 'Missing code');
    }
    const checked = await check(code);
    const id = db.saveSnippet(code);
    const url = `${site.origin}/play/?id=${id}`;
    const token = scheduler.submit({
      script: code, title: checked.title, author: checked.author, url,
    });
    res.json({token, url, title: checked.title, author: checked.author,
      logs: checked.logs});
  });

  api.post('/snippets', sameSite, (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
      throw new HttpError(400, 'Missing or oversized code');
    }
    res.json({id: db.saveSnippet(code)});
  });

  api.get('/snippets/:id', (req, res) => {
    const snippet = db.getSnippet(req.params.id);
    if (!snippet) {
      throw new HttpError(404, 'No such snippet');
    }
    res.json(snippet);
  });

  api.post('/submissions', sameSite, async (req, res) => {
    const code = req.body?.code;
    if (typeof code !== 'string') {
      throw new HttpError(400, 'Missing code');
    }
    const checked = await check(code);
    const title = text(req.body.title, MAX_TITLE) || checked.title;
    if (!title) {
      throw new HttpError(400, 'Please give your show a title');
    }
    const author = text(req.body.author, MAX_AUTHOR) ||
      text(checked.author, MAX_AUTHOR);
    if (!author || author.toLowerCase() === PLACEHOLDER_AUTHOR) {
      throw new HttpError(400, 'Please enter your name');
    }
    const id = db.createShow({
      code, title, author,
      description: text(req.body.description, MAX_DESCRIPTION),
    });
    res.json({id, status: 'pending'});
  });

  api.get('/shows', (req, res) => {
    const sort = req.query.sort === 'new' ? 'new' : 'top';
    res.json({shows: db.listShows(
        {status: 'approved', sort, voter: voterId(req)})});
  });

  api.get('/shows/:id', (req, res) => {
    const show = db.getShow(showId(req), {voter: voterId(req)});
    if (!show || show.status !== 'approved') {
      throw new HttpError(404, 'No such show');
    }
    res.json(show);
  });

  api.post('/shows/:id/vote', sameSite, (req, res) => {
    const value = req.body?.value;
    if (![1, 0, -1].includes(value)) {
      throw new HttpError(400, 'Vote must be 1, 0, or -1');
    }
    let voter = voterId(req);
    if (!voter) {
      voter = crypto.randomBytes(16).toString('hex');
      res.cookie(VOTER_COOKIE, voter, {
        path: PREFIX, maxAge: VOTER_MAX_AGE_S * 1000, httpOnly: true,
        sameSite: 'lax', secure: site.protocol === 'https:',
      });
    }
    const show = db.vote(showId(req), voter, value);
    if (!show) {
      throw new HttpError(404, 'No such show');
    }
    res.json(show);
  });

  api.post('/shows/:id/run', sameSite, (req, res) => {
    const show = db.getShow(showId(req));
    if (!show || show.status !== 'approved') {
      throw new HttpError(404, 'No such show');
    }
    res.json({token: scheduler.submit({
      script: show.code, title: show.title, author: show.author,
      url: `${site.origin}/play/?show=${show.id}`,
    })});
  });

  // --- Admin endpoints ---

  const admin = express.Router();
  api.use('/admin', (req, res, next) => {
    if (!adminUser || !adminPassword) {
      throw new HttpError(503, 'Admin access is not configured');
    }
    const [scheme, encoded] = (req.get('Authorization') || '').split(' ');
    const [user, ...rest] = Buffer.from(encoded || '', 'base64')
        .toString().split(':');
    if (scheme !== 'Basic' || !safeEqual(user, adminUser) ||
        !safeEqual(rest.join(':'), adminPassword)) {
      res.set('WWW-Authenticate', 'Basic realm="Blinken admin", charset="UTF-8"');
      throw new HttpError(401, 'Login required');
    }
    next();
  }, sameSite, admin);

  admin.get('/shows', (req, res) => {
    const status = STATUSES.includes(req.query.status) ?
      req.query.status : 'pending';
    res.json({
      shows: db.listShows({status, sort: 'new', admin: true}),
      counts: db.countShows(),
    });
  });

  admin.get('/shows/:id', (req, res) => {
    const show = db.getShow(showId(req), {admin: true});
    if (!show) {
      throw new HttpError(404, 'No such show');
    }
    res.json(show);
  });

  admin.patch('/shows/:id', async (req, res) => {
    const body = req.body || {};
    let warning;
    if (body.status !== undefined && !STATUSES.includes(body.status)) {
      throw new HttpError(400, 'Unknown status');
    }
    const fields = {status: body.status};
    for (const [key, max] of [['title', MAX_TITLE], ['author', MAX_AUTHOR],
      ['description', MAX_DESCRIPTION], ['note', MAX_DESCRIPTION]]) {
      if (body[key] !== undefined) {
        fields[key] = text(body[key], max);
      }
    }
    if (fields.title === '') {
      throw new HttpError(400, 'Title cannot be empty');
    }
    for (const key of ['up', 'down']) {
      if (body[key] !== undefined) {
        if (!Number.isSafeInteger(body[key]) || body[key] < 0) {
          throw new HttpError(400, 'Vote totals must be whole numbers, 0 or more');
        }
        fields[key] = body[key];
      }
    }
    if (body.created !== undefined) {
      fields.created = new Date(body.created).getTime();
      if (!Number.isFinite(fields.created)) {
        throw new HttpError(400, 'Invalid submission date');
      }
    }
    if (body.code !== undefined) {
      if (typeof body.code !== 'string') {
        throw new HttpError(400, 'Code must be a string');
      }
      if (body.code.length > MAX_CODE_LENGTH) {
        throw new HttpError(413, 'Code is too long');
      }
      // Check edited code, but save it (and every other change) even if
      // it fails, with a warning. The editor converts line endings, so
      // ignore differences in those.
      const lines = (s) => s?.replace(/\r\n?/g, '\n');
      if (lines(body.code) !== lines(db.getShow(showId(req))?.code)) {
        try {
          await checkShow(body.code);
        } catch (e) {
          if (!e.logs) {
            throw e;
          }
          warning = `the code doesn't run on the stairs: ${e.message}`;
        }
        fields.code = body.code;
      }
    }
    const show = db.updateShow(showId(req), fields);
    if (!show) {
      throw new HttpError(404, 'No such show');
    }
    res.json(warning ? {...show, warning} : show);
  });

  admin.delete('/shows/:id', (req, res) => {
    if (!db.deleteShow(showId(req))) {
      throw new HttpError(404, 'No such show');
    }
    res.sendStatus(204);
  });

  // Run any show next, regardless of status
  admin.post('/shows/:id/run', (req, res) => {
    const show = db.getShow(showId(req));
    if (!show) {
      throw new HttpError(404, 'No such show');
    }
    res.json({token: scheduler.submit({
      script: show.code, title: show.title, author: show.author,
      url: '', first: true,
    })});
  });

  api.use((req, res) => {
    res.status(404).json({error: 'Not found'});
  });

  api.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      err = new HttpError(413, 'Code is too long');
    } else if (err.type === 'entity.parse.failed') {
      err = new HttpError(400, 'Invalid JSON');
    }
    if (!(err instanceof HttpError)) {
      console.error(err);
      err = new HttpError(500, 'Server error');
    }
    res.status(err.status).json({error: err.message, ...err.extra});
  });

  if (staticDir) {
    // Admin URLs for a show (/admin/12) are the admin page
    app.get(/^\/admin\/\d+\/?$/, (req, res) => {
      res.sendFile('admin/index.html', {root: staticDir});
    });
    app.use(express.static(staticDir));
  }

  return app;
}
