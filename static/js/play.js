// The playground: edit a show, run it in the simulator, then run it on
// the stairs, share it, or submit it to the gallery.

import {EditorView, editorSetup, keymap, indentWithTab, javascript,
  syntaxTree, Prec} from '/vendor/codemirror.js';
import {api, watchJob, cancelJob} from './api.js';
import * as drafts from './drafts.js';
import {Sandbox} from './sandbox.js';
import {Stairs} from './stairs.js';

const MAX_CODE_LENGTH = 64 * 1024;
// The author in the example code, which isn't anyone's real name
const PLACEHOLDER_AUTHOR = 'your name';

const EXAMPLE = `// Welcome! Edit this code, then press Run (Ctrl+Enter) to try it here.
// When you like it, press "Run on Stairs" to see it on the real lights.

const b = new Blinken({title: "Rainbow", author: "Your Name"});

// run() calls this once, with an array of the 100 lights, to set up the show.
b.run((lights) => {
  let t = 0;

  // It returns a step function, which is called over and over.
  return (lights) => {
    for (let i = 0; i < lights.length; i++) {
      const hue = (i / lights.length + t) % 1;
      // Colors and brightness ("alpha") range from 0 to 1
      lights[i].rgb(...rainbow(hue));
    }
    t += 0.005;
    // Return how many milliseconds to wait before the next step
    return 30;
  };
});

// Turn a hue (0-1) into [red, green, blue]
function rainbow(hue) {
  const f = (n) => {
    const k = (n + hue * 6) % 6;
    return 1 - Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
`;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const consoleEl = $('console');

const stairs = new Stairs($('view'));
const sandbox = new Sandbox();
let current = null;     // the show running in the simulator
let lastStarted = {};   // its title and author
let job = null;         // {token, stopWatching} for a show on the stairs

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'play-status' + (kind ? ` status-${kind}` : '');
}

// --- Console ---
//
// The console stays out of the way until a show prints something. It
// opens for errors, and for console.log() output unless the visitor has
// collapsed it.

const consolePanel = $('console-panel');
const consoleToggle = $('console-toggle');
const consoleCount = $('console-count');
let consoleCollapsed = false;   // by the visitor
let lineCount = 0;
let errorCount = 0;

function setConsoleOpen(open) {
  consoleToggle.setAttribute('aria-expanded', open);
  consoleEl.hidden = !open;
}

function updateCount() {
  consoleCount.textContent = lineCount || '';
  consoleCount.hidden = !lineCount;
  consoleCount.classList.toggle('error', errorCount > 0);
  consoleCount.title = errorCount ?
    `${lineCount} messages, ${errorCount} errors` : `${lineCount} messages`;
}

function clearConsole() {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = 'No output yet.';
  consoleEl.replaceChildren(empty);
  lineCount = errorCount = 0;
  updateCount();
}

function log(level, text) {
  consoleEl.querySelector('.empty')?.remove();
  const line = document.createElement('div');
  line.className = `line ${level}`;
  line.textContent = text;
  consoleEl.append(line);
  // Keep the console from growing without bound
  while (consoleEl.childElementCount > 500) {
    consoleEl.firstElementChild.remove();
  }
  lineCount++;
  if (level === 'error') {
    errorCount++;
  }
  updateCount();
  consolePanel.hidden = false;
  if (level === 'error' || !consoleCollapsed) {
    setConsoleOpen(true);
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

consoleToggle.addEventListener('click', () => {
  const open = consoleEl.hidden;
  consoleCollapsed = !open;
  setConsoleOpen(open);
});

$('console-clear').addEventListener('click', clearConsole);

function code() {
  return editor.state.doc.toString();
}

function run() {
  stop();
  clearConsole();
  setStatus('Running');
  current = sandbox.run(code(), {
    started(info) {
      lastStarted = info;
      if (!info.animated) {
        setStatus('Done (no step function)');
      }
    },
    frame: (frame) => stairs.setFrame(frame),
    log,
    error(message) {
      current = null;
      // Browsers don't say where a syntax error is, but the editor knows
      if (message.startsWith('SyntaxError') && !/\(line \d+\)$/.test(message)) {
        const line = syntaxErrorLine();
        if (line) {
          message += ` (line ${line})`;
        }
      }
      log('error', message);
      setStatus('Error (see console)', 'error');
    },
    done() {
      current = null;
      setStatus('Done');
    },
  });
}

function syntaxErrorLine() {
  let pos = null;
  syntaxTree(editor.state).iterate({enter(node) {
    if (pos === null && node.type.isError) {
      pos = node.from;
    }
    return pos === null;
  }});
  return pos === null ? null : editor.state.doc.lineAt(pos).number;
}

function stop() {
  if (current) {
    current.stop();
    current = null;
    setStatus('Stopped');
  }
}

// --- Sharing ---

async function share() {
  try {
    const {id} = await api('/snippets', {body: {code: code()}});
    const url = new URL(`/play/?id=${id}`, location.href);
    try {
      await navigator.clipboard.writeText(url.href);
      setStatus('Link copied to clipboard', 'ok');
    } catch (e) {
      setStatus(`Link: ${url.href}`, 'ok');
    }
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

// --- Running on the stairs ---

const stairsButton = $('stairs');

function endJob() {
  job?.stopWatching();
  job = null;
  stairsButton.textContent = 'Run on Stairs';
}

async function runOnStairs() {
  if (job) {
    const token = job.token;
    endJob();
    setStatus('Canceling…');
    await cancelJob(token).catch(() => {});
    setStatus('Canceled');
    return;
  }
  stairsButton.disabled = true;
  setStatus('Checking your show…');
  try {
    const res = await api('/run', {body: {code: code()}});
    job = {token: res.token};
    stairsButton.textContent = 'Cancel';
    job.stopWatching = watchJob(res.token, ({value, message}) => {
      if (value > 0) {
        setStatus(`On the stairs: ${message}`);
      } else {
        setStatus(`On the stairs: ${message}`, value < 0 ? 'error' : 'ok');
        endJob();
      }
    });
  } catch (e) {
    setStatus(`Couldn't run on the stairs: ${e.message}`, 'error');
    for (const {level, text} of e.logs || []) {
      log(level, text);
    }
    if (e.status === 422) {
      log('error', `On the stairs: ${e.message}`);
    }
  } finally {
    stairsButton.disabled = false;
  }
}

// --- Submitting to the gallery ---

const dialog = $('submit-dialog');

function openSubmit() {
  if (!$('submit-title').value) {
    $('submit-title').value = lastStarted.title || '';
  }
  const author = (lastStarted.author || '').trim();
  if (!$('submit-author').value &&
      author.toLowerCase() !== PLACEHOLDER_AUTHOR) {
    $('submit-author').value = author;
  }
  $('submit-error').textContent = '';
  dialog.showModal();
}

$('submit-cancel').addEventListener('click', () => dialog.close());

$('submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const send = $('submit-send');
  send.disabled = true;
  $('submit-error').textContent = '';
  try {
    await api('/submissions', {body: {
      code: code(),
      title: $('submit-title').value,
      author: $('submit-author').value,
      description: $('submit-description').value,
    }});
    dialog.close();
    // Keep the name for next time, but not this show's details
    $('submit-title').value = '';
    $('submit-description').value = '';
    setStatus('Thanks! Your show will appear in the gallery after review.',
        'ok');
  } catch (e) {
    $('submit-error').textContent = e.message;
    for (const {level, text} of e.logs || []) {
      log(level, text);
    }
  } finally {
    send.disabled = false;
  }
});

// --- Editor and drafts ---

let draft = null;       // the draft being edited
let saveTimer = null;
let warnedUnsaved = false;
let loading = false;    // ignore edits made by loading code

const editor = new EditorView({
  parent: $('editor'),
  extensions: [
    editorSetup,
    javascript(),
    // Ahead of the default keys, which use Mod-Enter to insert a line
    Prec.highest(keymap.of([
      {key: 'Mod-Enter', run: () => {
        run(); return true;
      }},
      {key: 'Mod-s', run: () => {
        share(); return true;
      }},
      indentWithTab,
    ])),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !loading && draft) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 500);
      }
    }),
  ],
});

function setCode(text) {
  loading = true;
  editor.dispatch({changes: {from: 0, to: editor.state.doc.length,
    insert: text}});
  loading = false;
}

function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = null;
  draft.code = code();
  showName();
  if (drafts.available && !drafts.save(draft) && !warnedUnsaved) {
    warnedUnsaved = true;
    setStatus('Couldn\'t save your draft: browser storage is full', 'error');
  }
}

function showName() {
  const name = drafts.displayName(draft);
  $('draft-name').textContent = name;
  document.title = `${name} · Playground · BBB Blinken Bulbs`;
}

// Switch the editor to a draft and run it
function openDraft(d, {push = true} = {}) {
  if (saveTimer) {
    saveDraft();
  }
  draft = d;
  setCode(d.code);
  showName();
  if (drafts.available) {
    const url = new URL(location.href);
    url.search = `?draft=${d.id}`;
    if (url.href !== location.href) {
      history[push ? 'pushState' : 'replaceState'](null, '', url);
    }
  }
  editor.focus();
  run();
}

function newDraft(code, name = '') {
  return drafts.available ? drafts.create(code, name) :
    {id: null, name, code, updated: Date.now()};
}

// Open the most recently edited draft, or start a new one
function openLatest(options) {
  openDraft(drafts.list()[0] || newDraft(EXAMPLE), options);
}

// The draft named in the URL, or a new draft for code shared by link
async function draftFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.has('draft')) {
    const d = drafts.get(params.get('draft'));
    if (!d) {
      throw new Error('That show isn\'t saved in this browser');
    }
    return d;
  }
  if (params.has('id')) {
    const {code} = await api(
        `/snippets/${encodeURIComponent(params.get('id'))}`);
    return newDraft(code);
  }
  if (params.has('show')) {
    const show = await api(`/shows/${encodeURIComponent(params.get('show'))}`);
    return newDraft(show.code, drafts.titleOf(show.code) ? '' : show.title);
  }
  return null;
}

async function openFromUrl(options) {
  let d;
  try {
    d = await draftFromUrl();
  } catch (e) {
    openLatest(options);
    log('error', `Couldn't open that show (${e.message}), so here's ` +
      'your most recent one instead.');
    return;
  }
  if (d) {
    openDraft(d, options);
  } else {
    openLatest(options);
  }
}

// Keep tabs editing the same draft in sync
drafts.onChange((id, changed) => {
  if (draft && id === draft.id && changed && changed.code !== code() &&
      !saveTimer) {
    draft = changed;
    setCode(changed.code);
  }
  if (draft && id === draft.id && changed) {
    draft.name = changed.name;
    showName();
  }
  if (showsDialog.open) {
    renderShows();
  }
});

window.addEventListener('popstate', () => openFromUrl({push: false}));

// Save before the page goes away
window.addEventListener('pagehide', () => {
  if (saveTimer) {
    saveDraft();
  }
});

// --- My shows ---

const showsDialog = $('shows-dialog');

function renderShows() {
  if (saveTimer) {
    saveDraft();
  }
  const items = drafts.list().map((d) => {
    const li = document.createElement('li');
    li.setAttribute('aria-current', d.id === draft?.id);
    const open = document.createElement('button');
    open.className = 'open';
    const name = document.createElement('strong');
    name.textContent = drafts.displayName(d);
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = `Changed ${new Date(d.updated).toLocaleString()}`;
    open.append(name, when);
    open.addEventListener('click', () => {
      showsDialog.close();
      if (d.id !== draft?.id) {
        openDraft(drafts.get(d.id) || d);
      }
    });
    const button = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    li.append(open,
        button('Rename', () => rename(d)),
        button('Duplicate', () => {
          showsDialog.close();
          openDraft(newDraft(d.code, `${drafts.displayName(d)} (copy)`));
        }),
        button('Delete', () => remove(d)));
    return li;
  });
  $('shows-list').replaceChildren(...items);
}

function rename(d) {
  const name = prompt('Name this show:', drafts.displayName(d));
  if (name === null) {
    return;
  }
  const target = d.id === draft?.id ? draft : d;
  target.name = name.trim().slice(0, 100);
  if (target === draft) {
    saveDraft();
  } else {
    drafts.save(target);
  }
  renderShows();
}

function remove(d) {
  if (!confirm(`Delete "${drafts.displayName(d)}"? This can't be undone.`)) {
    return;
  }
  drafts.remove(d.id);
  if (d.id === draft?.id) {
    clearTimeout(saveTimer);
    saveTimer = null;
    draft = null;
    openLatest({push: false});
  }
  renderShows();
}

$('shows').addEventListener('click', () => {
  if (!drafts.available) {
    setStatus('This browser isn\'t saving shows (storage is turned off). ' +
      'Use Download or Share to keep your work.', 'error');
    return;
  }
  renderShows();
  showsDialog.showModal();
});

$('shows-close').addEventListener('click', () => showsDialog.close());

$('new-show').addEventListener('click', () => {
  showsDialog.close();
  openDraft(newDraft(EXAMPLE));
});

$('upload').addEventListener('click', () => $('upload-file').click());

$('upload-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) {
    return;
  }
  if (file.size > MAX_CODE_LENGTH) {
    setStatus(`That file is too big (limit ${MAX_CODE_LENGTH / 1024} KB)`,
        'error');
    return;
  }
  const text = await file.text();
  showsDialog.close();
  openDraft(newDraft(text,
      drafts.titleOf(text) ? '' : file.name.replace(/\.(js|txt)$/i, '')));
});

$('download').addEventListener('click', () => {
  if (saveTimer) {
    saveDraft();
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code()], {type: 'text/javascript'}));
  a.download = drafts.fileName(draft);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('run').addEventListener('click', run);
$('stop').addEventListener('click', stop);
$('share').addEventListener('click', share);
stairsButton.addEventListener('click', runOnStairs);
$('submit').addEventListener('click', openSubmit);

drafts.migrate();
await openFromUrl({push: false});
