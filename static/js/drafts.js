// Drafts saved in this browser, for the playground.
//
// Each draft is stored under its own key, so tabs editing different
// drafts never overwrite each other. A draft is {id, name, code,
// updated}; name is empty unless the visitor chose one, in which case
// the title in the code is used.

const PREFIX = 'blinken-draft:';
const OLD_KEY = 'blinken-draft';  // the single draft of earlier versions

export const available = (() => {
  try {
    localStorage.setItem(PREFIX + 'test', '1');
    localStorage.removeItem(PREFIX + 'test');
    return true;
  } catch (e) {
    return false;
  }
})();

function read(key) {
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    return draft && typeof draft.code === 'string' ? draft : null;
  } catch (e) {
    return null;
  }
}

function write(draft) {
  try {
    localStorage.setItem(PREFIX + draft.id, JSON.stringify(draft));
    return true;
  } catch (e) {
    return false;
  }
}

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)),
      (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

// The title from `new Blinken({title: ...})`, if the code has one
export function titleOf(code) {
  const m = /\btitle\s*:\s*(["'`])((?:(?!\1).){1,100})\1/.exec(code);
  return m ? m[2].trim() : '';
}

export function displayName(draft) {
  return draft.name || titleOf(draft.code) || 'Untitled';
}

export function get(id) {
  return read(PREFIX + id);
}

// All drafts, most recently changed first
export function list() {
  const drafts = [];
  if (!available) {
    return drafts;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      const draft = read(key);
      if (draft) {
        drafts.push(draft);
      }
    }
  }
  return drafts.sort((a, b) => b.updated - a.updated);
}

export function create(code, name = '') {
  const draft = {id: newId(), name, code, updated: Date.now()};
  write(draft);
  return draft;
}

// Save a draft's code or name. Returns false if storage is full or
// unavailable.
export function save(draft) {
  draft.updated = Date.now();
  return write(draft);
}

export function remove(id) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch (e) {
    // Nothing to do
  }
}

// Turn the single draft saved by earlier versions into a named draft
export function migrate() {
  try {
    const code = localStorage.getItem(OLD_KEY);
    if (code) {
      create(code);
      localStorage.removeItem(OLD_KEY);
    }
  } catch (e) {
    // Nothing to migrate
  }
}

// Call fn(id, draft) when another tab changes a draft (draft is null if
// it was deleted)
export function onChange(fn) {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(PREFIX)) {
      fn(e.key.slice(PREFIX.length), e.newValue ? read(e.key) : null);
    }
  });
}

export function fileName(draft) {
  const slug = displayName(draft).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug || 'show'}.js`;
}
