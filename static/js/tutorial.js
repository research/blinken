// Tutorial page: a live view of the stairs beside the introduction.

import {watchCurrent, watchLights} from './live.js';
import {Stairs} from './stairs.js';

const $ = (id) => document.getElementById(id);

// The view links to the live page, so it isn't draggable
watchLights(new Stairs($('view'), {interactive: false}));

watchCurrent((now) => {
  $('title').textContent = now.title || 'Untitled';
  $('author').textContent = now.author ? `by ${now.author}` : '';
});
