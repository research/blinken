// Queues shows for the stairs and plays them one at a time. When the
// queue is empty, plays gallery shows (weighted by votes) until someone
// queues a show.

import crypto from 'node:crypto';
import fs from 'node:fs';
import {Show, wrapLegacy} from './sandbox.js';

const JOB_LIMIT_S = 120;
const IDLE_LIMIT_S = 60;
const CANCEL_POLL_MS = 100;
const JOB_RETENTION_MS = 60 * 60 * 1000;

// Status values understood by client.js and the playground
export const QUEUED = 10;
export const RUNNING = 20;
export const DONE = 0;
export const FAILED = -10;

const circus = {
  script: wrapLegacy(fs.readFileSync(
      new URL('./idle.js', import.meta.url), 'utf8')),
  title: 'Circus',
  author: '',
  url: '',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatWait(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Scheduler {
  constructor({db, strand, siteUrl = 'https://blinken.org', log = console}) {
    this.db = db;
    this.strand = strand;
    this.siteUrl = siteUrl;
    this.log = log;
    this.jobs = new Map();
    this.queue = [];
    this.current = null;
    this.lastIdleId = null;
    this.running = false;
  }

  // Queue a show that has already passed checkShow(). Returns its token.
  // With first, it goes to the front of the queue.
  submit({script, title, author, url, first = false}) {
    const token = crypto.randomBytes(16).toString('hex');
    this.jobs.set(token, {
      token, script, title: title || 'Untitled', author: author || '',
      url: url || '', limit: JOB_LIMIT_S, cancel: false,
      status: {value: QUEUED, message: 'Queued'}, finished: null,
    });
    if (first) {
      this.queue.unshift(token);
    } else {
      this.queue.push(token);
    }
    return token;
  }

  status(token) {
    const job = this.jobs.get(token);
    if (!job) {
      return undefined;
    }
    if (job.status.value === QUEUED) {
      return {value: QUEUED, message: `Queued (${formatWait(this.wait(token))})`};
    }
    return job.status;
  }

  cancel(token) {
    const job = this.jobs.get(token);
    if (!job) {
      return false;
    }
    job.cancel = true;
    if (job.status.value === QUEUED) {
      this.finish(job, DONE, 'Canceled');
    }
    return true;
  }

  // Estimated seconds until a queued job starts
  wait(token) {
    let wait = this.current ?
      Math.max(0, this.current.deadline - Date.now()) / 1000 : 0;
    if (this.current?.idle) {
      wait = 0;
    }
    for (const t of this.queue) {
      if (t === token) {
        break;
      }
      if (!this.jobs.get(t).cancel) {
        wait += this.jobs.get(t).limit;
      }
    }
    return wait;
  }

  // What's playing, in the format of the /current API
  nowPlaying() {
    const c = this.current;
    if (!c) {
      return {is_idle: true, url: '', time_left: 0, title: '', author: ''};
    }
    return {
      is_idle: c.idle,
      url: c.url,
      time_left: Math.round(Math.max(0, c.deadline - Date.now())) / 1000,
      title: c.title,
      author: c.author,
    };
  }

  finish(job, value, message) {
    job.status = {value, message};
    job.finished = Date.now();
  }

  prune() {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    for (const [token, job] of this.jobs) {
      if (job.finished && job.finished < cutoff) {
        this.jobs.delete(token);
      }
    }
  }

  // Pick an approved gallery show, favoring well-voted ones and avoiding
  // an immediate repeat
  pickIdle() {
    let shows = this.db.listShows({status: 'approved', sort: 'new'});
    if (shows.length > 1) {
      shows = shows.filter((s) => s.id !== this.lastIdleId);
    }
    if (shows.length === 0) {
      return null;
    }
    const weights = shows.map(
        (s) => Math.min(Math.max((s.up + 1) / (s.down + 1), 0.25), 4));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < shows.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        return shows[i];
      }
    }
    return shows[shows.length - 1];
  }

  async loop() {
    this.running = true;
    while (this.running) {
      this.prune();
      const token = this.queue.shift();
      if (token) {
        const job = this.jobs.get(token);
        if (!job || job.cancel) {
          continue;
        }
        job.status = {value: RUNNING, message: 'Running'};
        const result = await this.play({...job, idle: false},
            () => job.cancel);
        this.finish(job, result.ok ? DONE : FAILED, result.message);
        continue;
      }

      const pick = this.pickIdle();
      let idle = circus;
      if (pick) {
        this.lastIdleId = pick.id;
        idle = {
          script: this.db.getShow(pick.id).code,
          title: pick.title,
          author: pick.author,
          url: `${this.siteUrl}/play/?show=${pick.id}`,
        };
      }
      const result = await this.play(
          {...idle, limit: IDLE_LIMIT_S, idle: true},
          () => this.queue.length > 0);
      if (!result.ok) {
        this.log.warn(`Idle show "${idle.title}" failed: ${result.message}`);
        if (pick) {
          // Fill the time with the built-in show instead
          await this.play({...circus, limit: IDLE_LIMIT_S, idle: true},
              () => this.queue.length > 0);
        } else {
          await sleep(1000);
        }
      }
    }
  }

  stop() {
    this.running = false;
  }

  // Play a show until it finishes, fails, runs out of time, or
  // isCancelled() returns true. Returns {ok, message}.
  async play({script, title, author, url, limit, idle}, cancelled) {
    const isCancelled = () => !this.running || cancelled();
    const deadline = Date.now() + limit * 1000;
    let show;
    try {
      show = await Show.start(script);
    } catch (e) {
      return {ok: false, message: `Error during initialization: ${e.message}`};
    }
    this.current = {idle, title: title || show.title || 'Untitled',
      author: author || show.author || '', url, deadline};
    try {
      this.strand.show(show.frame);
      for (;;) {
        // A static show holds its first frame until time runs out
        let wakeAt = deadline;
        if (show.animated) {
          const res = await show.next();
          this.strand.show(res.frame);
          if (res.delay === null) {
            return {ok: true, message: 'Completed'};
          }
          wakeAt = Math.min(Date.now() + res.delay, deadline);
        }
        // Wait until the next step is due, checking for cancellation
        while (Date.now() < wakeAt) {
          if (isCancelled()) {
            return {ok: true, message: 'Canceled'};
          }
          await sleep(Math.min(CANCEL_POLL_MS, wakeAt - Date.now()));
        }
        if (isCancelled()) {
          return {ok: true, message: 'Canceled'};
        }
        if (Date.now() >= deadline) {
          return {ok: true, message: 'Time\'s up'};
        }
      }
    } catch (e) {
      return {ok: false, message: `Error in step function: ${e.message}`};
    } finally {
      show.stop();
      this.current = null;
    }
  }
}
