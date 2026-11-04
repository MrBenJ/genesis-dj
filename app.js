// Genesis DJ: Web MIDI (DJ controller) -> EmulatorJS (Sega Genesis).

const $ = (id) => document.getElementById(id);
const PLAYERS = 2;
const JOG_HOLD_MS = 120;          // how long one jog tick holds a direction
const FADER_LOW = 40, FADER_HIGH = 88;
const LEARN_WINDOW_MS = 300;

let profile = null;
let mapping = {};
let learning = null;                // { p, btn, key, values, timer }
const held = new Map();             // "p:BTN" -> Set of source ids holding it
const jogTimers = new Map();        // source id -> timeout
const monitorLines = [];

// ---------- profiles & persistence ----------

const storeKey = (id) => `genesis-dj:map:${id}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

function loadProfile(id) {
  releaseAll();
  profile = PROFILES.find((p) => p.id === id) || PROFILES[0];
  const saved = localStorage.getItem(storeKey(profile.id));
  mapping = saved ? JSON.parse(saved) : clone(profile.mapping);
  localStorage.setItem('genesis-dj:profile', profile.id);
  $('hint').textContent = `${profile.notes} Click a button to remap it, right-click to clear it.`;
  renderPads();
}

function saveMapping() {
  localStorage.setItem(storeKey(profile.id), JSON.stringify(mapping));
  renderPads();
}

// ---------- emulator output ----------

function sendInput(p, btn, on) {
  const gm = window.EJS_emulator && window.EJS_emulator.gameManager;
  if (gm && gm.simulateInput) gm.simulateInput(p, EJS_INDEX[btn], on ? 1 : 0);
  const el = document.querySelector(`.key[data-p="${p}"][data-btn="${btn}"]`);
  if (el) el.classList.toggle('on', on);
  if (on && !learning) showDetail(p, `<b>${btn}</b>  ${sourcesFor(p, btn)[0] || ''}`);
}

function setSource(target, src, on) {
  if (!target) return;
  const [p, btn] = target;
  const k = `${p}:${btn}`;
  if (!held.has(k)) held.set(k, new Set());
  const set = held.get(k);
  const was = set.size > 0;
  on ? set.add(src) : set.delete(src);
  if (was !== set.size > 0) sendInput(p, btn, set.size > 0);
}

function pulse(target, src) {
  setSource(target, src, true);
  clearTimeout(jogTimers.get(src));
  jogTimers.set(src, setTimeout(() => setSource(target, src, false), JOG_HOLD_MS));
}

function releaseAll() {
  for (const [k, set] of held) {
    if (set.size) {
      const [p, btn] = k.split(':');
      sendInput(Number(p), btn, false);
    }
  }
  held.clear();
  jogTimers.forEach(clearTimeout);
  jogTimers.clear();
}

// ---------- MIDI input ----------

function handleMidi(data) {
  const [status, d1, d2 = 0] = data;
  const type = status & 0xf0;
  const ch = status & 0x0f;
  let key, isNote = false, value = d2;

  if (type === 0x90 || type === 0x80) {
    isNote = true;
    key = `note:${ch}:${d1}`;
    if (type === 0x80) value = 0;
  } else if (type === 0xb0) {
    key = `cc:${ch}:${d1}`;
  } else {
    return; // ignore clock, sysex, pitch bend, etc.
  }

  const binding = mapping[key];
  logMonitor(key, value, binding);

  if (learning) return learnFrom(key, isNote, value);
  if (!binding) return;

  switch (binding.kind) {
    case 'button':
      setSource(binding.pos, key, value >= (isNote ? 1 : 64));
      break;
    case 'relative': {
      if (value === 64 || value === 0) return;
      const dir = value > 64 ? 'pos' : 'neg';
      const other = dir === 'pos' ? 'neg' : 'pos';
      setSource(binding[other], `${key}:${other}`, false);
      pulse(binding[dir], `${key}:${dir}`);
      break;
    }
    case 'absolute':
      setSource(binding.pos, `${key}:pos`, value > FADER_HIGH);
      setSource(binding.neg, `${key}:neg`, value < FADER_LOW);
      break;
  }
}

async function initMidi() {
  const setStatus = (state, text) => {
    $('midi-status').dataset.state = state;
    $('midi-status').querySelector('.midi-text').textContent = text;
    $('midi-status').title = text;
  };
  if (!navigator.requestMIDIAccess) return setStatus('error', 'Web MIDI needs Chrome or Edge');
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const refresh = () => {
      const names = [];
      access.inputs.forEach((input) => {
        input.onmidimessage = (e) => handleMidi(e.data);
        names.push(input.name);
      });
      if (names.length) setStatus('ok', names.join(', '));
      else setStatus('idle', 'No MIDI device plugged in');
    };
    access.onstatechange = refresh;
    refresh();
  } catch (err) {
    setStatus('error', 'MIDI access blocked');
  }
}

// ---------- learn mode ----------

function startLearning(p, btn) {
  cancelLearning();
  learning = { p, btn, key: null, values: [], timer: null };
  renderPads();
}

function cancelLearning() {
  if (learning) clearTimeout(learning.timer);
  learning = null;
}

function learnFrom(key, isNote, value) {
  const target = [learning.p, learning.btn];
  if (isNote) {
    if (value === 0) return; // wait for a note-on
    mapping[key] = { kind: 'button', pos: target };
    cancelLearning();
    return saveMapping();
  }
  // CC: watch a short burst of values to tell a jog wheel from a fader or button.
  if (learning.key && learning.key !== key) return;
  learning.key = key;
  learning.values.push(value);
  if (learning.timer) return;
  learning.timer = setTimeout(() => {
    const vals = learning.values;
    const last = vals[vals.length - 1];
    const distinct = new Set(vals).size;
    const dir = last > 64 ? 'pos' : 'neg';
    const prev = mapping[key] || {};
    if (vals.every((v) => v === 0 || v === 127)) {
      mapping[key] = { kind: 'button', pos: target };
    } else {
      const kind = distinct <= 4 ? 'relative' : 'absolute';
      mapping[key] = { kind, ...(prev.kind === kind ? prev : {}), [dir]: target };
    }
    cancelLearning();
    saveMapping();
  }, LEARN_WINDOW_MS);
}

function clearButton(p, btn) {
  for (const [key, b] of Object.entries(mapping)) {
    for (const side of ['pos', 'neg']) {
      if (b[side] && b[side][0] === p && b[side][1] === btn) delete b[side];
    }
    if (!b.pos && !b.neg) delete mapping[key];
  }
  saveMapping();
}

// ---------- UI ----------

function describeKey(key, kind) {
  const [type, ch, num] = key.split(':');
  const label = kind === 'relative' ? 'jog' : kind === 'absolute' ? 'fader' : type;
  return `${label} ch${Number(ch) + 1} #${num}`;
}

function sourcesFor(p, btn) {
  const out = [];
  for (const [key, b] of Object.entries(mapping)) {
    for (const side of ['pos', 'neg']) {
      if (b[side] && b[side][0] === p && b[side][1] === btn) out.push(describeKey(key, b.kind));
    }
  }
  return out;
}

const DEFAULT_DETAIL = 'Click a button to remap it.';
const ARROWS = { UP: 'ph-caret-up', DOWN: 'ph-caret-down', LEFT: 'ph-caret-left', RIGHT: 'ph-caret-right' };

function showDetail(p, html, live = false) {
  const el = $(`detail-${p}`);
  if (!el) return;
  el.innerHTML = html;
  el.classList.toggle('live', live);
}

function makeKey(p, btn) {
  const el = document.createElement('button');
  el.className = 'key';
  el.dataset.p = p;
  el.dataset.btn = btn;
  el.setAttribute('aria-label', `Player ${p + 1} ${btn}`);
  el.innerHTML = ARROWS[btn] ? `<i class="ph-bold ${ARROWS[btn]}" aria-hidden="true"></i>` : btn;
  const srcs = sourcesFor(p, btn);
  const isLearning = learning && learning.p === p && learning.btn === btn;
  if (!srcs.length) el.classList.add('unbound');
  if (isLearning) el.classList.add('learning');
  if (held.get(`${p}:${btn}`)?.size) el.classList.add('on');

  const describe = () => srcs.length
    ? `<b>${btn}</b>  ${srcs.join(', ')}`
    : `<b>${btn}</b>  not mapped`;
  el.onmouseenter = () => !learning && showDetail(p, describe());
  el.onmouseleave = () => !learning && showDetail(p, DEFAULT_DETAIL);
  el.onclick = () => {
    if (isLearning) { cancelLearning(); renderPads(); } else startLearning(p, btn);
  };
  el.oncontextmenu = (e) => { e.preventDefault(); clearButton(p, btn); };
  return el;
}

function renderPads() {
  const root = $('pads');
  root.innerHTML = '';
  for (let p = 0; p < PLAYERS; p++) {
    const deck = document.createElement('section');
    deck.className = 'deck';
    deck.innerHTML = `
      <header class="deck-head"><h2>Player ${p + 1}</h2><span>${profile.decks[p]}</span></header>
      <div class="pad">
        <div class="dpad"><span class="hub"></span></div>
        <div class="start"></div>
        <div class="face"></div>
      </div>
      <div class="deck-detail" id="detail-${p}"></div>`;
    for (const b of ['UP', 'LEFT', 'RIGHT', 'DOWN']) deck.querySelector('.dpad').appendChild(makeKey(p, b));
    deck.querySelector('.start').appendChild(makeKey(p, 'START'));
    for (const b of ['A', 'B', 'C']) deck.querySelector('.face').appendChild(makeKey(p, b));
    root.appendChild(deck);

    if (learning && learning.p === p) showDetail(p, `Move a control for <b>${learning.btn}</b>. Esc cancels.`, true);
    else showDetail(p, DEFAULT_DETAIL);
  }
}

function logMonitor(key, value, binding) {
  let arrow = '';
  if (binding) {
    const t = [binding.pos, binding.neg].filter(Boolean).map(([p, b]) => `P${p + 1} ${b}`).join(' / ');
    arrow = ` → ${t}`;
  }
  monitorLines.unshift(`${describeKey(key, binding && binding.kind).padEnd(16)} ${String(value).padStart(3)}${arrow}`);
  monitorLines.length = Math.min(monitorLines.length, 10);
  $('monitor').textContent = monitorLines.join('\n');
}

// ---------- emulator boot ----------

let started = false;

function startEmulator(file) {
  if (started) {
    alert('A game is already running. Reload the page to load a different ROM.');
    return;
  }
  started = true;
  $('screen').classList.add('running');
  window.EJS_player = '#game';
  window.EJS_core = 'segaMD';
  window.EJS_gameName = file.name.replace(/\.[^.]+$/, '');
  window.EJS_gameUrl = URL.createObjectURL(file);
  window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
  window.EJS_startOnLoaded = true;
  window.EJS_color = '#ff2e88';
  const s = document.createElement('script');
  s.src = 'https://cdn.emulatorjs.org/stable/data/loader.js';
  document.body.appendChild(s);
}

// ---------- wire up ----------

const select = $('controller');
for (const p of PROFILES) select.add(new Option(p.name, p.id));
select.value = localStorage.getItem('genesis-dj:profile') || PROFILES[0].id;
select.onchange = () => { cancelLearning(); loadProfile(select.value); };

$('rom').onchange = (e) => e.target.files[0] && startEmulator(e.target.files[0]);

const screen = $('screen');
screen.addEventListener('dragover', (e) => { e.preventDefault(); if (!started) screen.classList.add('dragging'); });
screen.addEventListener('dragleave', () => screen.classList.remove('dragging'));
screen.addEventListener('drop', (e) => {
  e.preventDefault();
  screen.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) startEmulator(file);
});

$('reset').onclick = () => {
  if (!confirm(`Reset ${profile.name} to its default mapping?`)) return;
  localStorage.removeItem(storeKey(profile.id));
  loadProfile(profile.id);
};

$('export').onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(mapping, null, 2));
  const label = $('export').querySelector('span');
  label.textContent = 'Copied';
  setTimeout(() => (label.textContent = 'Copy mapping'), 1200);
};

const togglePanel = () => {
  document.body.classList.toggle('panel-hidden');
  $('toggle-panel').querySelector('.toggle-label').textContent = document.body.classList.contains('panel-hidden') ? 'Show panel' : 'Hide panel';
};
$('toggle-panel').onclick = togglePanel;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && learning) { cancelLearning(); renderPads(); }
  if ((e.key === 'h' || e.key === 'H') && !e.target.closest('input, select, textarea')) togglePanel();
});

// Lets you test without hardware from the devtools console, e.g. genesisDJ.midi([0x90, 11, 127])
window.genesisDJ = { midi: handleMidi, get mapping() { return mapping; } };

loadProfile(select.value);
initMidi();
