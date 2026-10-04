// The playground's editor setup: CodeMirror's basicSetup, without the
// search panel's keys, so Ctrl+F opens the browser's own find bar.
// Bundled into static/vendor/codemirror.js by build-vendor.js.

import {autocompletion, closeBrackets, closeBracketsKeymap,
  completionKeymap} from '@codemirror/autocomplete';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap,
  indentOnInput, syntaxHighlighting} from '@codemirror/language';
import {lintKeymap} from '@codemirror/lint';
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search';
import {EditorState} from '@codemirror/state';
import {crosshairCursor, drawSelection, dropCursor, highlightActiveLine,
  highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers,
  rectangularSelection} from '@codemirror/view';

// Keys that open, step through, or close the search panel
const SEARCH_PANEL_KEYS = new Set(['Mod-f', 'F3', 'Mod-g', 'Escape']);

export const editorSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
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
