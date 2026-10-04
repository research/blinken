// The gallery: approved shows with live previews, voting, and buttons to
// run them on the stairs or remix them in the playground.

import {api, watchJob, cancelJob} from './api.js';
import {Sandbox} from './sandbox.js';
import {Stairs} from './stairs.js';

const PAGE_SIZE = 12;

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const more = $('more');
const message = $('message');
const sortSelect = $('sort');

const sandbox = new Sandbox();
let shows = [];
let shown = 0;

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

// Run previews only while they're on screen
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
}, {rootMargin: '100px'});

function preview(card, view, show) {
  const stairs = new Stairs(view, {interactive: false});
  let run = null;
  let code = null;
  previews.set(card, {
    async start() {
      if (run) {
        return;
      }
      run = {stop() {}};
      try {
        code ??= (await api(`/shows/${show.id}`)).code;
      } catch (e) {
        return;
      }
      run = sandbox.run(code, {
        frame: (frame) => stairs.setFrame(frame),
        // Restart shows that end, so the preview keeps moving
        done: () => {
          run = null;
          setTimeout(() => previews.get(card)?.start(), 1000);
        },
        error: () => {
          run = null;
        },
      });
    },
    stop() {
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
  const view = el('div', {className: 'card-view'});
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
  const text = el('div', {className: 'card-text'},
      el('h2', {className: 'card-title', textContent: show.title}));
  if (show.author) {
    text.append(el('div', {className: 'card-author',
      textContent: `by ${show.author}`}));
  }
  if (show.description) {
    text.append(el('p', {className: 'card-description',
      textContent: show.description}));
  }
  text.append(actions, statusLine);
  const c = el('article', {className: 'card', id: `show-${show.id}`},
      view, el('div', {className: 'card-body'}, voteButtons(show), text));
  preview(c, view, show);
  return c;
}

function showMore() {
  for (const show of shows.slice(shown, shown + PAGE_SIZE)) {
    grid.append(card(show));
  }
  shown = Math.min(shown + PAGE_SIZE, shows.length);
  more.hidden = shown >= shows.length;
}

async function load() {
  for (const p of previews.values()) {
    p.stop();
  }
  previews.clear();
  observer.disconnect();
  grid.replaceChildren();
  shown = 0;
  message.textContent = 'Loading…';
  try {
    shows = (await api(`/shows?sort=${sortSelect.value}`)).shows;
    message.textContent = shows.length ? '' :
      'No shows yet. Be the first!';
    showMore();
  } catch (e) {
    message.textContent = `Couldn't load the gallery: ${e.message}`;
  }
}

sortSelect.addEventListener('change', load);
more.addEventListener('click', showMore);
load();
