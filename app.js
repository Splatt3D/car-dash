'use strict';

const STORE_KEY = 'carDash.v1';
const YT_MUSIC_HOME = 'https://music.youtube.com/';
const MAPS_HOME = 'https://www.google.com/maps/@?api=1&map_action=map';
const APP_SWITCH_TIMEOUT_MS = 1500;

/* ---------- URL builders (pure; checked by tests/url-builders.test.js) ---------- */

function parseLatLng(text) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text || '');
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function destinationQuery(text) {
  const pos = parseLatLng(text);
  return pos ? `${pos.lat},${pos.lng}` : String(text).trim();
}

function googleMapsAppUrl(destination) {
  return `comgooglemaps://?daddr=${encodeURIComponent(destinationQuery(destination))}&directionsmode=driving`;
}

function googleMapsWebUrl(destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery(destination))}&travelmode=driving`;
}

function mapsEmbedUrl(apiKey, center) {
  return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(apiKey)}&center=${center.lat},${center.lng}&zoom=15`;
}

function isYouTubeMusicUrl(text) {
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname === 'music.youtube.com';
  } catch {
    return false;
  }
}

/* ---------- Settings storage ---------- */

const DEFAULTS = {
  destinations: [
    { id: 'home', label: 'Home', icon: '🏠', address: '' },
    { id: 'work', label: 'Work', icon: '💼', address: '' },
  ],
  music: [
    { id: 'liked', label: 'Liked songs', icon: '❤️', url: 'https://music.youtube.com/playlist?list=LM', example: true },
    { id: 'library', label: 'Library', icon: '📚', url: 'https://music.youtube.com/library', example: true },
  ],
  showClock: true,
  theme: 'dark',
  wakeTipSeen: false,
};

function loadSettings() {
  const defaults = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && typeof saved === 'object') return Object.assign(defaults, saved);
  } catch {
    // Storage unavailable (private mode, Node tests): run on defaults.
  }
  return defaults;
}

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // Changes still apply for this session.
  }
}

const settings = loadSettings();
const view = { position: null, locating: false, editing: null };
let wakeLock = null;

/* ---------- DOM helpers ---------- */

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function button(text, onclick, className = '', extra = {}) {
  return el('button', { className: `btn ${className}`, type: 'button', textContent: text, onclick, ...extra });
}

/* ---------- Launching apps ---------- */

// Assigning location (not window.open) lets iOS treat the URL as an app launch.
function openUrl(url) {
  window.location.href = url;
}

// iOS gives no error when a custom scheme has no app to open it. If Google Maps
// launches, this page is backgrounded (document.hidden) before the timer fires;
// if the page is still visible after the timeout, the app is missing, so open
// the web directions URL instead.
function navigateTo(destination) {
  const onVisibilityChange = () => {
    if (!document.hidden) return;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  const timer = setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) openUrl(googleMapsWebUrl(destination));
  }, APP_SWITCH_TIMEOUT_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  openUrl(googleMapsAppUrl(destination));
}

/* ---------- Dashboard ---------- */

function tile(icon, label, note, onclick) {
  return el('button', { className: 'tile', type: 'button', onclick }, [
    el('span', { className: 'tile-icon', textContent: icon, 'aria-hidden': 'true' }),
    el('span', { className: 'tile-label', textContent: label }),
    ...(note ? [el('span', { className: 'tile-note', textContent: note })] : []),
  ]);
}

function renderTiles() {
  document.getElementById('nav-row').replaceChildren(...settings.destinations.map((dest) =>
    dest.address
      ? tile(dest.icon, dest.label, '', () => navigateTo(dest.address))
      : tile(dest.icon, dest.label, 'Set up', () => openSettings({ kind: 'destinations', id: dest.id }))));

  document.getElementById('music-row').replaceChildren(
    tile('🎧', 'YouTube Music', '', () => openUrl(YT_MUSIC_HOME)),
    ...settings.music.map((item) => tile(item.icon, item.label, '', () => openUrl(item.url))));
}

function renderClock() {
  const clock = document.getElementById('clock');
  clock.hidden = !settings.showClock;
  clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

/* ---------- Map ---------- */

function mapsApiKey() {
  return ((window.CONFIG && window.CONFIG.MAPS_API_KEY) || '').trim();
}

function mapCenter() {
  if (view.position) return view.position;
  const home = settings.destinations.find((dest) => dest.id === 'home');
  return home ? parseLatLng(home.address) : null;
}

function showMapPlaceholder(panel, title, detail) {
  panel.replaceChildren(el('div', { className: 'map-placeholder' }, [
    el('p', { className: 'ph-title', textContent: title }),
    el('p', { className: 'ph-detail', textContent: detail }),
    button('Open Google Maps', () => openUrl(MAPS_HOME)),
  ]));
}

function renderMap() {
  const panel = document.getElementById('map-view');
  const key = mapsApiKey();
  const center = mapCenter();

  if (!navigator.onLine) {
    return showMapPlaceholder(panel, "You're offline", 'Navigation and music tiles still work.');
  }
  if (!key) {
    return showMapPlaceholder(panel, 'Map preview needs an API key', 'Add MAPS_API_KEY in config.js (see README).');
  }
  if (!center) {
    return view.locating
      ? showMapPlaceholder(panel, 'Finding your location…', '')
      : showMapPlaceholder(panel, 'Location unavailable', 'Allow location access, or set Home as lat,lng in settings.');
  }

  const src = mapsEmbedUrl(key, center);
  const current = panel.querySelector('iframe');
  if (current && current.dataset.src === src) return; // avoid reloading an unchanged map
  panel.replaceChildren(el('iframe', {
    src,
    'data-src': src,
    title: 'Map of your current area',
    referrerPolicy: 'no-referrer-when-downgrade',
  }));
}

function locate() {
  if (!('geolocation' in navigator)) return renderMap();
  view.locating = true;
  renderMap();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      // Rounded to ~10 m so GPS jitter doesn't reload the map iframe.
      view.position = { lat: Number(pos.coords.latitude.toFixed(4)), lng: Number(pos.coords.longitude.toFixed(4)) };
      view.locating = false;
      renderMap();
    },
    () => {
      view.locating = false;
      renderMap();
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
  );
}

/* ---------- Wake lock ---------- */

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return showWakeTip();
  if (wakeLock || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // Refused (e.g. Low Power Mode); retried on the next visibilitychange.
  }
}

function showWakeTip() {
  if (!settings.wakeTipSeen) document.getElementById('wake-tip').hidden = false;
}

function dismissWakeTip() {
  settings.wakeTipSeen = true;
  saveSettings();
  document.getElementById('wake-tip').hidden = true;
}

/* ---------- Settings sheet ---------- */

function sheet() {
  return document.getElementById('settings');
}

function openSettings(editing = null) {
  view.editing = editing;
  renderSettings();
  if (!sheet().open) sheet().showModal();
}

function renderSettings() {
  const body = document.getElementById('settings-body');
  body.replaceChildren(...(view.editing ? editorView() : overviewView()));
  body.scrollTop = 0;
}

function saveAndRefresh() {
  saveSettings();
  applyTheme();
  renderSettings();
  renderTiles();
  renderClock();
}

function sheetHeader(title, actionText, onAction) {
  return el('header', { className: 'sheet-header' }, [
    el('h2', { textContent: title }),
    button(actionText, onAction, 'primary'),
  ]);
}

function overviewView() {
  return [
    sheetHeader('Settings', 'Done', () => sheet().close()),
    listSection('Destinations', 'destinations', (dest) => dest.address || 'Not set'),
    listSection('Music', 'music', (item) => item.url),
    el('section', { className: 'group' }, [
      el('h3', { textContent: 'Display' }),
      button(`Clock: ${settings.showClock ? 'On' : 'Off'}`, () => {
        settings.showClock = !settings.showClock;
        saveAndRefresh();
      }, 'wide'),
      el('div', { className: 'seg', role: 'group', 'aria-label': 'Theme' }, ['dark', 'light', 'system'].map((theme) =>
        button(theme[0].toUpperCase() + theme.slice(1), () => {
          settings.theme = theme;
          saveAndRefresh();
        }, '', { 'aria-pressed': String(settings.theme === theme) }))),
    ]),
    ...(mapsApiKey() ? [] : [el('section', { className: 'group' }, [
      el('h3', { textContent: 'Map' }),
      el('p', { className: 'note', textContent: 'Add an API key to see the live map: put your Maps Embed API key in config.js as MAPS_API_KEY. The README explains how to get and restrict one.' }),
    ])]),
  ];
}

function listSection(title, kind, describe) {
  const items = settings[kind];
  return el('section', { className: 'group' }, [
    el('h3', { textContent: title }),
    ...items.map((item, i) => el('div', { className: 'item' }, [
      el('div', { className: 'item-head' }, [
        el('span', { className: 'item-icon', textContent: item.icon, 'aria-hidden': 'true' }),
        el('div', { className: 'item-text' }, [
          el('div', { className: 'item-label', textContent: item.example ? `${item.label} (example)` : item.label }),
          el('div', { className: 'item-sub', textContent: describe(item) }),
        ]),
      ]),
      el('div', { className: 'item-actions' }, [
        button('↑', () => moveItem(kind, i, -1), '', { disabled: i === 0, 'aria-label': `Move ${item.label} up` }),
        button('↓', () => moveItem(kind, i, 1), '', { disabled: i === items.length - 1, 'aria-label': `Move ${item.label} down` }),
        button('Edit', () => openSettings({ kind, id: item.id })),
        button('Delete', () => deleteItem(kind, i), 'danger'),
      ]),
    ])),
    button(kind === 'destinations' ? 'Add destination' : 'Add music tile', () => openSettings({ kind, id: null }), 'wide'),
  ]);
}

function moveItem(kind, index, step) {
  const list = settings[kind];
  [list[index], list[index + step]] = [list[index + step], list[index]];
  saveAndRefresh();
}

function deleteItem(kind, index) {
  if (!window.confirm(`Delete "${settings[kind][index].label}"?`)) return;
  settings[kind].splice(index, 1);
  saveAndRefresh();
}

function field(labelText, type, value, placeholder) {
  const input = el('input', { type, value: value || '', placeholder, autocomplete: 'off', spellcheck: false });
  return { input, wrap: el('label', { className: 'field' }, [el('span', { textContent: labelText }), input]) };
}

function firstGlyph(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (window.Intl && Intl.Segmenter) return new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value.segment;
  return Array.from(trimmed)[0];
}

function editorView() {
  const { kind, id } = view.editing;
  const isDest = kind === 'destinations';
  const targetKey = isDest ? 'address' : 'url';
  const defaultIcon = isDest ? '📍' : '🎵';
  const existing = settings[kind].find((item) => item.id === id);

  const label = field('Label', 'text', existing && existing.label, isDest ? 'e.g. Gym' : 'e.g. Road trip mix');
  const icon = field('Icon (one emoji)', 'text', existing ? existing.icon : defaultIcon, defaultIcon);
  const target = isDest
    ? field('Address or lat,lng', 'text', existing && existing.address, 'e.g. 1 Main Rd, Cape Town or -33.92,18.42')
    : field('YouTube Music link', 'url', existing && existing.url, 'https://music.youtube.com/playlist?list=…');
  const error = el('p', { className: 'error', role: 'alert' });

  const onSubmit = (event) => {
    event.preventDefault();
    const values = { label: label.input.value.trim(), target: target.input.value.trim() };
    const problem = !values.label ? 'Enter a label.'
      : !values.target ? (isDest ? 'Enter an address or lat,lng.' : 'Paste a YouTube Music link.')
      : !isDest && !isYouTubeMusicUrl(values.target) ? 'The link must start with https://music.youtube.com/'
      : '';
    if (problem) {
      error.textContent = problem;
      return;
    }
    const updated = { id: id || newId(), label: values.label, icon: firstGlyph(icon.input.value) || defaultIcon, [targetKey]: values.target };
    const list = settings[kind];
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) list[index] = updated;
    else list.push(updated);
    saveSettings();
    renderTiles();
    openSettings();
  };

  return [
    sheetHeader(existing ? 'Edit' : 'Add', 'Back', () => openSettings()),
    el('form', { className: 'editor', onsubmit: onSubmit }, [
      label.wrap,
      icon.wrap,
      target.wrap,
      error,
      el('div', { className: 'editor-actions' }, [
        button('Cancel', () => openSettings()),
        el('button', { className: 'btn primary', type: 'submit', textContent: 'Save' }),
      ]),
    ]),
  ];
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Startup ---------- */

function bindEvents() {
  document.getElementById('open-settings').addEventListener('click', () => openSettings());
  document.getElementById('dismiss-tip').addEventListener('click', dismissWakeTip);
  sheet().addEventListener('close', () => {
    view.editing = null;
    renderMap();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    renderClock();
    requestWakeLock();
    locate();
  });
  window.addEventListener('online', renderMap);
  window.addEventListener('offline', renderMap);
  // iOS ignores user-scalable=no, so block pinch-zoom directly.
  document.addEventListener('gesturestart', (event) => event.preventDefault());
}

function init() {
  applyTheme();
  renderTiles();
  renderClock();
  bindEvents();
  locate();
  requestWakeLock();
  setInterval(renderClock, 10000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (typeof module === 'object' && module.exports) {
  module.exports = { parseLatLng, destinationQuery, googleMapsAppUrl, googleMapsWebUrl, mapsEmbedUrl, isYouTubeMusicUrl };
} else {
  init();
}
