// Admin page: review submissions and manage gallery shows. The browser
// asks for the admin login the first time the API refuses a request.

import {EditorView, editorSetup, keymap, indentWithTab, javascript, Prec}
  from '/vendor/codemirror.js';
import {api} from './api.js';
import {Sandbox} from './sandbox.js';
import {Stairs} from './stairs.js';

const STATUSES = [
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['hidden', 'Hidden'],
  ['rejected', 'Rejected'],
];

const $ = (id) => document.getElementById(id);
const message = $('message');
const list = $('list');
const detail = $('detail');

const stairs = new Stairs($('view'));
const sandbox = new Sandbox();
const editor = new EditorView({
  parent: $('editor'),
  extensions: [editorSetup, javascript(), Prec.highest(keymap.of([
    {key: 'Mod-Enter', run: () => {
      runPreview(); return true;
    }},
    indentWithTab,
  ])), EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      showUnsaved();
    }
  })],
});
let status = 'pending';
let selected = null;   // the show being reviewed
let preview = null;

// Show a message at the top of the screen. Confirmations disappear on
// their own; errors and warnings stay until dismissed.
const OK_MESSAGE_MS = 3000;
let messageTimer = null;

function say(text, kind = '') {
  clearTimeout(messageTimer);
  message.className = 'admin-message' + (kind ? ` status-${kind}` : '');
  if (!text) {
    message.replaceChildren();
    return;
  }
  const close = el('button', {className: 'admin-message-close',
    textContent: '×', title: 'Dismiss', ariaLabel: 'Dismiss'});
  close.addEventListener('click', () => say(''));
  message.replaceChildren(el('span', {textContent: text}), close);
  if (kind === 'ok') {
    messageTimer = setTimeout(() => say(''), OK_MESSAGE_MS);
  }
}

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function renderTabs(counts = {}) {
  $('tabs').replaceChildren(...STATUSES.map(([value, label]) => {
    const b = el('button', {textContent: `${label} (${counts[value] ?? 0})`});
    b.setAttribute('aria-pressed', value === status);
    b.addEventListener('click', () => {
      if (!confirmDiscard()) {
        return;
      }
      status = value;
      say('');
      selected = null;
      setUrl({push: true});
      loadList();
    });
    return b;
  }));
}

// The URL records the show being viewed (/admin/12), or the tab when
// no show is selected (/admin/?status=approved)
function setUrl({push = false} = {}) {
  const url = new URL(location.href);
  url.pathname = selected ? `/admin/${selected.id}` : '/admin/';
  url.search = !selected && status !== 'pending' ? `?status=${status}` : '';
  if (url.href !== location.href) {
    history[push ? 'pushState' : 'replaceState'](null, '', url);
  }
}

// Load the list for the current tab, then select the show with id
// selectId if it's there, or else the first show
async function loadList({selectId = null} = {}) {
  try {
    const {shows, counts} = await api(`/admin/shows?status=${status}`);
    renderTabs(counts);
    const items = shows.map((show) => {
      const b = el('button', {},
          el('strong', {textContent: show.title}),
          el('div', {className: 'muted', textContent:
            `${show.author || 'anonymous'} · ${
              new Date(show.created).toLocaleDateString()} · ` +
            `▲${show.up} ▼${show.down}`}));
      b.dataset.id = show.id;
      b.setAttribute('aria-current', show.id === selected?.id);
      b.addEventListener('click', () => {
        if (show.id === selected?.id || !confirmDiscard()) {
          return;
        }
        say('');
        select(show.id, {push: true});
      });
      return el('li', {}, b);
    });
    list.replaceChildren(...(items.length ? items :
      [el('li', {className: 'muted', textContent: 'Nothing here.'})]));
    const id = shows.some((s) => s.id === selectId) ? selectId : shows[0]?.id;
    if (id) {
      await select(id);
    } else {
      clearSelection();
    }
  } catch (e) {
    say(e.status === 401 ?
      'Login required. Reload the page to log in.' : e.message, 'error');
  }
}

// Unsaved edits: the form as last loaded or saved, to compare against
let savedEdits = null;

function isDirty() {
  return selected !== null && savedEdits !== JSON.stringify(edits());
}

function markSaved() {
  savedEdits = JSON.stringify(edits());
  showUnsaved();
}

function showUnsaved() {
  $('unsaved').hidden = !isDirty();
}

// Before leaving the show being edited, ask whether to discard changes
function confirmDiscard() {
  return !isDirty() ||
    confirm(`Discard your unsaved changes to "${selected.title}"?`);
}

$('form').addEventListener('input', showUnsaved);

// The browser asks before closing or leaving the page
window.addEventListener('beforeunload', (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function clearSelection() {
  selected = null;
  savedEdits = null;
  showUnsaved();
  preview?.stop();
  detail.hidden = true;
  setUrl();
}

async function select(id, {push = false} = {}) {
  try {
    selected = await api(`/admin/shows/${id}`);
  } catch (e) {
    say(e.message, 'error');
    return;
  }
  setUrl({push});
  for (const b of list.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.dataset.id === String(selected.id));
  }
  detail.hidden = false;
  for (const field of ['title', 'author', 'description', 'note', 'up',
    'down']) {
    $(field).value = selected[field];
  }
  $('created').value = localDateTime(selected.created);
  editor.dispatch({changes: {from: 0, to: editor.state.doc.length,
    insert: selected.code}});
  const meta = [];
  if (selected.reviewed) {
    meta.push(`Reviewed ${new Date(selected.reviewed).toLocaleString()}`);
  }
  $('meta').replaceChildren(meta.join(' · '));
  if (selected.sourceUrl) {
    $('meta').append(meta.length ? ' · ' : '', el('a', {
      href: selected.sourceUrl, textContent: 'Source', rel: 'noopener'}));
  }
  for (const b of document.querySelectorAll('[data-status]')) {
    b.hidden = b.dataset.status === selected.status;
  }
  markSaved();
  runPreview();
}

// A time as the value of a datetime-local input, in local time
function localDateTime(ms) {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function code() {
  return editor.state.doc.toString();
}

function runPreview() {
  preview?.stop();
  stairs.clear();
  $('preview-status').textContent = 'Running preview';
  preview = sandbox.run(code(), {
    frame: (frame) => stairs.setFrame(frame),
    error: (msg) => {
      $('preview-status').textContent = `Error: ${msg}`;
    },
    done: () => {
      $('preview-status').textContent = 'Preview finished';
    },
  });
}

function edits() {
  const fields = {code: code(), created: new Date($('created').value),
    up: Number($('up').value), down: Number($('down').value)};
  for (const field of ['title', 'author', 'description', 'note']) {
    fields[field] = $(field).value;
  }
  return fields;
}

async function update(fields, done) {
  if (!$('form').reportValidity()) {
    return;
  }
  try {
    const res = await api(`/admin/shows/${selected.id}`,
        {method: 'PATCH', body: {...edits(), ...fields}});
    if (res.warning) {
      say(`${done}, but ${res.warning}`, 'warn');
    } else {
      say(done, 'ok');
    }
    // After a status change the show leaves this tab, so move on to the
    // next one; otherwise show the saved version
    await loadList({selectId: fields.status ? null : selected.id});
  } catch (e) {
    say(e.message, 'error');
  }
}

for (const b of document.querySelectorAll('[data-status]')) {
  b.addEventListener('click', () => update({status: b.dataset.status},
      `Moved "${$('title').value}" to ${b.dataset.status}`));
}

$('save').addEventListener('click', () => update({}, 'Saved'));
$('preview').addEventListener('click', runPreview);

$('run').addEventListener('click', async () => {
  try {
    await api(`/admin/shows/${selected.id}/run`, {body: {}});
    say(`"${selected.title}" will run on the stairs next`, 'ok');
  } catch (e) {
    say(e.message, 'error');
  }
});

$('open').addEventListener('click', async () => {
  try {
    const {id} = await api('/snippets', {body: {code: code()}});
    window.open(`/play/?id=${id}`, '_blank', 'noopener');
  } catch (e) {
    say(e.message, 'error');
  }
});

$('delete').addEventListener('click', async () => {
  if (!confirm(`Delete "${selected.title}" permanently?`)) {
    return;
  }
  try {
    await api(`/admin/shows/${selected.id}`, {method: 'DELETE'});
    say(`Deleted "${selected.title}"`, 'ok');
    clearSelection();
    loadList();
  } catch (e) {
    say(e.message, 'error');
  }
});

// Open the tab and show named in the URL
async function openFromUrl() {
  const params = new URLSearchParams(location.search);
  status = STATUSES.some(([s]) => s === params.get('status')) ?
    params.get('status') : 'pending';
  let showId = Number(/^\/admin\/(\d+)\/?$/.exec(location.pathname)?.[1]) ||
    null;
  if (showId) {
    try {
      // The show's status decides which tab it's in
      status = (await api(`/admin/shows/${showId}`)).status;
    } catch (e) {
      say(e.status === 404 ? `There's no show ${showId}` : e.message,
          'error');
      showId = null;
    }
  }
  selected = null;
  await loadList({selectId: showId});
}

window.addEventListener('popstate', () => {
  if (!confirmDiscard()) {
    // Stay on this show: put its URL back
    setUrl({push: true});
    return;
  }
  say('');
  openFromUrl();
});

renderTabs();
openFromUrl();
