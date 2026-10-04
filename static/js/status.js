// Live status: what's playing, and a live view of the lights.

import {watchCurrent, watchLights} from './live.js';
import {Stairs} from './stairs.js';

const $ = (id) => document.getElementById(id);

watchCurrent((now) => {
  $('title').textContent = now.title || 'Untitled';
  $('author').textContent = now.author ? `by ${now.author}` : '';
  const link = $('link');
  if (/^https?:/.test(now.url || '')) {
    link.href = now.url;
  } else {
    link.removeAttribute('href');
  }
  const secs = Math.max(0, Math.round(now.time_left));
  $('time').textContent =
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} left`;
});

watchLights(new Stairs($('view')), (connected) => {
  $('connection').textContent = connected ? '' :
    'Reconnecting to the live view…';
});
