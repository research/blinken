// The gallery: every approved show, with a live preview while it's on
// screen, voting, and buttons to run it on the stairs or remix it in the
// playground.

import {api, watchJob, cancelJob} from './api.js';
import {Sandbox} from './sandbox.js';
import {Stairs} from './stairs.js';

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const message = $('message');

const sandbox = new Sandbox();
let sort = 'top';

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

// Previews are built when they first come into view, and run only while
// they're in view
const previews = new Map();  // card element -> {start, stop}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const preview = previews.get(entry.target);
    if (entry.isIntersecting) {
      preview.start();
    } else {
      preview.stop();
    }
  }
});

function preview(card, view, show) {
  let stairs = null;
  let run = null;
  let code = null;
  let generation = 0;  // changes when the preview stops
  const start = async () => {
    if (run) {
      return;
    }
    const myGeneration = ++generation;
    stairs ??= new Stairs(view, {interactive: false});
    run = {stop() {}};
    try {
      code ??= (await api(`/shows/${show.id}`)).code;
    } catch (e) {
      run = null;
      return;
    }
    if (myGeneration !== generation) {
      return;  // stopped, and maybe restarted, while loading
    }
    run = sandbox.run(code, {
      frame: (frame) => stairs.setFrame(frame),
      // Restart shows that end, so the preview keeps moving
      done: () => {
        run = null;
        setTimeout(() => myGeneration === generation && start(), 1000);
      },
      error: () => {
        run = null;
      },
    });
  };
  previews.set(card, {
    start,
    stop() {
      generation++;
      run?.stop();
      run = null;
    },
  });
  observer.observe(card);
}

function voteButtons(show) {
  const up = el('button', {textContent: '▲', title: 'Vote up',
    ariaLabel: `Vote up ${show.title}`});
  const down = el('button', {textContent: '▼', title: 'Vote down',
    ariaLabel: `Vote down ${show.title}`});
  const score = el('span', {className: 'score'});
  const render = () => {
    score.textContent = show.score;
    score.title = `${show.up} up, ${show.down} down`;
    up.setAttribute('aria-pressed', show.myVote === 1);
    down.setAttribute('aria-pressed', show.myVote === -1);
  };
  const vote = async (value) => {
    // Clicking your current vote again withdraws it
    const v = show.myVote === value ? 0 : value;
    try {
      Object.assign(show, await api(`/shows/${show.id}/vote`,
          {body: {value: v}}));
      render();
    } catch (e) {
      message.textContent = `Couldn't record your vote: ${e.message}`;
    }
  };
  up.addEventListener('click', () => vote(1));
  down.addEventListener('click', () => vote(-1));
  render();
  return el('div', {className: 'votes'}, up, score, down);
}

function runButton(show, statusLine) {
  const button = el('button', {textContent: 'Run on Stairs'});
  let job = null;
  const end = () => {
    job?.stopWatching();
    job = null;
    button.textContent = 'Run on Stairs';
  };
  button.addEventListener('click', async () => {
    if (job) {
      const token = job.token;
      end();
      statusLine.textContent = 'Canceled';
      await cancelJob(token).catch(() => {});
      return;
    }
    button.disabled = true;
    try {
      const {token} = await api(`/shows/${show.id}/run`, {body: {}});
      job = {token};
      button.textContent = 'Cancel';
      job.stopWatching = watchJob(token, ({value, message}) => {
        statusLine.textContent = `On the stairs: ${message}`;
        if (value <= 0) {
          end();
        }
      });
    } catch (e) {
      statusLine.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function card(show) {
  const view = el('div', {className: 'card-view stage'});
  const statusLine = el('div', {className: 'card-run-status',
    role: 'status'});
  const actions = el('div', {className: 'card-actions'},
      runButton(show, statusLine),
      el('a', {className: 'button', href: `/play/?show=${show.id}`,
        textContent: 'Remix'}));
  if (show.sourceUrl) {
    actions.append(el('a', {className: 'button', href: show.sourceUrl,
      textContent: 'Discuss', rel: 'noopener'}));
  }
  const byline = el('div', {},
      el('h2', {className: 'card-title', textContent: show.title}));
  if (show.author) {
    byline.append(el('div', {className: 'card-author',
      textContent: `by ${show.author}`}));
  }
  const body = el('div', {className: 'card-body'},
      el('div', {className: 'card-head'}, byline, voteButtons(show)));
  if (show.description) {
    body.append(el('p', {className: 'card-description',
      textContent: show.description, title: show.description}));
  }
  body.append(actions, statusLine);
  const c = el('article', {className: 'card', id: `show-${show.id}`},
      view, body);
  preview(c, view, show);
  return c;
}

async function load() {
  for (const p of previews.values()) {
    p.stop();
  }
  previews.clear();
  observer.disconnect();
  message.textContent = 'Loading…';
  try {
    const {shows} = await api(`/shows?sort=${sort}`);
    $('count').textContent =
      `${shows.length} ${shows.length === 1 ? 'show' : 'shows'}`;
    message.textContent = shows.length ? '' : 'No shows yet. Be the first!';
    grid.replaceChildren(...shows.map(card));
  } catch (e) {
    grid.replaceChildren();
    message.textContent = `Couldn't load the gallery: ${e.message}`;
  }
}

for (const b of document.querySelectorAll('#sort button')) {
  b.addEventListener('click', () => {
    if (b.dataset.sort === sort) {
      return;
    }
    sort = b.dataset.sort;
    for (const other of document.querySelectorAll('#sort button')) {
      other.setAttribute('aria-pressed', other === b);
    }
    load();
  });
}

load();
