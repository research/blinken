#!/usr/bin/env node
// Import the old Reddit-based gallery into the database as approved shows.
//
//   node import-gallery.js ../gallery/cache [blinken.db]
//
// Reads the post list (bbbblinken.json.last) and the downloaded code that
// gallery.py cached, using the same rules to find each post's code.
// Running it again skips posts that were already imported.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Db} from './db.js';
import {checkShow} from './sandbox.js';

const [cacheDir, dbPath = process.env.BLINKEN_DB || 'blinken.db'] =
  process.argv.slice(2);
if (!cacheDir) {
  console.error('usage: import-gallery.js CACHE_DIR [DB]');
  process.exit(1);
}

// Posts whose code was lost
const SKIP = new Set(['Christmas Blinken!', 'Drunk Hyperactive Ant']);

function baseUrl(text, pattern) {
  const m = new RegExp(pattern).exec(text || '');
  if (!m) {
    return null;
  }
  let url = m[0].replace(/^http:\/\//i, 'https://');
  // Hard-coded fixes from gallery.py
  url = url.replace('wezuzoho', 'torijef').replace('joviqivido', 'zanutiy');
  return url;
}

const providers = [
  { // jsbin
    find(text) {
      let url = baseUrl(text,
          'https?://(?:[a-z0-9\\-.]*.)?jsbin\\.com/([A-Za-z0-9]+)(?:/([0-9]+))?');
      if (!url) {
        return null;
      }
      url = url.replace(/\/(edit|show)$/, '')
          .replace('https://output.jsbin.com', 'https://jsbin.com');
      return {base: url, code: url.replace(/\/$/, '') + '/download'};
    },
  },
  { // jsfiddle (gallery.py never managed to download these)
    find(text) {
      let url = baseUrl(text, 'https?://(?:[a-z0-9\\-.]*.)?' +
          '(?:jsfiddle\\.net|fiddle\\.jshell\\.net)/([A-Za-z0-9]+)/([A-Za-z0-9]+)');
      if (!url) {
        return null;
      }
      url = url.replace('https://fiddle.jshell.net', 'https://jsfiddle.net');
      const parts = url.slice(8).split('/');
      return {base: url,
        code: `https://jsfiddle.net/${parts[1]}/${parts[2]}/embedded/js/`};
    },
  },
];

function findCode(post) {
  for (const provider of providers) {
    for (const text of [post.url, post.selftext]) {
      const urls = provider.find(text);
      if (urls) {
        const key = crypto.createHash('sha256').update(urls.code).digest('hex');
        const file = path.join(cacheDir, key);
        if (fs.existsSync(file)) {
          return fs.readFileSync(file, 'utf8');
        }
        return null;
      }
    }
  }
  return null;
}

const posts = JSON.parse(
    fs.readFileSync(path.join(cacheDir, 'bbbblinken.json.last'), 'utf8'));
const db = new Db(dbPath);
const existing = new Set(['approved', 'pending', 'rejected', 'hidden'].flatMap(
    (status) => db.listShows({status, admin: true}).map((s) => s.sourceUrl)));

// Posts are newest first; keep that order in the gallery's "new" sort
let created = Date.now() - posts.length * 1000;
let imported = 0;
for (const post of [...posts].reverse()) {
  created += 1000;
  const sourceUrl = `https://www.reddit.com${post.permalink}`;
  if (SKIP.has(post.title) || existing.has(sourceUrl)) {
    continue;
  }
  const code = findCode(post);
  if (!code) {
    console.log(`No code for "${post.title}"`);
    continue;
  }
  let status = 'approved';
  try {
    await checkShow(code);
  } catch (e) {
    console.log(`"${post.title}" fails in the sandbox (${e.message}); ` +
      'importing it as hidden');
    status = 'hidden';
  }
  db.createShow({code, title: post.title, author: post.author || '',
    status, sourceUrl, created});
  imported++;
}
console.log(`Imported ${imported} shows`);
db.close();
