const names = ['Copper', 'Silver', 'Gold', 'Emerald', 'Sapphire', 'Amethyst', 'Solar', 'Celestial', 'Nebula', 'Eclipse', 'Supernova', 'Infinity', ...extendedTiers];
const key = 'trophy-gallery-v1';
const $ = id => document.getElementById(id);
function formatNumber(value, decimals = 0) {
  if (value >= 1e15) return value.toExponential(2);
  return value.toLocaleString(undefined, {maximumFractionDigits: decimals});
}
const format = value => formatNumber(Math.floor(value));
const now = Date.now();
const boardSize = 25;
const initial = { slots: [1, 1, ...Array(boardSize - 2).fill(0)], coins: 45, xp: 0, level: 1, purchases: 0, crafted: [1], time: now };
let state = initial;
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (Array.isArray(saved?.slots) && [12, boardSize].includes(saved.slots.length) && saved.slots.every(t => Number.isInteger(t) && t >= 0 && t <= names.length)
      && Number.isFinite(saved.coins) && saved.coins >= 0 && Number.isInteger(saved.level) && saved.level >= 1
      && Number.isFinite(saved.xp) && saved.xp >= 0 && Number.isFinite(saved.time)) state = saved;
} catch {}
while (state.slots.length < boardSize) state.slots.push(0);
// Legacy saves can recover purchases from the number of Copper Cups in the collection.
if (!Number.isSafeInteger(state.purchases) || state.purchases < 0) {
  state.purchases = Math.max(0, state.slots.reduce((sum, tier) => sum + (tier ? 2 ** (tier - 1) : 0), 0) - 2);
}
// Old saves could reach higher tiers only by merging through all lower tiers.
if (!Array.isArray(state.crafted)) {
  const legacyTier = Number.isInteger(state.highestCrafted) && state.highestCrafted <= names.length
    ? state.highestCrafted : 1;
  state.crafted = Array.from({length: Math.max(legacyTier, ...state.slots, 1)}, (_, index) => index + 1);
}
const crafted = new Set(state.crafted.filter(tier => Number.isInteger(tier) && tier >= 1 && tier <= names.length));
let selected = -1;
let dragged = -1;
let audio;
let musicTimer;
let playing = false;
let sounds = state.sounds !== false;
let musicBus;
let phrase = 0;
const required = () => 20 + (state.level - 1) * 10;
const value = tier => tier ? 3 ** (tier - 1) : 0;
const multiplier = () => 1 + (state.level - 1) * .1;
const rate = () => state.slots.reduce((sum, tier) => sum + value(tier), 0) * multiplier();
// Keep the final trophy craftable only by merging.
const shopTier = () => Math.min(names.length - 1, Math.max(1, Math.floor(state.level / 5)));
// Price tracks the earning power of the shop cup and rises with every purchase.
const selectedShopTier = () => Math.min(shopTier(), Number($('shop-choice').value) || shopTier());
const price = (tier = selectedShopTier()) => (60 + state.purchases * 8) * value(tier);

let displayedShopTier = 0;
function updateShopPicker() {
  const limit = shopTier();
  if (limit === displayedShopTier) return;
  displayedShopTier = limit;
  const picker = $('shop-choice');
  const previous = picker.value;
  picker.length = 1;
  for (let tier = 1; tier <= limit; tier++) {
    const option = document.createElement('option');
    option.value = String(tier);
    option.textContent = 'Tier ' + tier + ' · ' + names[tier - 1] + ' Cup';
    picker.append(option);
  }
  picker.value = Number(previous) <= limit ? previous : '';
}
$('shop-choice').addEventListener('change', updateStats);
const isComplete = () => state.slots.every(tier => tier === names.length);
const save = () => {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
};
const notice = message => { $('notice').textContent = message; };
function settle() {
  const time = Date.now();
  const earned = Math.min(8 * 3600, Math.max(0, (time - state.time) / 1000)) * rate();
  state.coins += earned;
  state.time = time;
  return earned;
}
function updateStats() {
  updateShopPicker();
  const occupied = state.slots.filter(Boolean).length;
  $('coins').textContent = format(state.coins);
  $('rate').textContent = '+' + formatNumber(rate(), 1) + '/s';
  $('level').textContent = state.level;
  $('xp').max = required();
  $('xp').value = state.xp;
  $('xp-label').textContent = state.xp + ' / ' + required() + ' XP';
  $('price').textContent = occupied === boardSize ? 'Gallery full' : '◈ ' + format(price());
  $('buy').firstElementChild.textContent = '＋ Buy ' + names[selectedShopTier() - 1] + ' Cup';
  $('buy').disabled = occupied === boardSize || state.coins < price();
  $('trash').classList.toggle('ready', selected >= 0);
  $('trash').setAttribute('aria-disabled', String(selected < 0));

}

const buttons = state.slots.map((_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.addEventListener('click', () => choose(index));
  button.addEventListener('dragstart', event => {
    dragged = index;
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  });
  button.addEventListener('dragend', () => { dragged = -1; });
  button.addEventListener('dragover', event => {
    if (dragged >= 0) event.preventDefault();
  });
  button.addEventListener('drop', event => {
    event.preventDefault();
    if (dragged >= 0) {
      selected = dragged;
      choose(index);
      dragged = -1;
    }
  });
  $('board').append(button);
  return button;
});


function paint(animate = -1) {
  buttons.forEach((button, index) => {
    const tier = state.slots[index];
    button.className = 'slot' + (tier ? '' : ' empty');
    button.classList.toggle('match', selected >= 0 && index !== selected && tier > 0 && tier === state.slots[selected] && tier < names.length);
    button.classList.toggle('final-trophy', tier === names.length);
    button.draggable = Boolean(tier);
    button.title = tier ? names[tier - 1] + ' Cup · +' + formatNumber(value(tier)) + '/s base' : 'Empty pedestal';
    button.setAttribute('aria-pressed', String(index === selected));
    button.setAttribute('aria-label', tier ? 'Pedestal ' + (index + 1) + ', ' + names[tier - 1] + ' Cup, tier ' + tier : 'Empty pedestal ' + (index + 1));
    button.innerHTML = tier
      ? '<img draggable="false" alt="" src="assets/trophy-' + tier + '.png"><span class="tier">' + tier + '</span>'
        : '<span class="pedestal"></span>';
  });
  if (animate >= 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    buttons[animate].animate([{transform:'scale(.93)', filter:'brightness(1.7)'},{transform:'scale(1)', filter:'brightness(1)'}], 340);
  }
  updateStats();
  if (!$('book').hidden) paintBook();
}

function revealTrophy(tier, xp, previousLevel) {
  const name = names[tier - 1] + ' Cup';
  $('reveal-name').textContent = name;
  $('reveal-art').classList.toggle('final-trophy', tier === names.length);
  $('reveal-art').src = 'assets/trophy-' + tier + '.png';
  $('reveal-tier').textContent = tier + ' / ' + names.length;
  $('reveal-income').textContent = '+' + formatNumber(value(tier) * multiplier(), 1);
  $('reveal-xp').textContent = '+' + xp;
  const details = [];
  if (state.level > previousLevel) details.push('Level ' + state.level + ' reached!');
  if (tier === names.length) details.push('Highest trophy tier.');
  $('reveal-note').textContent = details.join(' ');
  $('reveal-note').hidden = details.length === 0;
  $('reveal').showModal();
}

function choose(index) {
  const tier = state.slots[index];
  if (selected === index) {
    selected = -1;
    notice('Selection cleared.');
  } else if (selected < 0) {
    if (!tier) return;
    selected = index;
    notice('Choose another ' + names[tier - 1] + ' Cup or an empty pedestal.');
  } else {
    const source = state.slots[selected];
    if (!tier || (tier === source && tier < names.length)) {
      settle();
      state.slots[selected] = 0;
      state.slots[index] = tier ? tier + 1 : source;
      selected = -1;
      const firstCraft = tier > 0 && !crafted.has(tier + 1);
      if (firstCraft) {
        crafted.add(tier + 1);
        state.crafted = [...crafted];
      }
      const previous = state.level;
      const earnedXp = 10 + tier * 4;
      if (tier) {
        state.xp += earnedXp;
        while (state.xp >= required()) {
          state.xp -= required();
          state.level++;
          state.coins += state.level * 5;
        }
        notice((tier + 1 === names.length ? names[tier] + ' Cup created! Collection complete.' : names[tier] + ' Cup created!') + (state.level > previous ? ' Level ' + state.level + ' reached. Income bonus increased.' : ' +' + earnedXp + ' XP.'));
        chime([72, 76, 79]);
      } else {
        notice('Trophy moved.');
        chime([60]);
      }
      if (isComplete()) {
        notice('Your exhibition is complete. All pedestals hold ' + names.at(-1) + ' Cups.');
      }
      save();
      paint(index);
      if (firstCraft) revealTrophy(tier + 1, earnedXp, previous);
      if (tier + 1 === names.length) celebrateFinalCup();
      return;
    }
    selected = index;
    notice(tier === source ? names.at(-1) + ' is the highest tier.' : 'Select two trophies of the same tier to merge.');
  }
  paint();
}

$('buy').addEventListener('click', () => {
  settle();
  const index = state.slots.indexOf(0);
  if (index < 0 || state.coins < price()) return;
  state.coins -= price();
  state.purchases++;
  const tier = selectedShopTier();
  state.slots[index] = tier;
  notice(names[tier - 1] + ' Cup added to pedestal ' + (index + 1) + '.');
  chime([67, 72]);
  save();
  paint(index);
});

const secretPanel = $('secret-panel');
const spawnTier = $('spawn-tier');
spawnTier.max = names.length;
const secretCode = 'secretpanel';
let typedCode = '';

function previewSpawn() {
  const tier = spawnTier.valueAsNumber;
  $('spawn-preview').textContent = names[tier - 1] ? names[tier - 1] + ' Cup' : 'Enter a tier from 1 to ' + names.length + '.';
}
spawnTier.addEventListener('input', previewSpawn);
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable]') || secretPanel.open || $('reveal').open) {
    typedCode = '';
    return;
  }
  if (event.key.length !== 1) return;
  typedCode = (typedCode + event.key.toLowerCase()).slice(-secretCode.length);
  if (typedCode !== secretCode) return;
  typedCode = '';
  $('spawn-status').textContent = '';
  previewSpawn();
  secretPanel.showModal();
});
$('spawn-close').addEventListener('click', () => secretPanel.close());
$('spawn-form').addEventListener('submit', event => {
  event.preventDefault();
  const tier = spawnTier.valueAsNumber;
  if (!Number.isInteger(tier) || tier < 1 || tier > names.length) return;
  const index = state.slots.indexOf(0);
  if (index < 0) {
    $('spawn-status').textContent = 'Free up a pedestal first.';
    return;
  }
  settle();
  state.slots[index] = tier;
  const message = names[tier - 1] + ' Cup spawned on pedestal ' + (index + 1) + '.';
  $('spawn-status').textContent = message;
  notice(message);
  chime([67, 72]);
  save();
  paint(index);
});

let celebrationTimer;
function celebrateFinalCup() {
  chime([72, 76, 79, 84, 88, 91]);
  const layer = $('celebration');
  clearTimeout(celebrationTimer);
  layer.replaceChildren();
  if (layer.matches(':popover-open')) layer.hidePopover();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pieces = document.createDocumentFragment();
  const gold = ['#ffd64e', '#ffedac', '#f7ac28', '#fff4cf', '#dc9115'];
  const count = reduced ? 24 : 155;
  for (let index = 0; index < count; index++) {
    const piece = document.createElement('span');
    const lemon = index % 5 === 0;
    piece.className = lemon ? 'flying-lemon' : 'gold-confetti';
    if (lemon) piece.textContent = '🍋';
    const angle = Math.random() * Math.PI * 2;
    const distance = .22 + Math.random() * .73;
    piece.style.setProperty('--x', Math.cos(angle) * distance * 62 + 'vw');
    piece.style.setProperty('--y', Math.sin(angle) * distance * 56 + 'vh');
    piece.style.setProperty('--fall', 32 + Math.random() * 50 + 'vh');
    piece.style.setProperty('--spin', (Math.random() - .5) * 1400 + 'deg');
    piece.style.setProperty('--duration', 1.45 + Math.random() * 1.1 + 's');
    piece.style.setProperty('--delay', Math.random() * .40 + 's');
    piece.style.setProperty('--color', gold[index % gold.length]);
    if (reduced) {
      piece.style.left = 10 + Math.random() * 80 + '%';
      piece.style.top = 8 + Math.random() * 84 + '%';
    }
    pieces.append(piece);
  }
  layer.append(pieces);
  layer.showPopover();
  celebrationTimer = setTimeout(() => {
    layer.hidePopover();
    layer.replaceChildren();
  }, reduced ? 1200 : 3100);
}

function discard(index) {
  const tier = state.slots[index];
  if (!tier) return;
  settle();
  if (state.slots.filter(Boolean).length === 1 && state.coins < price(1)) {
    notice('Keep one trophy earning until you can afford another.');
    return;
  }
  state.slots[index] = 0;
  selected = -1;
  notice(names[tier - 1] + ' Cup discarded.');
  chime([55, 48]);
  save();
  paint();
}

$('trash').addEventListener('click', () => discard(selected));
$('trash').addEventListener('dragover', event => {
  if (dragged >= 0) event.preventDefault();
});
$('trash').addEventListener('drop', event => {
  event.preventDefault();
  discard(dragged);
  dragged = -1;
});

let lastBookView = '';
function paintBook() {
  const showAll = $('book-filter').value === 'all';
  const view = [state.level, crafted.size, showAll].join(':');
  if (view === lastBookView) return;
  lastBookView = view;
  $('book-count').textContent = crafted.size + ' / ' + names.length + ' collected';
  const tiers = showAll
    ? names.map((_, index) => index + 1)
    : [...crafted].sort((a, b) => a - b);
  const entries = tiers.map(tier => {
    const name = names[tier - 1];
    const entry = document.createElement('article');
    if (!crafted.has(tier)) {
      entry.className = 'undiscovered';
      entry.textContent = 'Tier ' + tier + ' · Not yet crafted';
      return entry;
    }
    const income = formatNumber(value(tier) * multiplier(), 1);
    const recipe = tier === names.length ? 'Highest trophy tier' : 'Merge two to discover the next tier';
    entry.innerHTML = '<img alt="" src="assets/trophy-' + tier + '.png"><div><h3>' + name
      + ' Cup</h3><p>Tier ' + tier + ' · +' + income + ' coins/s</p><small>'
      + (tier > 1 ? '+' + (10 + (tier - 1) * 4) + ' XP when crafted · ' : '') + recipe + '</small></div>';
    return entry;
  });
  $('book-entries').replaceChildren(...entries);
}

function setBook(open) {
  $('book').hidden = !open;
  $('book-toggle').setAttribute('aria-expanded', String(open));
  $('book-toggle').setAttribute('aria-label', open ? 'Close trophy collection' : 'Open trophy collection');
  if (open) paintBook();
}
$('book-filter').addEventListener('change', paintBook);
$('book-toggle').addEventListener('click', () => setBook($('book').hidden));
$('book-close').addEventListener('click', () => {
  setBook(false);
  $('book-toggle').focus();
});

function getAudio() {
  if (!audio) {
    audio = new AudioContext();
    musicBus = audio.createGain();
    musicBus.connect(audio.destination);
  }
  if (audio.state !== 'running') audio.resume().catch(() => {});
  return audio;
}

function note(midi, start, length, volume, type = 'sine', destination = audio.destination) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .035);
  gain.gain.exponentialRampToValueAtTime(.0001, start + length);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + length);
}
function chime(notes) {
  if (!sounds) return;
  const start = getAudio().currentTime;
  notes.forEach((midi, index) => note(midi, start + index * .085, .5, .085, 'triangle'));
}
function playPhrase() {
  const chords = [[48,55,60,64,67],[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62]];
  const chord = chords[phrase++ % chords.length];
  const start = audio.currentTime + .025;
  note(chord[0], start, 2.2, .06, 'sine', musicBus);
  [1,2,3,4,3,2].forEach((step, index) => {
    note(chord[step], start + index * .35, 1.2, .032, 'triangle', musicBus);
  });
}
function showSounds() {
  $('sounds').textContent = sounds ? '🔊' : '🔇';
  $('sounds').setAttribute('aria-label', sounds ? 'Sound effects on' : 'Sound effects off');
  $('sounds').setAttribute('aria-pressed', String(sounds));
}
showSounds();
$('sounds').addEventListener('click', () => {
  state.sounds = sounds = !sounds;
  showSounds();
  chime([72, 79]);
  save();
});
$('music').addEventListener('click', () => {
  getAudio();
  playing = !playing;
  musicBus.gain.value = playing ? 1 : 0;
  clearInterval(musicTimer);
  if (playing) {
    playPhrase();
    musicTimer = setInterval(playPhrase, 2350);
  }
  $('music').setAttribute('aria-label', playing ? 'Music on' : 'Music off');
  $('music').setAttribute('aria-pressed', String(playing));
});

const fullscreen = $('fullscreen');
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notice('Fullscreen is unavailable in this browser.');
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});

const offline = settle();
if (offline >= rate() * 20 && offline >= 1) notice('Welcome back. Your gallery earned ◈ ' + format(offline) + ' while you were away.');
paint();
save();
setInterval(() => { settle(); updateStats(); }, 500);
setInterval(save, 5000);
window.addEventListener('pagehide', () => { settle(); save(); });
