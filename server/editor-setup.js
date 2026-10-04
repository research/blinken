// The playground's editor setup: CodeMirror's basicSetup, without the
// search panel's keys, so Ctrl+F opens the browser's own find bar, and
// with a dark theme to match the site.
// Bundled into static/vendor/codemirror.js by build-vendor.js.

import {autocompletion, closeBrackets, closeBracketsKeymap,
  completionKeymap} from '@codemirror/autocomplete';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {bracketMatching, foldGutter, foldKeymap, HighlightStyle,
  indentOnInput, syntaxHighlighting} from '@codemirror/language';
import {lintKeymap} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search';
import {EditorState} from '@codemirror/state';
import {crosshairCursor, drawSelection, dropCursor, EditorView,
  highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  keymap, lineNumbers, rectangularSelection} from '@codemirror/view';
import {tags as t} from '@lezer/highlight';

// Keys that open, step through, or close the search panel
const SEARCH_PANEL_KEYS = new Set(['Mod-f', 'F3', 'Mod-g', 'Escape']);

// Colors come from site.css, so the editor follows the site's palette
const theme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--editor-bg)',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-cursor, .cm-dropCursor': {borderLeftColor: 'var(--accent)'},
  ['&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ' +
    '.cm-selectionBackground, .cm-content ::selection']: {
    backgroundColor: 'var(--editor-selection)',
  },
  '.cm-activeLine': {backgroundColor: 'var(--editor-active-line)'},
  '.cm-selectionMatch': {backgroundColor: 'var(--editor-match)'},
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--editor-match)',
    outline: '1px solid var(--border-strong)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--faint)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--editor-active-line)',
    color: 'var(--muted)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--panel-hover)',
    border: 'none',
    color: 'var(--muted)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--editor-selection)',
    color: 'var(--text)',
  },
}, {dark: true});

const highlightStyle = HighlightStyle.define([
  {tag: t.comment, color: '#6b7393', fontStyle: 'italic'},
  {tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword],
    color: '#ff7aa8'},
  {tag: [t.string, t.special(t.string), t.regexp], color: '#ffc879'},
  {tag: [t.number, t.bool, t.null, t.atom], color: '#b79cff'},
  {tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: '#6ee7f2'},
  {tag: [t.definition(t.variableName), t.definition(t.propertyName)],
    color: '#e8eaf2'},
  {tag: t.propertyName, color: '#9fd8ff'},
  {tag: [t.className, t.typeName], color: '#8ef0b0'},
  {tag: [t.operator, t.punctuation, t.bracket], color: '#9aa1b8'},
  {tag: t.invalid, color: '#ff6b6b'},
]);

export const editorSetup = [
  theme,
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(highlightStyle),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap.filter((binding) => !SEARCH_PANEL_KEYS.has(binding.key)),
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];
