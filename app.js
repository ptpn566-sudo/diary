/*!
 * Diary — a private, offline space for cyber safety and mindful digital living.
 * Dedicated to Diary.
 *
 * Security model (summary — see SECURITY.md):
 *  - All personal data lives only on this device (IndexedDB). No server, no analytics, no third-party code.
 *  - Data is encrypted with AES-256-GCM. The key is derived from the user's passphrase with
 *    PBKDF2-HMAC-SHA-256 (600,000 iterations, 128-bit random salt) and is non-extractable.
 *  - The DOM is built with textContent only; user text is never parsed as HTML.
 */
'use strict';
(() => {

// =====================================================================
// Configuration
// =====================================================================
const APP_VERSION = '1.0.0';
const KDF_ITERATIONS = 600000;     // OWASP 2023+ guidance for PBKDF2-HMAC-SHA-256
const MIN_ITERATIONS = 100000;     // refuse weaker backups (downgrade protection)
const MIN_PASS_LEN = 10;

// The dedication. Edit these lines to change what the "Dedication" page says.
const DEDICATION = {
  name: 'Diary',
  lines: [
    'Diary is a dietitian. She helps people take care of themselves, one healthy habit at a time.',
    'This app carries that same care into our digital lives: what we take in, how much of it, and when.',
    'Every page here stays private, the way some things are meant to be kept close.'
  ],
  signature: '' // optional, e.g. '— PD'
};

// =====================================================================
// Small helpers
// =====================================================================
const enc = new TextEncoder();
const dec = new TextDecoder();
const SVGNS = 'http://www.w3.org/2000/svg';
const $ = (sel, root = document) => root.querySelector(sel);

function setAttrs(el, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}
function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
/** Create an HTML element. Children are appended before attributes so <select value> works. */
function h(tag, attrs, ...kids) { const el = document.createElement(tag); appendKids(el, kids); setAttrs(el, attrs); return el; }
function sv(tag, attrs, ...kids) { const el = document.createElementNS(SVGNS, tag); appendKids(el, kids); setAttrs(el, attrs); return el; }

const ICONS = {
  leaf: 'M5 20c0-9 6-15 15-15 0 9-6 15-14 15H5zM5 20l8-8',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  shield: 'M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6l8-3zM9 12l2 2 4-4',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM10.6 13.4L3 21m3.5-3.5l2.5 2.5M5 19l2 2',
  lock: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  device: 'M7 3h10v18H7zM11 18h2',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6a17 17 0 0 1-2.9 3.4M6.6 6.7C4.5 8 3.1 10 2.5 12c1 1.5 4.5 6 9.5 6 1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2',
  back: 'M15 5l-7 7 7 7',
  download: 'M12 4v11m-5-5l5 5 5-5M5 20h14',
  upload: 'M12 20V9m-5 5l5-5 5 5M5 4h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  sprig: 'M12 21V9M12 13c-3 0-5-2-5.5-5 3 0 5 2 5.5 5zM12 10c3 0 5-2 5.5-5-3 0-5 2-5.5 5zM12 17c2.6 0 4.5-1.6 5-4.2-2.6 0-4.5 1.6-5 4.2z'
};
function icon(name) {
  return sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    sv('path', { d: ICONS[name] || '' }));
}
function logo() {
  return sv('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
    sv('rect', { width: 64, height: 64, rx: 14, fill: '#4f7363' }),
    sv('rect', { x: 16, y: 11, width: 32, height: 42, rx: 4, fill: '#f6f1e7' }),
    sv('rect', { x: 16, y: 11, width: 6, height: 42, rx: 2, fill: '#dcd2c0' }),
    sv('path', { d: 'M41 11v11l-3.2-2.3-3.2 2.3V11z', fill: '#c4694a' }),
    sv('path', { d: 'M28 44c-.5-8.5 4-14.5 12-16 .6 8.6-4 14.6-12 16z', fill: '#4f7363' }),
    sv('path', { d: 'M28 44l8.5-11', stroke: '#f6f1e7', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const isB64 = (x) => typeof x === 'string' && x.length > 0 && x.length < 50_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(x);
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}
function dayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLongDate = (d = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
function fmtMin(m) {
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60), rest = m % 60;
  return rest ? `${hrs} h ${rest} min` : `${hrs} h`;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// =====================================================================
// Storage (IndexedDB, with in-memory fallback)
// =====================================================================
const Store = (() => {
  let db = null; const mem = new Map();
  async function open() {
    try {
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('diary-db', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch { db = null; }
  }
  function run(mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode); const req = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  }
  return {
    open,
    get persistent() { return !!db; },
    get: (k) => db ? run('readonly', (s) => s.get(k)) : Promise.resolve(mem.get(k)),
    set: (k, v) => db ? run('readwrite', (s) => s.put(v, k)) : Promise.resolve(void mem.set(k, v)),
    del: (k) => db ? run('readwrite', (s) => s.delete(k)) : Promise.resolve(void mem.delete(k)),
    clear: () => db ? run('readwrite', (s) => s.clear()) : Promise.resolve(void mem.clear())
  };
})();

// =====================================================================
// Cryptography (WebCrypto only)
// =====================================================================
async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, obj, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
async function unseal(key, box, aad) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(aad) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// =====================================================================
// Vault: encrypted application state
// =====================================================================
function emptyData() {
  return { v: 1, journal: [], diet: {}, learn: {}, draft: null, prefs: { autoLockMin: 5 }, created: new Date().toISOString() };
}
function normalize(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base, ...d,
    journal: Array.isArray(d.journal) ? d.journal : [],
    diet: d.diet && typeof d.diet === 'object' ? d.diet : {},
    learn: d.learn && typeof d.learn === 'object' ? d.learn : {},
    prefs: { ...base.prefs, ...(d.prefs || {}) }
  };
}
function validMeta(m) {
  return m && typeof m === 'object' && m.app === 'diary' && Number.isInteger(m.iterations) &&
    m.iterations >= MIN_ITERATIONS && m.iterations <= 10_000_000 && isB64(m.salt) &&
    m.check && isB64(m.check.iv) && isB64(m.check.ct);
}

const Vault = {
  meta: null, key: null, data: null, _q: Promise.resolve(),
  async load() { const m = await Store.get('meta'); this.meta = validMeta(m) ? m : null; },
  exists() { return !!this.meta; },
  async _newMeta(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pass, salt, KDF_ITERATIONS);
    const meta = {
      app: 'diary', v: 1, kdf: 'PBKDF2-HMAC-SHA-256', cipher: 'AES-256-GCM', iterations: KDF_ITERATIONS,
      salt: b64(salt), check: await seal(key, { ok: 'diary' }, 'diary:check'), created: new Date().toISOString()
    };
    return { key, meta };
  },
  async create(pass) {
    const { key, meta } = await this._newMeta(pass);
    const data = emptyData();
    await Store.set('vault', await seal(key, data, 'diary:vault'));
    await Store.set('meta', meta);
    this.meta = meta; this.key = key; this.data = data;
  },
  async tryKey(pass, meta = this.meta) {
    const key = await deriveKey(pass, unb64(meta.salt), meta.iterations);
    try { await unseal(key, meta.check, 'diary:check'); return key; } catch { return null; }
  },
  async unlock(pass) {
    const key = await this.tryKey(pass);
    if (!key) return false;
    const box = await Store.get('vault');
    this.data = box ? normalize(await unseal(key, box, 'diary:vault')) : emptyData();
    this.key = key;
    return true;
  },
  save() {
    if (!this.key) return this._q;
    const key = this.key, snapshot = JSON.parse(JSON.stringify(this.data));
    this._q = this._q.then(async () => Store.set('vault', await seal(key, snapshot, 'diary:vault')))
      .catch(() => toast('Could not save. Storage may be full.'));
    return this._q;
  },
  async changePassphrase(oldPass, newPass) {
    if (!(await this.tryKey(oldPass))) return false;
    const { key, meta } = await this._newMeta(newPass);
    await this._q;
    await Store.set('vault', await seal(key, this.data, 'diary:vault'));
    await Store.set('meta', meta);
    this.meta = meta; this.key = key;
    return true;
  },
  lock() { this.key = null; this.data = null; },
  async backup() {
    await this._q;
    return { format: 'diary-backup', v: 1, exported: new Date().toISOString(), meta: this.meta, vault: await Store.get('vault') };
  },
  async restore(obj) {
    if (!obj || obj.format !== 'diary-backup' || !validMeta(obj.meta) || !obj.vault || !isB64(obj.vault.iv) || !isB64(obj.vault.ct)) {
      throw new Error('This file is not a valid Diary backup.');
    }
    await Store.set('vault', { iv: obj.vault.iv, ct: obj.vault.ct });
    await Store.set('meta', obj.meta);
    await Store.del('lockout');
    this.meta = obj.meta; this.lock();
  },
  async erase() { await Store.clear(); this.meta = null; this.lock(); }
};
let saveSoon = debounce(() => Vault.save(), 500);
async function flushSave() { saveSoon = debounce(() => Vault.save(), 500); if (Vault.key) await Vault.save(); }

// Brute-force slowdown: after 5 wrong attempts, wait 30 s, doubling to a 15-minute cap.
async function getLockout() { return (await Store.get('lockout')) || { fails: 0, until: 0 }; }
async function registerFail() {
  const s = await getLockout(); s.fails += 1;
  if (s.fails >= 5) s.until = Date.now() + Math.min(30000 * 2 ** (s.fails - 5), 15 * 60000);
  await Store.set('lockout', s); return s;
}

// =====================================================================
// Content: habits, prompts, lessons
// =====================================================================
const HABITS = [
  ['meals', 'Screen-free meals', 'Mindful eating: no phone at the table.'],
  ['batch', 'Checked notifications in batches', 'Not every ping, every time.'],
  ['breaks', 'Took regular screen breaks', 'Look away, stretch, breathe.'],
  ['bed', 'Phone stayed out of bed', 'Charge it outside the bedroom if you can.'],
  ['verify', 'Paused before clicking a link', 'Read the label before it goes in.'],
  ['kind', 'Did something kind or useful online', "Nourish someone else's feed."]
];
const MOODS = [['light', 'Light'], ['steady', 'Steady'], ['heavy', 'Heavy'], ['drained', 'Drained']];
const BEDTIME = [['0', 'Not today'], ['15', '15 min'], ['30', '30 min'], ['60', '1 hour+']];
const TAGS = ['Reflection', 'Gratitude', 'Digital moment', 'Safety note', 'Memory'];
const PROMPTS = [
  'What did I take in online today that actually nourished me?',
  'What would I like to scroll less of this week?',
  'A small moment today I am grateful for.',
  'Something I learned about staying safe online.',
  'When did I feel most present today, and where was my phone?',
  'What message, post or video stayed with me, and why?',
  'One digital habit I want to change, and the first tiny step.',
  'Who did I connect with today in a way that felt real?'
];

const MODULES = [
  {
    id: 'phishing', title: 'Fake links & phishing', serving: 'every message, mail and link you receive',
    intro: 'Phishing messages pretend to be someone you trust so that you click, pay or share a secret. They arrive by SMS, WhatsApp, email and even phone calls.',
    check: [
      ['Who really sent it?', 'Look at the full email address or SMS sender ID, not just the display name.'],
      ['Where does the link really go?', 'Long-press or hover to preview it. "mybank.com.secure-login.net" is not your bank.'],
      ['Is it rushing you?', '"Account blocked in 2 hours" is pressure, not service.'],
      ['Is it asking for secrets?', 'Banks and government offices never ask for your OTP, PIN or password by message.']
    ],
    flags: ['Urgency or threats', 'Prizes, refunds or "KYC update" requests', 'Shortened or misspelt links', 'Unexpected attachments, especially .apk files'],
    todo: ['Don\'t click. Open the official app, or type the website address yourself.', 'Report suspected fraud calls and messages in India on the Sanchar Saathi portal (Chakshu).', 'Warn family members: scammers reuse the same message on many people.'],
    quiz: [
      { q: 'An SMS says: "Your electricity will be cut tonight. Call this number to update your bill." What is the safest move?',
        o: ['Call the number quickly', 'Click the link in the message', 'Check your bill in the official app or website and ignore the message', 'Reply STOP'],
        a: 2, why: 'Real utilities don\'t threaten disconnection by SMS with a personal number. Check through official channels you already trust.' },
      { q: 'Your bank\'s real website is mybank.com. Which link is most likely fake?',
        o: ['https://www.mybank.com/login', 'https://mybank.com.secure-login.net', 'https://netbanking.mybank.com'],
        a: 1, why: 'Read the address from the end: this one belongs to secure-login.net. The words "mybank.com" are only a disguise in front.' },
      { q: 'An unknown number sends "Wedding_Invite.apk" on WhatsApp. What should you do?',
        o: ['Open it, it\'s just an invite', 'Don\'t open or install it. An .apk file installs an app that can take over your phone', 'Forward it to family to check'],
        a: 1, why: 'Invitations are images or PDFs. An .apk is an Android app, a common way to steal OTPs and bank access.' }
    ]
  },
  {
    id: 'passwords', title: 'Passwords, passphrases & passkeys', serving: 'every account you own',
    intro: 'Most account takeovers happen because a password was reused, guessed or tricked out of someone. A few habits close almost all of these doors.',
    check: [
      ['Length beats complexity', 'Four or more random words ("copper river mango lantern") are stronger and easier to remember than "P@ssw0rd!".'],
      ['One account, one password', 'When one site is breached, reused passwords unlock everything else.'],
      ['Let a manager remember', 'A password manager stores strong, unique passwords so you don\'t have to.'],
      ['Add a second lock', 'Turn on two-step verification. An authenticator app or a passkey is stronger than SMS.']
    ],
    flags: ['The same password on many sites', 'Passwords kept in chats or photo galleries', 'Sharing OTPs with anyone, for any reason'],
    todo: ['Start with your email: it can reset every other account. Give it a unique passphrase and two-step verification.', 'Where an app offers passkeys, use them. They can\'t be phished.', 'Check whether your email appears in known breaches (haveibeenpwned.com).'],
    quiz: [
      { q: 'Which is the strongest password?', o: ['P@ssw0rd!', 'Sunita1990', 'copper river mango lantern'], a: 2,
        why: 'Length matters most. Four random words are long, hard to guess and easy to remember. Names and years are guessed first.' },
      { q: 'Which account should you secure first?', o: ['A shopping app', 'Your email', 'A game account'], a: 1,
        why: '"Forgot password" links go to your email, so whoever controls it can reset almost everything else.' },
      { q: 'What is a passkey?', o: ['A longer password', 'A code sent by SMS', 'A sign-in tied to your device and fingerprint, face or PIN that cannot be phished'], a: 2,
        why: 'A passkey only works on the real website it was made for, so a fake site can\'t steal it.' }
    ]
  },
  {
    id: 'upi', title: 'UPI, OTP & payment scams', serving: 'every payment request and call about money',
    intro: 'Payment scams don\'t break your bank\'s security. They persuade you to approve the payment yourself. Knowing three rules stops most of them.',
    check: [
      ['PIN means paying', 'You never need your UPI PIN to receive money. Entering it always sends money out.'],
      ['Read every collect request', 'A "collect request" asks you to pay. Check the amount and the name before approving.'],
      ['An OTP is your signature', 'Never share it, not even with someone claiming to be bank staff or police.'],
      ['No remote access for strangers', 'Never install screen-sharing apps (AnyDesk, TeamViewer and similar) because someone on a call asks you to.']
    ],
    flags: ['"I sent money by mistake, please return it"', '"Customer care" numbers found through search results', 'Part-time job "tasks" that ask for a deposit', 'QR codes sent to you "to receive money"'],
    todo: ['If you lose money, call 1930 immediately. The first hours matter most.', 'Report at cybercrime.gov.in and ask your bank to block the transaction.', 'Find support numbers only inside the official app or on the back of your card.'],
    quiz: [
      { q: 'A stranger says they sent you ₹5,000 and asks you to scan a QR code "to receive" it. What is happening?',
        o: ['A normal refund', 'A scam: scanning and entering your PIN pays money out', 'A bank verification step'], a: 1,
        why: 'Receiving money never needs a QR scan or PIN from you. Scanning a QR code is for paying.' },
      { q: 'You have just lost money to a UPI fraud. What should you do first?',
        o: ['Wait a week to see if it comes back', 'Call 1930 and your bank right away', 'Post about it on social media'], a: 1,
        why: 'The 1930 helpline works with banks to freeze money quickly. Speed makes recovery more likely.' },
      { q: '"Customer care" asks you to install a screen-sharing app to process your refund. What do you do?',
        o: ['Install it, they are helping', 'Refuse and hang up, because it would give them control of your phone', 'Install it but don\'t share your PIN'], a: 1,
        why: 'Screen-sharing lets them watch you type OTPs and PINs and even act on your phone. Genuine refunds never need it.' }
    ]
  },
  {
    id: 'social', title: 'Social media & your footprint', serving: 'every post, photo and friend request',
    intro: 'What we post builds a picture of who we are, where we live and when we\'re away. Strangers and scammers can read that picture too.',
    check: [
      ['Screenshots last forever', 'Before posting, ask: would I be fine with this being seen in five years?'],
      ['Post the trip after the trip', 'Live location and "away from home" posts tell people when your house is empty.'],
      ['Lock the doors', 'Review who can see your posts, friends list, phone number and email.'],
      ['Know your contacts', 'Fake profiles copy real people\'s photos and names to win trust.']
    ],
    flags: ['A new request from someone already on your friend list', 'A stranger who quickly moves the chat to private apps', 'Pressure to share photos, secrets or money'],
    todo: ['Run the privacy checkup in each app you use.', 'Children\'s photos: avoid school uniforms, names and daily routines.', 'If anyone threatens or blackmails you online: don\'t pay, save the evidence, block, report at cybercrime.gov.in and tell someone you trust. It is not your fault.'],
    quiz: [
      { q: 'When is the safest time to post holiday photos?', o: ['Live, as they happen', 'After you\'re back home', 'Before you leave, to share the plan'], a: 1,
        why: 'Posting afterwards shares the memories without announcing that your home is empty.' },
      { q: 'You get a friend request from someone you\'re already friends with. What\'s most likely?',
        o: ['They made a second account for fun', 'Their profile has been cloned. Check with them another way', 'Accept it to be polite'], a: 1,
        why: 'Cloned profiles are used to ask friends for money. Call or message the real person to check.' },
      { q: 'Someone online threatens to share your private photos unless you pay. What should you do?',
        o: ['Pay quietly so it goes away', 'Don\'t pay; save evidence, block, report and tell someone you trust', 'Argue with them'], a: 1,
        why: 'Paying usually leads to more demands. Reporting and support work better, and the blame lies only with the blackmailer.' }
    ]
  },
  {
    id: 'device', title: 'Device hygiene', serving: 'your phone, laptop and the apps on them',
    intro: 'A healthy device is like a healthy body: regular care prevents most problems. Ten minutes a month is enough.',
    check: [
      ['Updates are vaccines', 'They fix security holes that attackers already know about. Install them promptly.'],
      ['Official stores only', 'Check the developer, downloads and reviews before installing.'],
      ['Permissions should make sense', 'A torch app doesn\'t need your contacts or SMS.'],
      ['Lock, locate, back up', 'Use a screen lock, turn on "Find my device", and keep a backup of what matters.']
    ],
    flags: ['Apps asking for Accessibility or SMS access with no clear reason', 'Battery or data draining suddenly', 'Apps you don\'t remember installing'],
    todo: ['Monthly check-up: install updates, remove unused apps, review permissions, confirm backups.', 'Use mobile data rather than public Wi-Fi for banking.', 'Before selling or giving away a device, back it up and factory-reset it.'],
    quiz: [
      { q: 'A calculator app asks for access to your SMS and contacts. What should you do?', o: ['Allow it, apps need permissions', 'Deny it and uninstall the app', 'Allow SMS only'], a: 1,
        why: 'A calculator has no reason to read your messages. SMS access is often used to steal OTPs.' },
      { q: 'Why do security updates matter?', o: ['They add new emojis', 'They fix weaknesses that attackers already know how to use', 'They make the phone slower on purpose'], a: 1,
        why: 'Once a weakness is published, attackers target devices that haven\'t updated yet.' },
      { q: 'You are at a café and need to make a bank payment. What is safest?', o: ['Use the free café Wi-Fi', 'Use your mobile data', 'Ask a stranger for their hotspot'], a: 1,
        why: 'Your own mobile data connection is far harder for others to watch or impersonate than open Wi-Fi.' }
    ]
  },
  {
    id: 'ai', title: 'AI fakes & "digital arrest" scams', serving: 'every urgent call, voice note and video',
    intro: 'AI can now copy a voice from a few seconds of audio and put a real face on a fake video. Scammers use this to create panic. Calm checking defeats it.',
    check: [
      ['Voices can be faked', 'A familiar voice asking for urgent money is not proof that it\'s really them.'],
      ['Agree a family code word', 'A private word that only family knows, for real emergencies.'],
      ['Hang up and call back', 'Use a number you already have, not the one that called you.'],
      ['"Digital arrest" does not exist', 'No police, CBI, customs or court arrests or questions you over a video call or asks for money to clear your name.']
    ],
    flags: ['Emergency + secrecy + money, all together', 'Officials in uniform on a video call', 'Pressure to stay on the call and not tell anyone', 'Celebrity videos promising guaranteed returns'],
    todo: ['Disconnect, breathe, then verify through a channel you trust.', 'Call 1930 or report at cybercrime.gov.in.', 'Talk about these scams with older relatives. They are the most targeted.'],
    quiz: [
      { q: '"Your son" calls from a new number, crying, asking for money urgently. What do you do?',
        o: ['Send the money fast', 'Hang up and call your son on his known number, or ask for the family code word', 'Ask the caller for their bank details to check'], a: 1,
        why: 'Voice cloning makes urgent calls convincing. Checking independently takes one minute and stops the scam.' },
      { q: 'A video call from a "CBI officer" says you are under digital arrest. What is this?',
        o: ['A real legal process', 'A scam. Disconnect and report it', 'A test from your bank'], a: 1,
        why: 'Indian law has no "digital arrest". Real agencies don\'t question or detain people over video calls or ask for money.' },
      { q: 'A video shows a famous person promising to triple your money. What\'s most likely?', o: ['A real tip', 'A deepfake investment scam', 'A government scheme'], a: 1,
        why: 'Guaranteed high returns are a classic scam sign, and AI makes fake celebrity endorsements easy.' }
    ]
  }
];

// =====================================================================
// Digital Diet scoring (non-clinical, for reflection only)
// =====================================================================
function defaultDay() { return { nour: 60, junk: 60, offline: 60, bed: '0', habits: {}, mood: '' }; }
function computePlate(d) {
  const total = d.nour + d.junk;
  const parts = {
    quality: total ? d.nour / total : 1,
    junk: d.junk <= 30 ? 1 : d.junk <= 60 ? 0.67 : d.junk <= 120 ? 0.33 : 0,
    offline: Math.min(d.offline / 120, 1),
    bed: { '0': 0, '15': 0.5, '30': 0.8, '60': 1 }[d.bed] ?? 0,
    habits: HABITS.filter(([k]) => d.habits[k]).length / HABITS.length
  };
  const score = Math.round(parts.quality * 35 + parts.junk * 15 + parts.offline * 15 + parts.bed * 10 + parts.habits * 25);
  const tips = {
    quality: 'Swap 15 minutes of feed-scrolling for something that feeds you back: a lesson, a call, a creative app.',
    junk: 'Junk content is like junk food: fine in small portions. Try a daily timer on your most-scrolled app.',
    offline: 'Add a side of offline: a short walk, a meal with someone, ten minutes without any screen.',
    bed: 'Screens off 30 minutes before bed gives your mind time to digest the day.',
    habits: 'Pick one habit below for tomorrow. Screen-free meals are a lovely place to start.'
  };
  const weakest = Object.entries(parts).sort((a, b) => a[1] - b[1])[0][0];
  const label = score >= 80 ? 'A well-balanced plate' : score >= 60 ? 'Good, with room to grow' : score >= 40 ? 'A little heavy on junk' : 'Time for a gentle reset';
  return { score, label, tip: score >= 90 ? 'Beautifully balanced. Keep these habits gentle and steady.' : tips[weakest] };
}

// =====================================================================
// Modal
// =====================================================================
let activeModal = null;
function openModal(title, body, actions) {
  closeModal();
  const prev = document.activeElement;
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    h('h2', { id: 'modal-title' }, title), body, h('div', { class: 'modal-actions' }, actions));
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) closeModal(); } }, box);
  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  activeModal = { back, onKey, prev };
  const first = box.querySelector('input, textarea, select') || box.querySelector('.modal-actions button');
  if (first) first.focus();
}
function closeModal() {
  if (!activeModal) return;
  document.removeEventListener('keydown', activeModal.onKey);
  activeModal.back.remove();
  if (activeModal.prev && activeModal.prev.isConnected) activeModal.prev.focus();
  activeModal = null;
}

// =====================================================================
// Passphrase strength (simple, offline)
// =====================================================================
const COMMON = ['password', 'passw0rd', '123456', 'qwerty', 'iloveyou', 'admin', 'welcome', 'abc123', 'letmein', '111111'];
function strength(p) {
  const len = [...p].length;
  if (!len) return { s: 0, label: '' };
  if (len < MIN_PASS_LEN) return { s: 0, label: `Too short (at least ${MIN_PASS_LEN} characters)` };
  let s = 1;
  if (len >= 14) s++;
  if (len >= 20) s++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/].filter((r) => r.test(p)).length;
  if (classes >= 3 || (/\s/.test(p) && len >= 16)) s++;
  if (/^(.)\1+$/.test(p) || COMMON.some((c) => p.toLowerCase().includes(c))) s = 1;
  s = Math.min(s, 4);
  return { s, label: ['Too short', 'Weak — try a few random words', 'Fair', 'Good', 'Strong'][s] };
}
function passField(label, id, opts = {}) {
  const input = h('input', { type: 'password', id, autocomplete: opts.autocomplete || 'current-password', required: true, spellcheck: 'false', autocapitalize: 'off' });
  const toggle = h('button', { type: 'button', class: 'linkbtn small', 'aria-controls': id, onclick: () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.textContent = show ? 'Hide' : 'Show';
  } }, 'Show');
  return { input, el: h('div', { class: 'field' }, h('div', { class: 'row between' }, h('label', { for: id, class: 'small' }, h('b', {}, label)), toggle), input) };
}

// =====================================================================
// Screens: setup, lock, unsupported
// =====================================================================
function viewUnsupported() {
  return h('div', { class: 'auth' }, h('div', { class: 'auth-card card stack-sm' },
    h('div', { class: 'brand' }, logo(), 'Diary'),
    h('h1', {}, 'A secure connection is needed'),
    h('p', {}, 'Diary encrypts everything with your browser\'s built-in cryptography, which only works over HTTPS (or on localhost). Please open Diary from its secure address.')));
}

function viewSetup() {
  const p1 = passField('Choose a passphrase', 'p1', { autocomplete: 'new-password' });
  const p2 = passField('Type it again', 'p2', { autocomplete: 'new-password' });
  const meter = h('div', { class: 'meter', 'data-s': '0', 'aria-hidden': 'true' }, h('i'));
  const meterText = h('span', { class: 'hint', id: 'meter-text', 'aria-live': 'polite' });
  p1.input.setAttribute('aria-describedby', 'meter-text');
  p1.input.addEventListener('input', () => {
    const r = strength(p1.input.value);
    meter.dataset.s = String(r.s); meter.firstChild.style.width = `${p1.input.value ? Math.max(r.s, 0.5) * 25 : 0}%`;
    meterText.textContent = r.label;
  });
  const ack = h('input', { type: 'checkbox', id: 'ack', required: true });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, icon('lock'), 'Create my Diary');
  const form = h('form', { class: 'stack-sm', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const a = p1.input.value, b = p2.input.value;
    if ([...a].length < MIN_PASS_LEN) { err.textContent = `Please use at least ${MIN_PASS_LEN} characters. A few random words work well.`; p1.input.focus(); return; }
    if (a !== b) { err.textContent = 'The two passphrases don\'t match.'; p2.input.focus(); return; }
    if (!ack.checked) { err.textContent = 'Please confirm you understand there is no recovery.'; ack.focus(); return; }
    btn.disabled = true; btn.textContent = 'Securing your Diary…';
    try {
      await Vault.create(a);
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
      location.hash = '#today'; render(); toast('Your Diary is ready');
    } catch {
      err.textContent = 'Something went wrong while setting up encryption. Please try again.';
      btn.disabled = false; btn.replaceChildren(icon('lock'), 'Create my Diary');
    }
  } },
    p1.el, meter, meterText,
    h('p', { class: 'small muted' }, 'Tip: four or more random words, like "river mango lantern quiet", are strong and easy to remember.'),
    p2.el,
    h('label', { class: 'check', for: 'ack' }, ack, h('span', {}, 'I understand that Diary cannot recover my entries if I forget this passphrase. Nobody can, not even the people who made it.')),
    err, btn);

  return h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'brand' }, logo(), 'Diary'),
    h('p', { class: 'dedic-line' }, `Dedicated to ${DEDICATION.name}`),
    h('div', { class: 'card' },
      h('h1', {}, 'A private space for safe and mindful digital living'),
      h('ul', { class: 'promises' },
        h('li', {}, icon('device'), h('span', {}, h('b', {}, 'Stays on this device. '), 'No account, no cloud.')),
        h('li', {}, icon('lock'), h('span', {}, h('b', {}, 'Encrypted with your passphrase. '), 'AES-256, on your device.')),
        h('li', {}, icon('eyeoff'), h('span', {}, h('b', {}, 'No tracking. '), 'No ads, no analytics, works offline.'))),
      !Store.persistent ? h('p', { class: 'notice' }, 'This browser is not allowing Diary to save data (perhaps a private window). Your entries will disappear when you close it.') : null,
      form),
    h('p', { class: 'small muted', style: null }, h('button', { class: 'linkbtn', type: 'button', onclick: () => restoreDialog() }, 'Restore from an encrypted backup'))));
}

function viewLock() {
  const p = passField('Passphrase', 'unlock-pass');
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, icon('key'), 'Unlock');
  const form = h('form', { class: 'stack-sm', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    const lo = await getLockout();
    if (lo.until > Date.now()) { err.textContent = `Too many attempts. Please wait ${Math.ceil((lo.until - Date.now()) / 1000)} seconds.`; return; }
    if (!p.input.value) { p.input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Unlocking…';
    let ok = false;
    try { ok = await Vault.unlock(p.input.value); } catch { ok = false; }
    if (ok) { await Store.del('lockout'); render(); return; }
    const s = await registerFail();
    err.textContent = s.until > Date.now() ? `That passphrase didn't work. Please wait ${Math.ceil((s.until - Date.now()) / 1000)} seconds before trying again.` : 'That passphrase didn\'t work. Please try again.';
    p.input.value = ''; p.input.focus();
    btn.disabled = false; btn.replaceChildren(icon('key'), 'Unlock');
  } }, p.el, err, btn);

  return h('div', { class: 'auth' }, h('div', { class: 'auth-card' },
    h('div', { class: 'brand' }, logo(), 'Diary'),
    h('p', { class: 'dedic-line' }, `Dedicated to ${DEDICATION.name}`),
    h('div', { class: 'card stack-sm' }, h('h1', {}, 'Welcome back'), h('p', { class: 'muted' }, 'Your Diary is locked and encrypted on this device.'), form),
    h('p', { class: 'small muted row' },
      h('button', { class: 'linkbtn', type: 'button', onclick: forgotDialog }, 'Forgot passphrase?'), ' · ',
      h('button', { class: 'linkbtn', type: 'button', onclick: () => restoreDialog() }, 'Restore a backup'))));
}

function forgotDialog() {
  openModal('Forgotten passphrase',
    h('div', { class: 'stack-sm' },
      h('p', {}, 'Your entries are encrypted with your passphrase, and it is never stored anywhere. That is what keeps them private, and it also means they cannot be recovered without it.'),
      h('p', {}, 'If you have an encrypted backup, you can restore it and unlock it with the passphrase you used when you made it. Otherwise you can erase this Diary and start again.')),
    [h('button', { class: 'btn ghost', onclick: closeModal }, 'Keep trying'),
     h('button', { class: 'btn danger', onclick: () => eraseDialog() }, 'Erase and start again')]);
}

// =====================================================================
// App shell & router
// =====================================================================
const NAV = [
  ['today', 'Today', 'leaf'], ['journal', 'Journal', 'book'], ['learn', 'Learn', 'shield'],
  ['memory', 'Dedication', 'heart'], ['vault', 'Vault', 'key']
];
const VIEWS = { today: viewToday, journal: viewJournal, learn: viewLearn, memory: viewMemory, vault: viewVault };
const currentRoute = () => { const r = location.hash.slice(1); return VIEWS[r] ? r : 'today'; };
let jState = { q: '' };
let lState = { module: null, answers: {} };

function viewShell(route) {
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' }, VIEWS[route]());
  return h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#today', 'aria-label': 'Diary home' }, logo(), 'Diary'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => lockNow() }, icon('lock'), 'Lock')),
    h('nav', { class: 'nav', 'aria-label': 'Main' },
      NAV.map(([id, label, ic]) => h('a', { href: `#${id}`, class: `nav-item${id === route ? ' active' : ''}`, 'aria-current': id === route ? 'page' : null }, icon(ic), h('span', {}, label)))),
    main);
}

let lastRoute = null;
function render() {
  const root = $('#app');
  closeModal();
  if (!cryptoOK) { root.replaceChildren(viewUnsupported()); return; }
  if (!Vault.exists()) { root.replaceChildren(viewSetup()); lastRoute = null; return; }
  if (!Vault.key) { root.replaceChildren(viewLock()); lastRoute = null; setTimeout(() => { const i = $('#unlock-pass'); if (i) i.focus(); }, 0); return; }
  const route = currentRoute();
  root.replaceChildren(viewShell(route));
  if (lastRoute !== null && lastRoute !== route) { window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); }
  lastRoute = route;
}
window.addEventListener('hashchange', () => { if (Vault.key) { if (currentRoute() !== 'learn') lState.module = null; render(); } });

async function lockNow(msg) {
  await flushSave();
  Vault.lock(); jState = { q: '' }; lState = { module: null, answers: {} };
  render(); if (msg) toast(msg);
}

// =====================================================================
// Today — the Digital Diet
// =====================================================================
function plateSvg(d, score) {
  const r = 42, C = 2 * Math.PI * r;
  const vals = [[d.nour, 'var(--nour)'], [d.junk, 'var(--junk)'], [d.offline, 'var(--offline)']];
  const total = vals.reduce((s, [v]) => s + v, 0);
  const g = sv('g', { transform: 'rotate(-90 50 50)' }, sv('circle', { cx: 50, cy: 50, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 12 }));
  let offset = 0;
  if (total) for (const [v, col] of vals) {
    if (!v) continue;
    const len = (v / total) * C;
    g.append(sv('circle', { cx: 50, cy: 50, r, fill: 'none', stroke: col, 'stroke-width': 12, 'stroke-dasharray': `${Math.max(len - 1.5, 0.5)} ${C}`, 'stroke-dashoffset': -offset }));
    offset += len;
  }
  return sv('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': `Balance score ${score} out of 100` }, g,
    sv('text', { x: 50, y: 52, 'text-anchor': 'middle', class: 'score-num' }, String(score)),
    sv('text', { x: 50, y: 66, 'text-anchor': 'middle', class: 'score-cap' }, 'BALANCE'));
}

function weekSvg() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push(dt); }
  const W = 280, H = 96, bw = 26, gap = (W - 7 * bw) / 6;
  const kids = days.map((dt, i) => {
    const rec = Vault.data.diet[dayKey(dt)];
    const sc = rec ? computePlate(rec).score : 0;
    const bh = rec ? Math.max(4, (sc / 100) * 66) : 4;
    const x = i * (bw + gap);
    return sv('g', {},
      sv('rect', { x, y: 72 - bh, width: bw, height: bh, rx: 5, class: `bar${rec ? '' : ' empty'}` }, sv('title', {}, rec ? `${fmtDate(dt)}: ${sc}` : `${fmtDate(dt)}: not logged`)),
      sv('text', { x: x + bw / 2, y: 90, 'text-anchor': 'middle' }, dt.toLocaleDateString(undefined, { weekday: 'narrow' })));
  });
  return sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Balance scores for the last seven days' }, kids);
}

function viewToday() {
  const key = dayKey();
  const d = { ...defaultDay(), ...(Vault.data.diet[key] || {}) };
  d.habits = { ...(d.habits || {}) };
  const logged = !!Vault.data.diet[key];

  const plateBox = h('div', { class: 'plate' });
  const labelEl = h('div', { class: 'score-label' });
  const tipEl = h('p', { class: 'tip' });
  const weekBox = h('div', { class: 'week' });
  const careBox = h('div');
  const savedEl = h('span', { class: 'saved', 'aria-live': 'polite' }, logged ? 'Saved' : 'Not saved yet');

  function refresh(persist) {
    const p = computePlate(d);
    plateBox.replaceChildren(plateSvg(d, p.score));
    labelEl.textContent = p.label; tipEl.textContent = p.tip;
    if (persist) {
      Vault.data.diet[key] = JSON.parse(JSON.stringify(d));
      saveSoon(); savedEl.textContent = 'Saved';
    }
    weekBox.replaceChildren(weekSvg());
    const care = careCard(d.mood);
    if (care) careBox.replaceChildren(care); else careBox.replaceChildren();
  }

  function rangeField(id, label, hint, prop, max) {
    const out = h('output', { for: id }, fmtMin(d[prop]));
    const input = h('input', { type: 'range', id, min: 0, max, step: 15, value: d[prop], 'aria-describedby': `${id}-hint`,
      oninput: () => { d[prop] = Number(input.value); out.textContent = fmtMin(d[prop]); refresh(true); } });
    return h('div', { class: 'range-field' },
      h('div', { class: 'range-head' }, h('label', { for: id }, label), out),
      h('div', { class: 'hint', id: `${id}-hint` }, hint), input);
  }

  const bedSel = h('select', { id: 'bed', onchange: () => { d.bed = bedSel.value; refresh(true); } },
    BEDTIME.map(([v, l]) => h('option', { value: v }, l)));
  bedSel.value = d.bed;

  const habits = h('div', { class: 'habits' }, HABITS.map(([k, title, sub]) => {
    const cb = h('input', { type: 'checkbox', id: `h-${k}`, checked: !!d.habits[k], onchange: () => { d.habits[k] = cb.checked; refresh(true); } });
    return h('label', { class: 'habit', for: `h-${k}` }, cb, h('span', {}, h('b', {}, title), h('small', {}, sub)));
  }));

  const mood = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': 'mood-h' }, MOODS.map(([v, l]) => {
    const r = h('input', { type: 'radio', name: 'mood', value: v, class: 'vh', checked: d.mood === v, onchange: () => { d.mood = v; refresh(true); } });
    return h('label', {}, r, l);
  }));

  const view = h('div', { class: 'stack' },
    h('div', { class: 'page-head row between' },
      h('div', {}, h('div', { class: 'eyebrow' }, fmtLongDate()), h('h1', {}, 'Your digital plate'),
        h('p', {}, 'Like food, what we take in through screens shapes how we feel. Log today\'s balance. It is for reflection, not judgement.')),
    ),
    h('section', { class: 'card', 'aria-labelledby': 'plate-h' },
      h('h2', { id: 'plate-h', class: 'vh' }, 'Today\'s balance'),
      h('div', { class: 'plate-row' }, plateBox,
        h('div', {}, labelEl,
          h('div', { class: 'legend' },
            h('span', {}, h('i', { class: 'sw-nour' }), 'Nourishing screen time'),
            h('span', {}, h('i', { class: 'sw-junk' }), 'Junk screen time'),
            h('span', {}, h('i', { class: 'sw-off' }), 'Offline time')),
          tipEl)),
      h('div', { class: 'row between', style: null }, h('span'), savedEl)),
    careBox,
    h('section', { class: 'card', 'aria-labelledby': 'portions-h' },
      h('h2', { id: 'portions-h' }, 'Today\'s portions'),
      rangeField('nour', 'Nourishing screen time', 'Learning, creating, real conversations, useful work.', 'nour', 600),
      rangeField('junk', 'Junk screen time', 'Endless feeds, autoplay, doom-scrolling, things that left you feeling worse.', 'junk', 600),
      rangeField('offline', 'Offline time', 'Outdoors, people, movement, hobbies, rest without a screen.', 'offline', 720),
      h('div', { class: 'range-field' }, h('label', { class: 'field', for: 'bed' }, h('span', {}, 'Screens off before bed'), bedSel))),
    h('section', { class: 'card', 'aria-labelledby': 'habits-h' },
      h('h2', { id: 'habits-h' }, 'Healthy habits today'), habits),
    h('section', { class: 'card', 'aria-labelledby': 'mood-h' },
      h('h2', { id: 'mood-h' }, 'After today\'s screen time, my mind feels…'), mood),
    h('section', { class: 'card week', 'aria-labelledby': 'week-h' },
      h('h2', { id: 'week-h' }, 'Your week'), weekBox));
  refresh(false);
  return view;
}

function careCard(todayMood) {
  let drained = 0;
  for (let i = 0; i < 7; i++) { const dt = new Date(); dt.setDate(dt.getDate() - i); const r = Vault.data.diet[dayKey(dt)]; if (r && r.mood === 'drained') drained++; }
  if (todayMood !== 'drained' && drained < 3) return null;
  return h('section', { class: 'care stack-sm', 'aria-label': 'A gentle note' },
    h('h2', {}, drained >= 3 ? 'You\'ve felt drained a few times this week' : 'Thank you for noticing'),
    h('p', {}, 'That matters. Rest is part of a healthy diet too. Tonight, try putting screens away a little earlier and doing something gentle for yourself.'),
    h('p', {}, 'If the heaviness stays, or it\'s about more than screens, talking to someone helps. In India, Tele-MANAS is free, confidential and open 24×7: ', h('b', {}, '14416'), ' or ', h('b', {}, '1-800-891-4416'), '.'));
}

// =====================================================================
// Journal
// =====================================================================
function viewJournal() {
  if (Vault.data.draft) return viewEditor();
  const list = h('div', { class: 'entries' });
  const search = h('input', { type: 'search', placeholder: 'Search your entries', 'aria-label': 'Search entries', value: jState.q,
    oninput: () => { jState.q = search.value; fill(); } });
  function fill() {
    const q = jState.q.trim().toLowerCase();
    const items = Vault.data.journal.filter((e) => !q || `${e.title} ${e.text} ${e.tag}`.toLowerCase().includes(q))
      .sort((a, b) => b.created.localeCompare(a.created));
    if (!Vault.data.journal.length) {
      list.replaceChildren(h('div', { class: 'empty card' }, icon('book'), h('h2', {}, 'Your first page is waiting'),
        h('p', {}, 'Write about your day, your digital habits, or anything you want to keep close. Only you can read it.')));
      return;
    }
    if (!items.length) { list.replaceChildren(h('p', { class: 'muted' }, 'No entries match your search.')); return; }
    list.replaceChildren(...items.map((e) => h('button', { class: 'entry', type: 'button', onclick: () => openEditor(e.id) },
      h('div', { class: 'row between' }, h('span', { class: 'tag' }, e.tag), h('span', { class: 'small muted' }, fmtDate(e.created))),
      h('h3', {}, e.title || 'Untitled'),
      h('p', {}, e.text.length > 160 ? `${e.text.slice(0, 160)}…` : e.text))));
  }
  fill();
  return h('div', { class: 'stack' },
    h('div', { class: 'page-head row between' },
      h('div', {}, h('h1', {}, 'Journal'), h('p', {}, `${Vault.data.journal.length} ${Vault.data.journal.length === 1 ? 'entry' : 'entries'}, encrypted on this device`)),
      h('button', { class: 'btn', type: 'button', onclick: () => openEditor(null) }, icon('plus'), 'New entry')),
    Vault.data.journal.length ? search : null, list);
}

function openEditor(id) {
  const e = id ? Vault.data.journal.find((x) => x.id === id) : null;
  Vault.data.draft = e ? { id: e.id, title: e.title, tag: e.tag, text: e.text } : { id: null, title: '', tag: 'Reflection', text: '' };
  saveSoon(); render();
}

function viewEditor() {
  const dft = Vault.data.draft;
  const existing = dft.id ? Vault.data.journal.find((x) => x.id === dft.id) : null;
  const persist = () => saveSoon();
  const title = h('input', { type: 'text', id: 'e-title', maxlength: 140, value: dft.title, placeholder: 'Give this page a title', oninput: () => { dft.title = title.value; persist(); } });
  const tag = h('select', { id: 'e-tag', onchange: () => { dft.tag = tag.value; persist(); } }, TAGS.map((t) => h('option', { value: t }, t)));
  tag.value = TAGS.includes(dft.tag) ? dft.tag : 'Reflection';
  const count = h('span', { class: 'small muted', 'aria-live': 'off' });
  const words = () => { const n = dft.text.trim() ? dft.text.trim().split(/\s+/).length : 0; count.textContent = `${n} ${n === 1 ? 'word' : 'words'}`; };
  const text = h('textarea', { id: 'e-text', class: 'paper', rows: 12, value: dft.text, 'aria-label': 'Entry text', placeholder: 'Write freely…',
    oninput: () => { dft.text = text.value; words(); persist(); } });
  words();
  let pi = Math.floor(Math.random() * PROMPTS.length);
  const promptText = h('span', { class: 'prompt' }, PROMPTS[pi]);
  const promptBox = h('div', { class: 'tip stack-sm' },
    h('div', {}, h('b', {}, 'Need a prompt? '), promptText),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => { pi = (pi + 1) % PROMPTS.length; promptText.textContent = PROMPTS[pi]; } }, 'Another'),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
        if (!title.value) { title.value = PROMPTS[pi]; dft.title = title.value; } else { text.value = `${text.value}${text.value ? '\n\n' : ''}${PROMPTS[pi]}\n`; dft.text = text.value; words(); }
        persist(); text.focus();
      } }, 'Use it')));

  const close = () => { Vault.data.draft = null; saveSoon(); render(); };
  const save = () => {
    if (!dft.title.trim() && !dft.text.trim()) { close(); return; }
    const now = new Date().toISOString();
    if (existing) Object.assign(existing, { title: dft.title.trim(), tag: dft.tag, text: dft.text, updated: now });
    else Vault.data.journal.push({ id: uid(), created: now, updated: now, title: dft.title.trim(), tag: dft.tag, text: dft.text });
    close(); toast('Saved and encrypted');
  };
  const del = () => openModal('Delete this entry?', h('p', {}, 'This page will be permanently removed from your Diary.'), [
    h('button', { class: 'btn ghost', onclick: closeModal }, 'Cancel'),
    h('button', { class: 'btn danger', onclick: () => {
      Vault.data.journal = Vault.data.journal.filter((x) => x.id !== dft.id); closeModal(); close(); toast('Entry deleted');
    } }, 'Delete')]);

  setTimeout(() => (dft.title ? text : title).focus(), 0);
  return h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: close }, icon('back'), 'Back'),
      h('span', { class: 'small muted' }, existing ? `Written ${fmtDate(existing.created)}` : fmtLongDate())),
    h('div', { class: 'card stack-sm' },
      h('label', { class: 'field', for: 'e-title' }, h('span', {}, 'Title'), title),
      h('label', { class: 'field', for: 'e-tag' }, h('span', {}, 'Kind of entry'), tag),
      text,
      h('div', { class: 'row between' }, count, h('span', { class: 'small muted' }, 'Drafts are saved and encrypted as you type'))),
    promptBox,
    h('div', { class: 'row between' },
      existing ? h('button', { class: 'btn ghost', type: 'button', onclick: del }, 'Delete') : h('span'),
      h('button', { class: 'btn', type: 'button', onclick: save }, icon('check'), 'Save entry')));
}

// =====================================================================
// Learn — "Read the label"
// =====================================================================
function viewLearn() {
  if (lState.module) return viewModule(MODULES.find((m) => m.id === lState.module));
  const done = MODULES.filter((m) => Vault.data.learn[m.id] && Vault.data.learn[m.id].done).length;
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': MODULES.length, 'aria-valuenow': done, 'aria-label': 'Lessons completed' }, h('i'));
  bar.firstChild.style.width = `${(done / MODULES.length) * 100}%`;
  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Read the label'),
      h('p', {}, 'A good dietitian teaches you to read the label before something goes in. These short lessons do the same for links, messages, calls and apps.')),
    h('div', { class: 'card stack-sm' }, h('div', { class: 'row between' }, h('b', {}, 'Your progress'), h('span', { class: 'small muted' }, `${done} of ${MODULES.length} lessons`)), bar),
    h('div', { class: 'modules' }, MODULES.map((m, i) => {
      const rec = Vault.data.learn[m.id];
      return h('button', { class: 'module-card', type: 'button', onclick: () => { lState = { module: m.id, answers: {} }; render(); window.scrollTo(0, 0); } },
        h('span', { class: 'eyebrow' }, `Lesson ${i + 1}`), h('h3', {}, m.title), h('span', { class: 'small muted' }, m.intro.split('. ')[0] + '.'),
        h('span', { class: `status${rec && rec.done ? ' done' : ''}` }, rec && rec.done ? `Completed · best ${rec.best}/${m.quiz.length}` : 'About 4 minutes'));
    })));
}

function viewModule(m) {
  const quizBox = h('div', { class: 'stack-sm' });
  const resultBox = h('div', { 'aria-live': 'polite' });
  function drawQuiz() {
    quizBox.replaceChildren(...m.quiz.map((q, qi) => {
      const answered = lState.answers[qi];
      const fb = h('div', { class: 'feedback' });
      if (answered != null) {
        const ok = answered === q.a;
        fb.append(h('b', {}, ok ? 'Right. ' : 'Not quite. '), q.why);
      }
      return h('fieldset', { class: 'q' }, h('legend', {}, `${qi + 1}. ${q.q}`),
        q.o.map((opt, oi) => {
          const id = `q${qi}o${oi}`;
          const cls = answered == null ? '' : oi === q.a ? ' correct' : oi === answered ? ' wrong' : '';
          const r = h('input', { type: 'radio', name: `q${qi}`, id, checked: answered === oi, disabled: answered != null,
            onchange: () => { lState.answers[qi] = oi; drawQuiz(); finishIfDone(); } });
          return h('label', { class: `opt${cls}`, for: id }, r, h('span', {}, opt));
        }), fb);
    }));
  }
  function finishIfDone() {
    const n = Object.keys(lState.answers).length;
    if (n < m.quiz.length) { resultBox.replaceChildren(); return; }
    const score = m.quiz.filter((q, i) => lState.answers[i] === q.a).length;
    const prev = Vault.data.learn[m.id] || { best: 0 };
    Vault.data.learn[m.id] = { done: true, best: Math.max(prev.best || 0, score), at: new Date().toISOString() };
    saveSoon();
    const next = MODULES[MODULES.indexOf(m) + 1];
    resultBox.replaceChildren(h('div', { class: 'card stack-sm' },
      h('h2', {}, `You scored ${score} of ${m.quiz.length}`),
      h('p', {}, score === m.quiz.length ? 'Excellent label-reading. Share one of these lessons with someone you care about.' : 'Good effort. Read the explanations above, then try again whenever you like.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { lState.answers = {}; drawQuiz(); resultBox.replaceChildren(); } }, 'Try again'),
        next ? h('button', { class: 'btn', type: 'button', onclick: () => { lState = { module: next.id, answers: {} }; render(); window.scrollTo(0, 0); } }, `Next: ${next.title}`)
          : h('button', { class: 'btn', type: 'button', onclick: () => { lState.module = null; render(); } }, 'All lessons'))));
  }
  drawQuiz(); finishIfDone();

  return h('div', { class: 'stack' },
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => { lState.module = null; render(); } }, icon('back'), 'All lessons'),
    h('div', { class: 'page-head' }, h('div', { class: 'eyebrow' }, `Lesson ${MODULES.indexOf(m) + 1} of ${MODULES.length}`), h('h1', {}, m.title), h('p', {}, m.intro)),
    h('section', { class: 'label-box', 'aria-labelledby': `lb-${m.id}` },
      h('p', { class: 'lb-title', id: `lb-${m.id}` }, 'Safety Facts'),
      h('div', { class: 'lb-serving' }, h('b', {}, 'Serving: '), m.serving),
      h('p', { class: 'lb-sec' }, 'Check the label'),
      h('ul', {}, m.check.map(([t, d]) => h('li', {}, h('b', {}, /[?.!]$/.test(t) ? `${t} ` : `${t}. `), d))),
      h('p', { class: 'lb-sec' }, 'Warning: may contain'),
      h('ul', { class: 'lb-warn' }, m.flags.map((f) => h('li', {}, f))),
      h('p', { class: 'lb-sec' }, 'Directions'),
      h('ul', {}, m.todo.map((t) => h('li', {}, t)))),
    h('section', { class: 'stack-sm', 'aria-labelledby': 'quiz-h' }, h('h2', { id: 'quiz-h' }, 'Quick check'), quizBox),
    resultBox);
}

// =====================================================================
// Dedication
// =====================================================================
function viewMemory() {
  const sprig = icon('sprig'); sprig.setAttribute('class', 'sprig'); sprig.setAttribute('stroke-width', '1.3');
  return h('div', { class: 'stack' },
    h('section', { class: 'card memorial' },
      sprig,
      h('div', { class: 'eyebrow' }, 'Dedicated to'),
      h('h1', { class: 'name' }, DEDICATION.name),
      DEDICATION.lines.map((l) => h('p', {}, l)),
      DEDICATION.signature ? h('p', { class: 'sig' }, DEDICATION.signature) : null),
    h('section', { class: 'card stack-sm' },
      h('h2', {}, 'Why a "Digital Diet"?'),
      h('p', {}, 'A dietitian doesn\'t forbid food. She teaches balance: more of what nourishes, less of what harms, and attention to how it all makes you feel.'),
      h('p', {}, 'Diary brings that thinking to our screens. The Today page is your digital plate. The lessons teach you to read the label before a link, message or app gets in. The journal is a quiet place to digest it all.')));
}

// =====================================================================
// Vault — privacy, backup, settings, help
// =====================================================================
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
let swState = 'checking';

function viewVault() {
  const lockSel = h('select', { id: 'autolock', 'aria-label': 'Auto-lock after', onchange: () => { Vault.data.prefs.autoLockMin = Number(lockSel.value); saveSoon(); toast('Auto-lock updated'); } },
    [1, 5, 15, 30].map((n) => h('option', { value: n }, `${n} min`)));
  lockSel.value = String(Vault.data.prefs.autoLockMin);
  const offlineText = { ready: 'Ready. Diary works without internet on this device.', checking: 'Checking…', unavailable: 'Not available in this view. Open your installed or hosted copy of Diary to use it offline.' }[swState];

  return h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Vault & privacy'), h('p', {}, 'Everything you write stays encrypted on this device. Here you control backups, locking and your data.')),
    h('section', { class: 'card', 'aria-labelledby': 'sec-h' },
      h('h2', { id: 'sec-h' }, 'Security'),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Lock now'), h('span', { class: 'small muted' }, 'Clears your key from memory.')),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => lockNow() }, icon('lock'), 'Lock')),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Auto-lock'), h('span', { class: 'small muted' }, 'Locks after inactivity, or two minutes after you leave the app.')), lockSel),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Change passphrase'), h('span', { class: 'small muted' }, 'Re-encrypts everything with a new key.')),
        h('button', { class: 'btn ghost small', type: 'button', onclick: changePassDialog }, 'Change'))),
    h('section', { class: 'card', 'aria-labelledby': 'bk-h' },
      h('h2', { id: 'bk-h' }, 'Backup'),
      h('p', { class: 'small muted' }, 'Diary has no cloud, so a backup is how you protect against a lost phone or a cleared browser. Backups stay encrypted and need your passphrase to open.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: exportDialog }, icon('download'), 'Export encrypted backup'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => restoreDialog() }, icon('upload'), 'Restore'))),
    h('section', { class: 'card', 'aria-labelledby': 'dev-h' },
      h('h2', { id: 'dev-h' }, 'This device'),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Offline mode'), h('span', { class: 'small muted' }, offlineText))),
      installEvt ? h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Install Diary'), h('span', { class: 'small muted' }, 'Add it to your home screen like an app.')),
        h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { installEvt.prompt(); await installEvt.userChoice; } catch {} installEvt = null; render(); } }, 'Install')) : null,
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Erase everything'), h('span', { class: 'small muted' }, 'Permanently deletes your Diary from this device.')),
        h('button', { class: 'btn danger small', type: 'button', onclick: eraseDialog }, 'Erase'))),
    h('section', { class: 'card stack-sm', 'aria-labelledby': 'help-h' },
      h('h2', { id: 'help-h' }, 'Help when you need it'),
      h('ul', { class: 'help-list' },
        h('li', {}, h('b', {}, '1930'), ' — National Cyber Crime Helpline (India), for online fraud and money lost.'),
        h('li', {}, h('b', {}, 'cybercrime.gov.in'), ' — report any cybercrime online (India).'),
        h('li', {}, h('b', {}, '14416'), ' or ', h('b', {}, '1-800-891-4416'), ' — Tele-MANAS, free 24×7 mental health support (India).'),
        h('li', {}, 'Outside India, contact your local emergency number or national helpline.'))),
    h('section', { class: 'card stack-sm', 'aria-labelledby': 'about-h' },
      h('h2', { id: 'about-h' }, 'How Diary protects you'),
      h('div', { class: 'specs' },
        h('span', {}, 'Encryption: AES-256-GCM, with a fresh random IV for every save'),
        h('span', {}, `Key derivation: PBKDF2-HMAC-SHA-256, ${Vault.meta.iterations.toLocaleString()} iterations, 128-bit random salt`),
        h('span', {}, 'Storage: this device only (IndexedDB). No server, no analytics, no third-party code'),
        h('span', {}, `Version ${APP_VERSION}`))));
}

function changePassDialog() {
  const a = passField('Current passphrase', 'cp-old');
  const b = passField('New passphrase', 'cp-new', { autocomplete: 'new-password' });
  const c = passField('Type the new one again', 'cp-new2', { autocomplete: 'new-password' });
  const err = h('p', { class: 'err', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'button', onclick: async () => {
    err.textContent = '';
    if ([...b.input.value].length < MIN_PASS_LEN) { err.textContent = `Use at least ${MIN_PASS_LEN} characters.`; return; }
    if (b.input.value !== c.input.value) { err.textContent = 'The new passphrases don\'t match.'; return; }
    go.disabled = true; go.textContent = 'Re-encrypting…';
    const ok = await Vault.changePassphrase(a.input.value, b.input.value).catch(() => false);
    if (!ok) { err.textContent = 'Your current passphrase is not correct.'; go.disabled = false; go.textContent = 'Change passphrase'; return; }
    closeModal(); toast('Passphrase changed. Make a fresh backup.');
  } }, 'Change passphrase');
  openModal('Change passphrase', h('div', { class: 'stack-sm' }, a.el, b.el, c.el,
    h('p', { class: 'small muted' }, 'Older backups will still open with the passphrase they were made with.'), err),
  [h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'Cancel'), go]);
}

async function exportDialog() {
  const text = JSON.stringify(await Vault.backup());
  const name = `diary-backup-${dayKey()}.json`;
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {}
  const ta = h('textarea', { rows: 5, readonly: true, 'aria-label': 'Encrypted backup text', value: text });
  const copy = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(text); toast('Backup copied'); } catch { ta.focus(); ta.select(); toast('Select the text and copy it'); }
  } }, 'Copy backup text');
  openModal('Your encrypted backup',
    h('div', { class: 'stack-sm' },
      h('p', {}, `A file named ${name} should be downloading. Keep it somewhere safe, like a pen drive or your own cloud storage. It is encrypted, so only your passphrase can open it.`),
      h('p', { class: 'small muted' }, 'If no download started, copy the text below and save it in a file ending in .json.'),
      ta),
    [copy, h('button', { class: 'btn', type: 'button', onclick: closeModal }, 'Done')]);
}

function restoreDialog() {
  const err = h('p', { class: 'err', role: 'alert' });
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file' });
  const ta = h('textarea', { rows: 4, placeholder: 'Or paste backup text here', 'aria-label': 'Backup text' });
  const go = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    err.textContent = '';
    let raw = ta.value.trim();
    try {
      if (!raw && file.files[0]) {
        if (file.files[0].size > 50 * 1024 * 1024) throw new Error('That file is too large to be a Diary backup.');
        raw = await file.files[0].text();
      }
      if (!raw) throw new Error('Choose a backup file or paste the backup text.');
      let obj; try { obj = JSON.parse(raw); } catch { throw new Error('This is not a valid Diary backup.'); }
      await flushSave();
      await Vault.restore(obj);
      closeModal(); jState = { q: '' }; lState = { module: null, answers: {} };
      render(); toast('Backup restored. Unlock it with its passphrase.');
    } catch (e) { err.textContent = e.message || 'Could not restore this backup.'; }
  } }, 'Replace with backup');
  openModal('Restore a backup',
    h('div', { class: 'stack-sm' },
      h('p', {}, 'Restoring replaces the Diary on this device with the backup. You will unlock it with the passphrase used when the backup was made.'),
      file, ta, err),
    [h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'Cancel'), go]);
}

function eraseDialog() {
  const input = h('input', { type: 'text', 'aria-label': 'Type ERASE to confirm', autocomplete: 'off', placeholder: 'ERASE' });
  const go = h('button', { class: 'btn danger', type: 'button', disabled: true, onclick: async () => {
    await Vault.erase(); jState = { q: '' }; lState = { module: null, answers: {} }; closeModal(); render(); toast('Diary erased from this device');
  } }, 'Erase forever');
  input.addEventListener('input', () => { go.disabled = input.value.trim() !== 'ERASE'; });
  openModal('Erase everything?',
    h('div', { class: 'stack-sm' },
      h('p', {}, 'This permanently deletes every entry, log and setting from this device. Without a backup, it cannot be undone.'),
      h('p', {}, 'Type ', h('b', {}, 'ERASE'), ' to confirm.'), input),
    [h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'Cancel'), go]);
}

// =====================================================================
// Auto-lock
// =====================================================================
let lastActive = Date.now(), hiddenAt = 0;
for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
document.addEventListener('scroll', () => { lastActive = Date.now(); }, { passive: true, capture: true });
setInterval(() => {
  if (Vault.key && Date.now() - lastActive > (Vault.data.prefs.autoLockMin || 5) * 60000) lockNow('Locked after inactivity');
}, 10000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); flushSave(); }
  else if (Vault.key && hiddenAt && Date.now() - hiddenAt > 120000) lockNow('Locked while you were away');
});
window.addEventListener('pagehide', () => { flushSave(); });

// =====================================================================
// Service worker (offline) & boot
// =====================================================================
async function registerSW() {
  try {
    if (location.protocol === 'file:') { swState = 'ready'; return; } // single-file version is already offline
    if (!('serviceWorker' in navigator)) throw new Error('unsupported');
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    swState = 'ready';
  } catch { swState = 'unavailable'; }
  if (Vault.key && currentRoute() === 'vault' && !activeModal) render();
}

let cryptoOK = false;
async function boot() {
  cryptoOK = !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  await Store.open();
  try { await Vault.load(); } catch { Vault.meta = null; }
  render();
  registerSW();
}
boot();

})();
