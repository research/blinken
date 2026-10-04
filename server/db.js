// SQLite storage for shared code, gallery shows, and votes.

import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export const STATUSES = ['pending', 'approved', 'rejected', 'hidden'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  note TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  reviewed INTEGER,
  -- up and down are the vote counts plus the offsets, which admins set
  -- to adjust the totals
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0,
  up_offset INTEGER NOT NULL DEFAULT 0,
  down_offset INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS votes (
  show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  voter TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (show_id, voter)
);
`;

// Lower bound of the 95% Wilson score interval for the fraction of
// upvotes, so a show at 3-0 doesn't outrank one at 40-5
export function wilson(up, down) {
  const n = up + down;
  if (n === 0) {
    return 0;
  }
  const z = 1.96;
  const p = up / n;
  return (p + z * z / (2 * n) -
    z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / (1 + z * z / n);
}

function publicShow(row, {withCode = false, admin = false} = {}) {
  const show = {
    id: row.id,
    title: row.title,
    author: row.author,
    description: row.description,
    status: row.status,
    sourceUrl: row.source_url,
    created: row.created,
    up: row.up,
    down: row.down,
    score: row.up - row.down,
  };
  if ('my_vote' in row) {
    show.myVote = row.my_vote ?? 0;
  }
  if (withCode) {
    show.code = row.code;
  }
  if (admin) {
    show.note = row.note;
    show.reviewed = row.reviewed;
  }
  return show;
}

export class Db {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  // Bring databases made by earlier versions up to date
  migrate() {
    const columns = this.db.prepare('PRAGMA table_info(shows)').all()
        .map((c) => c.name);
    for (const column of ['up_offset', 'down_offset']) {
      if (!columns.includes(column)) {
        this.db.exec(`ALTER TABLE shows ADD COLUMN ${column} ` +
          'INTEGER NOT NULL DEFAULT 0');
      }
    }
  }

  close() {
    this.db.close();
  }

  transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // Snippets are immutable; identical code gets the same id
  saveSnippet(code) {
    const id = crypto.createHash('sha256').update(code).digest('base64url')
        .slice(0, 11);
    this.db.prepare(
        'INSERT OR IGNORE INTO snippets (id, code, created) VALUES (?, ?, ?)',
    ).run(id, code, Date.now());
    return id;
  }

  getSnippet(id) {
    return this.db.prepare('SELECT id, code, created FROM snippets WHERE id = ?')
        .get(id);
  }

  createShow({code, title, author = '', description = '', status = 'pending',
    sourceUrl = '', created = Date.now()}) {
    const res = this.db.prepare(`
      INSERT INTO shows (code, title, author, description, status, source_url,
                         created, reviewed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        code, title, author, description, status, sourceUrl, created,
        status === 'pending' ? null : Date.now());
    return Number(res.lastInsertRowid);
  }

  getShow(id, {voter = '', withCode = true, admin = false} = {}) {
    const row = this.db.prepare(`
      SELECT shows.*, votes.value AS my_vote FROM shows
      LEFT JOIN votes ON votes.show_id = shows.id AND votes.voter = ?
      WHERE shows.id = ?`).get(voter, id);
    return row ? publicShow(row, {withCode, admin}) : undefined;
  }

  // List shows with a given status. sort is 'top' (Wilson score, then
  // newest) or 'new'.
  listShows({status, sort = 'top', voter = '', admin = false}) {
    const rows = this.db.prepare(`
      SELECT shows.*, votes.value AS my_vote FROM shows
      LEFT JOIN votes ON votes.show_id = shows.id AND votes.voter = ?
      WHERE shows.status = ?
      ORDER BY shows.created DESC, shows.id DESC`).all(voter, status);
    if (sort === 'top') {
      rows.sort((a, b) => wilson(b.up, b.down) - wilson(a.up, a.down));
    }
    return rows.map((row) => publicShow(row, {admin}));
  }

  countShows() {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of this.db.prepare(
        'SELECT status, COUNT(*) AS n FROM shows GROUP BY status').all()) {
      counts[row.status] = row.n;
    }
    return counts;
  }

  // Update a show's metadata. fields may include up and down, which set
  // the displayed vote totals without changing the recorded votes.
  updateShow(id, fields) {
    const columns = {title: 'title', author: 'author',
      description: 'description', status: 'status', note: 'note',
      code: 'code', created: 'created'};
    const sets = [];
    const values = [];
    for (const [key, sign] of [['up', 1], ['down', -1]]) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`, `${key}_offset = ? - (SELECT COUNT(*) ` +
          `FROM votes WHERE show_id = shows.id AND value = ${sign})`);
        values.push(fields[key], fields[key]);
      }
    }
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(fields[key]);
      }
    }
    if (fields.status !== undefined) {
      sets.push('reviewed = ?');
      values.push(Date.now());
    }
    if (sets.length === 0) {
      return this.getShow(id, {admin: true});
    }
    const res = this.db.prepare(
        `UPDATE shows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    return res.changes ? this.getShow(id, {admin: true}) : undefined;
  }

  deleteShow(id) {
    return this.db.prepare('DELETE FROM shows WHERE id = ?').run(id).changes > 0;
  }

  // Record a vote of 1, -1, or 0 (withdraw) on an approved show.
  // Returns the updated show, or undefined if it isn't approved.
  vote(showId, voter, value) {
    return this.transaction(() => {
      const show = this.db.prepare(
          'SELECT status FROM shows WHERE id = ?').get(showId);
      if (!show || show.status !== 'approved') {
        return undefined;
      }
      if (value === 0) {
        this.db.prepare('DELETE FROM votes WHERE show_id = ? AND voter = ?')
            .run(showId, voter);
      } else {
        this.db.prepare(`
          INSERT INTO votes (show_id, voter, value) VALUES (?, ?, ?)
          ON CONFLICT (show_id, voter) DO UPDATE SET value = excluded.value`,
        ).run(showId, voter, value);
      }
      this.db.prepare(`
        UPDATE shows SET
          up = up_offset +
            (SELECT COUNT(*) FROM votes WHERE show_id = ? AND value = 1),
          down = down_offset +
            (SELECT COUNT(*) FROM votes WHERE show_id = ? AND value = -1)
        WHERE id = ?`).run(showId, showId, showId);
      return this.getShow(showId, {voter, withCode: false});
    });
  }
}
