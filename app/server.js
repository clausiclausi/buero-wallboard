// Büro-Wallboard: kleiner lokaler Server ohne externe Abhängigkeiten (Node.js >= 20).
// - liefert das Board (/) und die Handy-Seite (/m)
// - speichert alles in data/db.json, Fotos in data/photos
// - holt Wetter und Unwetterwarnungen vom DWD (über Bright Sky), das Regenradar direkt vom DWD, und gibt nur Zahlen weiter
// - Geräte aus dem WLAN brauchen die PIN, das Board selbst (localhost) nicht
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const PUBLIC = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const DB_FILE = path.join(DATA, 'db.json');
fs.mkdirSync(PHOTOS, { recursive: true });

const config = Object.assign({
  port: 8080,
  pin: '000000',
  lat: 52.3705, lon: 9.7550, ort: 'Hannover',
  updateRepo: 'clausiclausi/buero-wallboard', updateBranch: 'main', updateToken: '',
  externalPort: 8081,
}, readJson(CONFIG_FILE, {}));
const VERSION = readJson(path.join(__dirname, 'version.json'), { version: '0.0.0' }).version;
const CHANGELOG = readJson(path.join(__dirname, 'changelog.json'), []);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function log(...a) { console.log(new Date().toISOString(), ...a); }

/* ---------- Datenhaltung ---------- */
const DEFAULT_SETTINGS = {
  theme: { preset: 'wald', colors: null },
  muted: false, lead: 15, volume: 0.6, rainHours: [10, 12, 17],
  visitor: false, officeStart: '06:00', officeEnd: '20:00', autoUpdate: 'sofort', updateEvery: 30, skin: 'standard',
  mascot: { fig: 'strich', color: '#7FE0AE', text: '', font: 'strich', every: 'zufall', size: 'mittel', mood: 'lieb', alerts: true, walk: '09:55', deco: true },
};
const DEFAULT_LOANS = [
  { id: 'l1', type: 'Notebooks', icon: 'laptop', avail: 0, total: 0 },
  { id: 'l2', type: 'Monitore', icon: 'monitor', avail: 0, total: 0 },
  { id: 'l3', type: 'Smartphones', icon: 'phone', avail: 0, total: 0 },
  { id: 'l4', type: 'Headsets', icon: 'box', avail: 0, total: 0 },
];
let db = Object.assign({ tasks: [], events: [], scans: [], loans: DEFAULT_LOANS, incident: null, settings: {}, people: [], absences: [], notes: [], taskLog: [], rueckscan: {} }, readJson(DB_FILE, {}));
db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings);
// Ab 1.21.0 kommen Haltestellen aus der offenen EFA-Auskunft (andere Kennungen): alte Auswahl einmalig zurücksetzen
if ((db.transitDefault || 0) < 2) { db.settings.transit = null; db.settings.route = null; db.transitDefault = 2; }
// 1.24: BSI-Warnungen stehen jetzt oben unter dem Datum. Die Sicherheits-Kachel einmalig ausblenden,
// das Wetter bekommt ihren Platz, wenn sie direkt darunter lag.
if ((db.secMoved || 0) < 1) {
  const L = db.settings.layout;
  if (L && typeof L === 'object' && Array.isArray(L.wx) && Array.isArray(L.sec) && !(L.hidden || []).includes('sec')) {
    L.hidden = [...(L.hidden || []), 'sec'];
    if (L.sec[0] === L.wx[0] && L.sec[2] === L.wx[2] && L.sec[1] === L.wx[1] + L.wx[3]) L.wx = [L.wx[0], L.wx[1], L.wx[2], L.wx[3] + L.sec[3]];
  }
  db.secMoved = 1;
}
// 1.26: Nachrichten-Kachel. Liegt das Wetter wie im Standard über die ganze Höhe, bekommt sie das untere Drittel.
if ((db.newsAdded || 0) < 1) {
  const L = db.settings.layout;
  if (L && typeof L === 'object' && Array.isArray(L.wx) && !Array.isArray(L.news) && L.wx[3] === 6) {
    L.wx = [L.wx[0], L.wx[1], L.wx[2], 4];
    L.news = [L.wx[0], L.wx[1] + 4, L.wx[2], 2];
  }
  db.newsAdded = 1;
}

// Passwort zum Entsperren des Besuchermodus (nur als Hash gespeichert, Standard: 123)
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
if (!db.unlock) { const salt = crypto.randomBytes(12).toString('hex'); db.unlock = { salt, hash: hashPw('123', salt) }; }
function checkPw(pw) {
  const h = Buffer.from(hashPw(pw, db.unlock.salt), 'hex');
  return typeof pw === 'string' && pw.length <= 64 && crypto.timingSafeEqual(h, Buffer.from(db.unlock.hash, 'hex'));
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
  broadcast();
}

// Tägliche Sicherung, 14 Tage aufbewahren: im Wallboard-Ordner und zusätzlich in einem eigenen Ordner (z. B. Netzlaufwerk)
const BACKUP_DEFAULT = process.platform === 'win32' ? path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Documents', 'Wallboard-Sicherung') : path.join(DATA, 'sicherung');
let backupInfo = { at: 0, ok: null, error: '', dir: '' };
function backupTo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `db-${localDate(0)}.json`), JSON.stringify(db));
  for (const f of fs.readdirSync(dir).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -14)) fs.unlinkSync(path.join(dir, f));
}
function backup() {
  try { backupTo(path.join(DATA, 'backup')); } catch (e) { log('Backup fehlgeschlagen', e.message); }
  const dir = (db.settings && db.settings.backupDir) || BACKUP_DEFAULT;
  try { backupTo(dir); backupInfo = { at: Date.now(), ok: true, error: '', dir }; }
  catch (e) { backupInfo = { at: Date.now(), ok: false, error: e.code === 'EACCES' || e.code === 'EPERM' ? 'Keine Schreibrechte für diesen Ordner' : e.code === 'ENOENT' ? 'Ordner nicht erreichbar' : e.message, dir }; log('Sicherung in Ordner fehlgeschlagen', dir, e.message); }
}

function localDate(offsetDays) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Alte Aufgaben und Termine aufräumen
function cleanup() {
  const today = localDate(0);
  let before = db.tasks.length + db.events.length;
  // Liegen gebliebene Aufgaben für die Team-Auswertung merken (ohne Titel, ohne Person)
  for (const t of db.tasks) if (t.date < today && !t.done) logTask(t);
  db.tasks = db.tasks.filter(t => t.date >= today);
  const keepLog = Date.now() - 90 * 864e5, nLog = db.taskLog.length;
  db.taskLog = db.taskLog.filter(e => e.due >= keepLog);
  db.events = db.events.filter(e => e.date >= today);
  const nNotes = db.notes.length;
  db.notes = db.notes.filter(n => n.kind !== 'lob' || (n.date || today) >= today);
  if (db.notes.length !== nNotes) before++;
  // Rückscan-Stand: nach 8 Stunden ohne Meldung oder am Tag nach dem Abschluss ausblenden
  for (const [k, r] of Object.entries(db.rueckscan || {})) if (Date.now() - r.at > 8 * 3600000 || (r.done && localDateOf(new Date(r.at)) < today)) { delete db.rueckscan[k]; before++; }
  // Abwesenheiten nur so lange aufheben, wie sie im Monatskalender noch zu sehen sind
  const keep = localDate(-62), nAbs = db.absences.length;
  db.absences = db.absences.filter(a => a.to >= keep);
  if (db.tasks.length + db.events.length !== before || db.absences.length !== nAbs || db.taskLog.length !== nLog) save();
}

/* ---------- Team-Auswertung der Aufgaben ----------
   Bewusst nur Zeitpunkte, kein Titel und keine Person: keine Leistungskontrolle Einzelner (Board-Regel). */
const dueOf = t => new Date(`${t.date}T${t.time}:00`).getTime();
function logTask(t) {
  db.taskLog = db.taskLog.filter(e => e.id !== t.id);
  db.taskLog.push({ id: t.id, created: t.created || dueOf(t), due: dueOf(t), doneAt: t.done ? (t.doneAt || Date.now()) : null });
}
function taskStats(days) {
  const from = Date.now() - days * 864e5, now = Date.now();
  // heutige offene Aufgaben zählen erst, wenn der Tag vorbei ist
  const list = db.taskLog.filter(e => e.due >= from && e.due <= now + 864e5);
  const done = list.filter(e => e.doneAt), mins = done.map(e => Math.max(0, (e.doneAt - e.created) / 60000)).sort((a, b) => a - b);
  const wd = [0, 0, 0, 0, 0, 0, 0], hours = Array(24).fill(0);
  for (const e of done) { const d = new Date(e.doneAt); wd[(d.getDay() + 6) % 7]++; hours[d.getHours()]++; }
  const weeks = [];
  for (let i = Math.min(12, Math.ceil(days / 7)) - 1; i >= 0; i--) {
    const a = now - (i + 1) * 7 * 864e5, b = now - i * 7 * 864e5;
    weeks.push({ from: a, done: done.filter(e => e.doneAt >= a && e.doneAt < b).length, open: list.filter(e => !e.doneAt && e.due >= a && e.due < b).length });
  }
  return {
    days, total: list.length, done: done.length, open: list.length - done.length,
    onTime: done.filter(e => e.doneAt <= e.due).length,
    avgMin: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
    medianMin: mins.length ? Math.round(mins[Math.floor(mins.length / 2)]) : null,
    weekday: wd, hours, weeks, since: db.taskLog.length ? Math.min(...db.taskLog.map(e => e.due)) : null,
  };
}

/* ---------- Eingaben prüfen (Allowlist) ---------- */
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
const oneOf = (v, list, d) => list.includes(v) ? v : d;
const newId = () => crypto.randomBytes(6).toString('hex');

const DEVICE_TYPES = ['Notebook', 'Monitor', 'Smartphone', 'Tablet', 'Drucker', 'Dockingstation', 'Headset', 'Lieferung', 'Sonstiges'];
const AREAS = ['Internet', 'WLAN', 'Telefonie', 'E-Mail', 'Drucker', 'Dateiablage', 'Strom / Gebäude', 'Sonstiges'];
const ICONS = ['laptop', 'monitor', 'phone', 'box', 'printer'];

const schemas = {
  tasks: b => {
    if (!clean(b.title, 60) || !isTime(b.time)) return null;
    // by: Kürzel (Person) nur bei erledigten Aufgaben, verschwindet mit der Aufgabe am Tagesende
    return { title: clean(b.title, 60), time: b.time, date: isDate(b.date) ? b.date : localDate(0), remind: b.remind !== false, done: !!b.done, by: b.done && db.people.some(p => p.id === b.by) ? b.by : '' };
  },
  events: b => {
    if (!clean(b.title, 40) || !isTime(b.time)) return null;
    // top: auch oben bei den Aufgaben zeigen, am Tag selbst und am Tag davor
    // countdown: oben in der Hinweiszeile „Noch 12 Tage bis …“
    return { title: clean(b.title, 40), meta: clean(b.meta, 24), time: b.time, date: isDate(b.date) ? b.date : localDate(0), top: !!b.top, countdown: !!b.countdown };
  },
  // Personen nur als Kürzel mit Farbe, keine Klarnamen
  people: b => {
    const short = clean(b.short, 4).toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');
    if (!short || !/^#[0-9a-fA-F]{6}$/.test(b.color || '')) return null;
    return { short, color: b.color };
  },
  // Urlaub oder allgemeine Abwesenheit (bewusst keine Krankheit: Gesundheitsdaten gehören nicht aufs Board)
  absences: b => {
    if (!db.people.some(x => x.id === b.person) || !isDate(b.from) || !isDate(b.to) || b.to < b.from) return null;
    return { person: b.person, from: b.from, to: b.to, kind: oneOf(b.kind, ['urlaub', 'abwesend'], 'urlaub') };
  },
  // Notizen fürs Board: kurzer Text, sichtbar für Besucher (im Besuchermodus unscharf)
  // kind 'lob': anonymer Dank in der Lob-Ecke, verschwindet am Ende des Tages
  notes: b => {
    if (!clean(b.text, 140)) return null;
    return b.kind === 'lob' ? { text: clean(b.text, 140), kind: 'lob', date: isDate(b.date) ? b.date : localDate(0) } : { text: clean(b.text, 140) };
  },
  loans: b => {
    const total = Math.max(0, Math.min(999, parseInt(b.total, 10) || 0));
    return { type: clean(b.type, 24) || 'Geräte', icon: oneOf(b.icon, ICONS, 'box'), total, avail: Math.max(0, Math.min(total, parseInt(b.avail, 10) || 0)) };
  },
};
// Felder, die beim Ändern erlaubt sind
const patchable = {
  tasks: ['title', 'time', 'remind', 'done', 'by'], events: ['title', 'meta', 'time', 'date', 'top', 'countdown'],
  loans: ['type', 'icon', 'avail', 'total'],
  people: ['short', 'color'], absences: ['person', 'from', 'to', 'kind'], notes: ['text'],
};

function sanitizeSettings(b) {
  const s = {};
  if (b.theme && typeof b.theme === 'object') {
    const colors = {};
    for (const [k, v] of Object.entries(b.theme.colors || {})) if (/^[a-z-]{2,12}$/.test(k) && /^#[0-9a-fA-F]{6}$/.test(v)) colors[k] = v;
    s.theme = { preset: clean(b.theme.preset, 12) || 'custom', colors: Object.keys(colors).length ? colors : null };
  }
  if ('muted' in b) s.muted = !!b.muted;
  if ('visitor' in b) s.visitor = !!b.visitor;
  if ('lead' in b) s.lead = oneOf(+b.lead, [5, 10, 15, 30], 15);
  if ('volume' in b) s.volume = Math.max(0, Math.min(1, +b.volume || 0));
  if (Array.isArray(b.rainHours)) s.rainHours = [...new Set(b.rainHours.map(Number).filter(h => h >= 0 && h <= 23.5 && Number.isInteger(h * 2)))].slice(0, 12); // auch halbe Stunden, z. B. 16.5
  if (isTime(b.officeStart)) s.officeStart = b.officeStart;
  if (isTime(b.officeEnd)) s.officeEnd = b.officeEnd;
  if ('skin' in b) s.skin = oneOf(b.skin, ['standard', 'glas', 'neon', 'klar', 'fluid', 'aurora', 'ozean', 'sonne', 'papier', 'pop'], 'standard');
  if (b.mascot && typeof b.mascot === 'object') {
    const m = b.mascot, hex = v => /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : '';
    s.mascot = {
      fig: oneOf(m.fig, ['aus', 'strich', 'kugel', 'katze', 'mieze', 'hund', 'geist'], 'strich'), color: hex(m.color) || '#7FE0AE', text: hex(m.text),
      font: oneOf(m.font, ['strich', 'segoe', 'rund', 'technik', 'kraeftig', 'klassisch', 'verspielt'], 'strich'),
      every: oneOf(String(m.every), ['zufall', '5', '10', '15', '30', '60'], 'zufall'), size: oneOf(m.size, ['klein', 'mittel', 'gross'], 'mittel'), mood: oneOf(m.mood, ['lieb', 'frech', 'gemischt'], 'lieb'),
      alerts: m.alerts !== false, walk: isTime(m.walk) ? m.walk : '', deco: m.deco !== false,
    };
  }
  if ('layout' in b) {
    // Kachel-Anordnung im 12x6-Raster: [Spalte, Zeile, Breite, Höhe], nur vollständig und ohne Überlappung
    const keys = ['cal', 'wx', 'loan', 'month', 'incident', 'notes', 'transit', 'sec', 'news'], L = b.layout || {};
    const hidden = Array.isArray(L.hidden) ? keys.filter(k => L.hidden.includes(k)) : [];
    const shown = keys.filter(k => !hidden.includes(k));
    const ok = a => Array.isArray(a) && a.length === 4 && a.every(Number.isInteger) && a[0] >= 1 && a[1] >= 1 && a[2] >= 2 && a[3] >= 2 && a[0] + a[2] <= 13 && a[1] + a[3] <= 7;
    const hit = (a, c) => a[0] < c[0] + c[2] && c[0] < a[0] + a[2] && a[1] < c[1] + c[3] && c[1] < a[1] + a[3];
    s.layout = keys.every(k => ok(L[k])) && shown.every((k, i) => shown.slice(i + 1).every(j => !hit(L[k], L[j]))) ? { ...Object.fromEntries(keys.map(k => [k, L[k]])), hidden } : null;
  }
  if ('transit' in b) {
    const tr = b.transit;
    s.transit = tr && typeof tr === 'object' && /^[A-Za-z0-9:_.-]{1,30}$/.test(String(tr.id || '')) ? { id: String(tr.id), name: clean(tr.name, 60) } : null;
    if (!('transitDir' in b)) s.transitDir = null; // neue Haltestelle: erst mal beide Richtungen
  }
  // Richtung der Abfahrten: Steig (z. B. SB1) oder einzelnes Fahrtziel, null = alle
  if ('transitDir' in b) s.transitDir = typeof b.transitDir === 'string' && b.transitDir.trim() ? clean(b.transitDir, 60) : null;
  if (b.radar && typeof b.radar === 'object') s.radar = { zoom: oneOf(+b.radar.zoom, [1, 1.5, 2, 3, 4, 6, 8, 12, 16], 1), play: b.radar.play !== false };
  if ('route' in b) {
    const r = b.route;
    // Ziele können Straßen sein, deren Kennung Leerzeichen und Klammern enthält
    s.route = r && typeof r === 'object' && /^[^\u0000-\u001f<>]{1,200}$/.test(String(r.id || '')) ? { id: String(r.id), name: clean(r.name, 60), label: clean(r.label || r.name, 40) } : null;
  }
  if ('routeOn' in b) s.routeOn = !!b.routeOn;
  // Nachrichten: welche Quellen, Laufband unten an/aus
  if (Array.isArray(b.newsSources)) s.newsSources = ['tagesschau', 'dlf', 'ntv', 'zdf', 'welt'].filter(k => b.newsSources.includes(k));
  if ('newsTicker' in b) s.newsTicker = !!b.newsTicker;
  // Nachrichten-Kachel: seitenweise (Anzahl, Sekunden) oder durchlaufend
  if ('newsMode' in b) s.newsMode = oneOf(b.newsMode, ['page', 'roll'], 'page');
  if ('newsPer' in b) s.newsPer = Math.max(1, Math.min(8, parseInt(b.newsPer, 10) || 3));
  if ('newsEvery' in b) s.newsEvery = Math.max(5, Math.min(600, parseInt(b.newsEvery, 10) || 30));
  // Board zeigt dauerhaft den Jahreskalender
  if ('calendarMode' in b) s.calendarMode = !!b.calendarMode;
  // Themen, die ausgeblendet werden (z. B. Fußball)
  if (Array.isArray(b.newsHide)) s.newsHide = ['politik', 'wirtschaft', 'fussball', 'sport', 'panorama', 'wissen', 'kultur'].filter(k => b.newsHide.includes(k));
  // QR-Codes zu eigenen Anleitungen (Drucker, VPN …) und Gäste-WLAN
  if (Array.isArray(b.guides)) s.guides = b.guides.map(g => ({ title: clean(g && g.title, 30), url: clean(g && g.url, 300) })).filter(g => g.title && /^https?:\/\/[^\s]+$/i.test(g.url)).slice(0, 8);
  if ('wifi' in b) {
    const w = b.wifi;
    s.wifi = w && typeof w === 'object' && clean(w.ssid, 32) ? { ssid: String(w.ssid).trim().slice(0, 32), pass: String(w.pass ?? '').slice(0, 63), sec: oneOf(w.sec, ['WPA', 'nopass'], 'WPA') } : null;
  }
  // Zusätzlicher Ordner für die tägliche Sicherung (leer = Standardordner)
  if ('backupDir' in b) s.backupDir = clean(b.backupDir, 200).replace(/[<>|"?*]/g, '');
  if ('rueckscanKey' in b) s.rueckscanKey = clean(b.rueckscanKey, 64);
  // Müllabfuhr (aha): Straße und Hausnummer der Büro-Adresse
  if ('waste' in b) { const w = b.waste; s.waste = w && typeof w === 'object' && clean(w.street, 60) ? { street: clean(w.street, 60), nr: clean(w.nr, 6), town: clean(w.town, 30) || 'Hannover' } : null; }
  if ('wasteOn' in b) s.wasteOn = !!b.wasteOn;
  if ('autoUpdate' in b) s.autoUpdate = oneOf(b.autoUpdate, ['sofort', 'nachts', 'aus'], 'sofort');
  if ('updateEvery' in b) s.updateEvery = oneOf(+b.updateEvery, [30, 60, 300, 1800], 30);
  return s;
}

// Was das Board sehen darf: keine Seriennummern, Fotos, Zustände oder internen Notizen
function boardView() {
  const today = localDate(0), tomorrow = localDate(1);
  return {
    // Auch spätere Tage: das Board zeigt sie im Monatskalender und zählt geplante Aufgaben
    tasks: db.tasks.filter(t => t.date >= today),
    events: db.events.filter(e => e.date >= today),
    loans: db.loans, incident: db.incident, settings: publicSettings(), mobileUrl: mobileUrl(),
    backup: backupInfo, rueckscan: Object.values(db.rueckscan || {}),
    people: db.people, absences: db.absences, notes: db.notes, extras: extras.view(),
    version: VERSION, changelog: CHANGELOG, lastUpdate: readJson(path.join(DATA, 'last-update.json'), null), display: display.view(),
    update: { available: update.available, notes: update.notes, changes: update.changes, error: update.error, checked: update.checked, busy: update.busy },
    scanTool,
  };
}
// Den Rückscan-Schlüssel nicht an Board und Handy schicken, nur ob einer gesetzt ist
function publicSettings() { const { rueckscanKey, ...rest } = db.settings; return { ...rest, rueckscanKeySet: !!rueckscanKey }; }
function fullView() {
  return { ...boardView(), tasks: db.tasks, events: db.events, tunnel: tunnel.status() };
}
function mobileUrl() {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  return ips.length ? `http://${ips[0]}:${config.port}/m` : `http://${os.hostname()}:${config.port}/m`;
}

/* ---------- Zugang ---------- */
const sessions = new Map(Object.entries(readJson(path.join(DATA, 'sessions.json'), {})));
const attempts = new Map();
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
// Anfragen über den Cloudflare-Tunnel kommen ebenfalls von localhost, gelten aber als Zugriff von außen
// Der Fernzugang (Tailscale Funnel) leitet auf einen eigenen Port nur für localhost, dort gilt alles als extern
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cf-access-jwt-assertion', 'x-forwarded-for', 'forwarded', 'tailscale-funnel-request'];
function viaProxy(req) { return req.socket.localPort === config.externalPort || PROXY_HEADERS.some(h => h in req.headers); }
function isLocal(req) { return LOOPBACK.includes(req.socket.remoteAddress || '') && !viaProxy(req); }
function clientIp(req) {
  const a = req.socket.remoteAddress || '';
  if (LOOPBACK.includes(a) && req.headers['cf-connecting-ip']) return 'cf:' + String(req.headers['cf-connecting-ip']).slice(0, 64);
  return a;
}
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0])); }
function authed(req) {
  if (isLocal(req)) return true;
  const t = cookies(req).wb;
  return !!t && sessions.has(t);
}
// Von außen zählen Fehlversuche zusätzlich insgesamt: nach 30 in einer Stunde ist die Anmeldung von außen 1 Stunde gesperrt
const extFails = { n: 0, t: Date.now() };
function login(req, res, body) {
  const ext = viaProxy(req);
  if (ext) {
    if (Date.now() - extFails.t > 3600000) { extFails.n = 0; extFails.t = Date.now(); }
    if (extFails.n >= 30) return send(res, 429, { error: 'Zu viele Fehlversuche von außen. Bitte in einer Stunde erneut versuchen.' });
  }
  const ip = clientIp(req);
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 60000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 5) return send(res, 429, { error: 'Zu viele Versuche. Bitte eine Minute warten.' });
  const ok = typeof body.pin === 'string' && body.pin.length === config.pin.length &&
    crypto.timingSafeEqual(Buffer.from(body.pin), Buffer.from(config.pin));
  if (!ok) { a.n++; attempts.set(ip, a); if (ext) extFails.n++; return send(res, 401, { error: 'PIN stimmt nicht.' }); }
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, Date.now());
  fs.writeFileSync(path.join(DATA, 'sessions.json'), JSON.stringify(Object.fromEntries(sessions)));
  res.setHeader('Set-Cookie', `wb=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
  send(res, 200, { ok: true });
}

/* ---------- Live-Aktualisierung (Server-Sent Events) ---------- */
const clients = new Set();
function broadcast() {
  for (const c of clients) c.res.write(`data: ${JSON.stringify(c.full ? fullView() : boardView())}\n\n`);
}

/* ---------- Anzeige am Notebook (minimieren, schließen) ---------- */
const display = require('./display')({ ROOT, DATA, config, log, broadcast: () => broadcast(), officeStart: () => db.settings.officeStart });
const tunnel = require('./tunnel')({ ROOT, config, log, broadcast: () => broadcast() });
const radar = require('./radar')({ DATA, config, log });
const extras = require('./extras')({ DATA, config, log, getSettings: () => db.settings, broadcast: () => broadcast(), localDate });

/* ---------- Wetter vom DWD über Bright Sky ---------- */
let weather = { ok: false, updated: 0 };
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Buero-Wallboard/1.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function updateWeather() {
  const { lat, lon } = config;
  try {
    const [cur, fc, al] = await Promise.all([
      getJson(`https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lon}`),
      getJson(`https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${localDate(0)}&last_date=${localDate(1)}&tz=Europe/Berlin`),
      getJson(`https://api.brightsky.dev/alerts?lat=${lat}&lon=${lon}`).catch(() => ({ alerts: [] })),
    ]);
    const c = cur.weather || {};
    const hours = {};
    for (const w of fc.weather || []) {
      const d = new Date(w.timestamp);
      if (localDateOf(d) !== localDate(0)) continue;
      hours[d.getHours()] = {
        prob: w.precipitation_probability ?? (w.precipitation > 0.1 ? 80 : w.precipitation > 0 ? 40 : 5),
        mm: w.precipitation ?? 0, temp: w.temperature,
      };
    }
    weather = {
      ok: true, updated: Date.now(), source: 'DWD',
      now: { temp: c.temperature, condition: c.condition, icon: c.icon, wind: c.wind_speed_10 ?? c.wind_speed_30, windDir: c.wind_direction_10 ?? c.wind_direction_30 },
      hours,
      alerts: (al.alerts || []).filter(a => !a.expires || new Date(a.expires) > new Date())
        .map(a => ({ event: a.event_de || a.event_en, headline: a.headline_de || a.headline_en, severity: a.severity, until: a.expires })),
    };
  } catch (e) {
    log('Wetter nicht erreichbar:', e.message);
    weather.ok = false;
  }
  broadcast();
}
function localDateOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/* ---------- Updates aus dem GitHub-Repository ----------
   Im Repository liegt manifest.json mit Version und SHA-256 jeder Datei unter app/.
   Installiert wird nur auf Knopfdruck. Der Starter (launcher.js) stellt die alte
   Version wieder her, falls die neue nicht startet. */
const APP_NEW = path.join(ROOT, 'app.new'), APP_OLD = path.join(ROOT, 'app.old');
let update = { available: null, notes: '', changes: [], error: '', checked: 0, busy: false, manifest: null };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function fetchRepoFile(file) {
  const { updateRepo: repo, updateBranch: branch, updateToken: token } = config;
  const url = config.updateUrl ? `${config.updateUrl.replace(/\/$/, '')}/${file}`
    : token ? `https://api.github.com/repos/${repo}/contents/${file}?ref=${branch}`
    : `https://raw.githubusercontent.com/${repo}/${branch}/${file}?t=${Date.now()}`;
  const headers = { 'User-Agent': 'Buero-Wallboard', 'Cache-Control': 'no-cache' };
  if (token) { headers.Authorization = `Bearer ${token}`; headers.Accept = 'application/vnd.github.raw'; }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(r.status === 404 ? 'Update-Quelle nicht gefunden' : `Update-Quelle antwortet mit ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
// Scan-Tool (Rückscan): liegt im selben Repository unter downloads/, das Board zeigt nur den Download-Link
let scanTool = null;
async function checkScanTool() {
  try {
    const j = JSON.parse((await fetchRepoFile('downloads/rueckscan.json')).toString('utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(j.version)) throw new Error('ungültig');
    const file = /^[\w.-]+\.zip$/.test(j.datei) ? j.datei : 'Rueckscan.zip';
    const url = config.updateUrl ? `${config.updateUrl.replace(/\/$/, '')}/downloads/${file}`
      : `https://github.com/${config.updateRepo}/raw/${config.updateBranch}/downloads/${file}`;
    scanTool = { version: j.version, date: /^\d{4}-\d{2}-\d{2}$/.test(j.datum) ? j.datum : '', url, file };
  } catch { /* behält die letzte bekannte Version */ }
}
// Speichert das Scan-Tool direkt auf diesem PC: Desktop für alle Benutzer, sonst öffentliche Downloads
async function saveScanTool() {
  if (!scanTool) throw new Error('Version noch unbekannt, bitte gleich nochmal versuchen');
  const zip = await fetchRepoFile(`downloads/${scanTool.file}`);
  if (zip.length > 30e6 || zip.toString('latin1', 0, 2) !== 'PK') throw new Error('Die Datei ist ungültig');
  const pub = process.env.PUBLIC || 'C:\\Users\\Public';
  const dirs = process.platform === 'win32'
    ? [[path.join(pub, 'Desktop'), 'Desktop'], [path.join(pub, 'Downloads'), 'Öffentliche Downloads'], [path.join(DATA, 'downloads'), 'Wallboard-Ordner']]
    : [[path.join(DATA, 'downloads'), 'Wallboard-Ordner']];
  const name = `Rueckscan-${scanTool.version}.zip`;
  for (const [dir, where] of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), zip);
      // ältere Versionen im selben Ordner entfernen, damit nur eine Datei liegt
      for (const f of fs.readdirSync(dir)) if (/^Rueckscan-\d+\.\d+\.\d+\.zip$/.test(f) && f !== name) fs.rmSync(path.join(dir, f), { force: true });
      log(`Scan-Tool ${scanTool.version} gespeichert: ${where}`);
      return { name, where };
    } catch (e) { log(`Scan-Tool speichern in ${where} fehlgeschlagen:`, e.message); }
  }
  throw new Error('Speichern hat nicht geklappt');
}
let lastCheckSent = 0;
async function checkUpdate(auto = true) {
  if (!config.updateRepo && !config.updateUrl) return;
  const before = `${update.available}|${update.error}|${scanTool?.version}`;
  await checkScanTool();
  try {
    const m = JSON.parse((await fetchRepoFile('manifest.json')).toString('utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(m.version) || typeof m.files !== 'object') throw new Error('Update-Beschreibung ungültig');
    update.manifest = m;
    let failed = ''; try { failed = fs.readFileSync(path.join(DATA, 'update-failed'), 'utf8').trim(); } catch {}
    update.available = newer(m.version, VERSION) && m.version !== failed ? m.version : null;
    update.notes = clean(m.notes, 300);
    update.changes = Array.isArray(m.changes) ? m.changes.slice(0, 15).map(c => clean(c, 160)).filter(Boolean) : [];
    update.error = m.version === failed ? `Version ${failed} ließ sich nicht starten, die bisherige Version läuft weiter` : '';
  } catch (e) {
    update.error = e.message;
  }
  const changed = before !== `${update.available}|${update.error}|${scanTool?.version}`;
  update.checked = Date.now();
  // Bei häufigem Prüfen nur melden, wenn sich etwas geändert hat
  if (changed || !auto || Date.now() - lastCheckSent > 30 * 60000) { lastCheckSent = Date.now(); broadcast(); }
  if (auto && update.available && !update.busy && autoUpdateAllowed()) {
    log(`Installiere Version ${update.available} automatisch`);
    installUpdate().catch(e => log('Automatisches Update fehlgeschlagen:', e.message));
  }
}
// Automatisch installieren: sofort (nicht während einer gemeldeten Störung) oder nur außerhalb der Bürozeiten
function autoUpdateAllowed() {
  const mode = db.settings.autoUpdate || 'sofort';
  if (mode === 'aus' || db.incident) return false;
  if (mode === 'sofort') return true;
  const d = new Date(), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.getDay() === 0 || d.getDay() === 6 || hm < db.settings.officeStart || hm >= db.settings.officeEnd;
}
async function installUpdate() {
  if (update.busy) throw new Error('Update läuft bereits');
  update.busy = true;
  try { await checkUpdate(false); } finally { update.busy = false; }
  const m = update.manifest;
  if (!update.available || !m) throw new Error('Keine neue Version vorhanden');
  update.busy = true; broadcast();
  try {
    fs.rmSync(APP_NEW, { recursive: true, force: true });
    for (const [rel, hash] of Object.entries(m.files)) {
      if (!/^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.(js|html|json|css|svg|png|woff2)$/i.test(rel) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Ungültiger Dateiname im Update: ${rel}`);
      const buf = await fetchRepoFile(`app/${rel}`);
      if (crypto.createHash('sha256').update(buf).digest('hex') !== hash) throw new Error(`Prüfsumme stimmt nicht: ${rel}`);
      const dest = path.join(APP_NEW, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
    if (!fs.existsSync(path.join(APP_NEW, 'server.js'))) throw new Error('Update unvollständig');
    backup();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
    fs.rmSync(APP_OLD, { recursive: true, force: true });
    fs.renameSync(__dirname, APP_OLD);
    fs.renameSync(APP_NEW, __dirname);
    fs.writeFileSync(path.join(DATA, 'update-pending'), JSON.stringify({ from: VERSION, to: m.version, at: Date.now() }));
    log(`Update ${VERSION} -> ${m.version} installiert, Neustart`);
    for (const c of clients) c.res.write(`event: restart\ndata: {}\n\n`);
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    update.busy = false; update.error = e.message;
    fs.rmSync(APP_NEW, { recursive: true, force: true });
    broadcast();
    throw e;
  }
}

/* ---------- Rückscan-Stand ----------
   Das Programm Rückscan meldet nur Zahlen und den Vorgangsnamen (z. B. „Wagen 1“), keine Geräte- und keine Personendaten.
   Es läuft als Datei im Browser eines anderen Büro-PCs, deshalb mit CORS. Ohne Schlüssel nur aus dem lokalen Netz. */
const privateIp = a => /^(::ffff:)?(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(a) || a === '::1' || /^f[cd]/i.test(a);
async function rueckscanStand(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Rueckscan-Schluessel', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' };
  const reply = (code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'POST') return reply(405, { error: 'Nur POST' });
  const key = db.settings.rueckscanKey;
  if (key ? String(req.headers['x-rueckscan-schluessel'] || '') !== key : (viaProxy(req) || !privateIp(req.socket.remoteAddress || ''))) return reply(403, { error: key ? 'Schlüssel stimmt nicht' : 'Nur aus dem Büro-Netz' });
  let b; try { b = await readBody(req, 2000); } catch { return reply(400, { error: 'Ungültige Daten' }); }
  const name = clean(b.vorgang, 40), num = v => Math.max(0, Math.min(100000, parseInt(v, 10) || 0));
  if (!name) return reply(400, { error: 'vorgang fehlt' });
  const keys = Object.keys(db.rueckscan);
  if (!db.rueckscan[name] && keys.length >= 6) delete db.rueckscan[keys.sort((x, y) => db.rueckscan[x].at - db.rueckscan[y].at)[0]];
  db.rueckscan[name] = { name, art: clean(b.art, 20) || 'Rückscan', done: !!b.abgeschlossen, count: num(b.erledigt), total: num(b.gesamt), extra: num(b.nichtErwartet), at: Date.now() };
  save();
  return reply(200, { ok: true });
}

let lastKnock = 0;

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function send(res, code, obj, type = 'application/json; charset=utf-8') {
  const body = typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => err ? send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8')
    : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    // Seiten
    if (req.method === 'GET' && p === '/' && viaProxy(req)) { res.writeHead(302, { Location: '/m' }); return res.end(); }
    if (req.method === 'GET' && (p === '/' || p === '/board')) return serveFile(res, path.join(PUBLIC, 'board.html'));
    if (req.method === 'GET' && p === '/m') return serveFile(res, path.join(PUBLIC, 'm.html'));
    if (req.method === 'GET' && p.startsWith('/static/')) {
      const f = path.join(PUBLIC, path.normalize(p.slice(8)).replace(/^(\.\.[/\\])+/, ''));
      if (!f.startsWith(PUBLIC)) return send(res, 403, 'Nein', 'text/plain');
      return serveFile(res, f);
    }
    if (req.method === 'GET' && p === '/m.webmanifest') return send(res, 200, JSON.stringify({ name: 'Büro-Board', short_name: 'Board', start_url: '/m', scope: '/', display: 'standalone', background_color: '#0F2A1F', theme_color: '#0F2A1F', lang: 'de', icons: [{ src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }), 'application/manifest+json');
    if (p === '/api/rueckscan/stand') return rueckscanStand(req, res);
    if (req.method === 'POST' && p === '/api/login') return login(req, res, await readBody(req, 1000));
    if (req.method === 'GET' && p === '/api/me') return send(res, 200, { authed: authed(req) });

    if (!p.startsWith('/api/')) return send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
    if (!authed(req)) return send(res, 401, { error: 'PIN nötig' });

    if (req.method === 'GET' && p === '/api/state') return send(res, 200, url.searchParams.get('full') ? fullView() : boardView());
    if (req.method === 'GET' && p === '/api/weather') return send(res, 200, weather);
    if (req.method === 'GET' && p === '/api/radar') return send(res, 200, radar.view());
    if (req.method === 'GET' && p.startsWith('/api/radar/')) {
      const img = radar.image(p.slice(11));
      return img ? send(res, 200, img, 'image/png') : send(res, 404, 'Nicht gefunden', 'text/plain; charset=utf-8');
    }
    if (req.method === 'GET' && p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const c = { res, full: !!url.searchParams.get('full') };
      clients.add(c);
      res.write(`data: ${JSON.stringify(c.full ? fullView() : boardView())}\n\n`);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(c); });
      return;
    }
    let m;
    if (req.method === 'POST' && p === '/api/update/check') { await checkUpdate(); return send(res, 200, { available: update.available, error: update.error }); }
    if (req.method === 'POST' && p === '/api/update/install') {
      try { await installUpdate(); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 409, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/display') {
      const b = { ...Object.fromEntries(url.searchParams), ...await readBody(req, 1000) };
      try { return send(res, 200, display.set(String(b.mode), b.minutes)); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/tunnel') {
      if (req.method === 'GET') { await tunnel.refresh(); return send(res, 200, tunnel.status()); }
      // Einrichten und Entfernen nur im Büro-WLAN, nicht über den Tunnel selbst
      if (viaProxy(req)) return send(res, 403, { error: 'Nur im Büro-WLAN möglich' });
      try {
        if (req.method === 'POST') return send(res, 200, await tunnel.install((await readBody(req, 4000)).token));
        if (req.method === 'DELETE') return send(res, 200, await tunnel.remove());
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/unlock') {
      const b = await readBody(req, 1000), ip = 'unlock:' + clientIp(req);
      const a = attempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 60000) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 5) return send(res, 429, { error: 'Zu viele Versuche. Bitte eine Minute warten.' });
      if (!checkPw(b.password)) { a.n++; attempts.set(ip, a); return send(res, 401, { error: 'Passwort stimmt nicht' }); }
      attempts.delete(ip);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && p === '/api/unlock') {
      const b = await readBody(req, 1000);
      if (!checkPw(b.old)) return send(res, 403, { error: 'Bisheriges Passwort stimmt nicht' });
      const pw = String(b.password ?? '');
      if (pw.length < 3 || pw.length > 64) return send(res, 400, { error: 'Neues Passwort: 3 bis 64 Zeichen' });
      const salt = crypto.randomBytes(12).toString('hex');
      db.unlock = { salt, hash: hashPw(pw, salt) }; save();
      return send(res, 200, { ok: true });
    }
    // Anklopfen vom Handy: das Board spielt ein Klopfgeräusch ab (höchstens alle 3 Sekunden)
    if (req.method === 'POST' && p === '/api/knock') {
      const b = await readBody(req, 500), s = Math.max(0, Math.min(5, parseInt(b.sound, 10) || 0));
      if (Date.now() - lastKnock < 3000) return send(res, 429, { error: 'Gerade erst geklopft, kurz warten' });
      const boards = [...clients].filter(c => !c.full);
      if (!boards.length) return send(res, 409, { error: 'Das Board ist gerade nicht verbunden' });
      lastKnock = Date.now();
      for (const c of boards) c.res.write(`event: knock\ndata: ${JSON.stringify({ s, at: lastKnock })}\n\n`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/backup') {
      if (!isLocal(req)) return send(res, 403, { error: 'Nur am Board möglich' });
      backup(); broadcast();
      return send(res, backupInfo.ok ? 200 : 500, backupInfo.ok ? backupInfo : { error: backupInfo.error });
    }
    if (req.method === 'PUT' && p === '/api/settings') {
      const patch = sanitizeSettings(await readBody(req, 10000));
      Object.assign(db.settings, patch); save();
      if ('transit' in patch || 'route' in patch || 'routeOn' in patch) extras.refreshTransit();
      if ('newsSources' in patch) extras.refreshNews();
      if ('waste' in patch || 'wasteOn' in patch) extras.refreshWaste();
      if ('backupDir' in patch) backup();
      return send(res, 200, db.settings);
    }
    // Haltestelle für die Abfahrten suchen (öffentliche Fahrplanauskunft)
    if (req.method === 'GET' && p === '/api/diag') return send(res, 200, await extras.diagnose());
    if (req.method === 'GET' && p === '/api/transit/stops') {
      const q = url.searchParams.get('q') || '';
      try { return send(res, 200, q.trim() ? await extras.search(q, url.searchParams.get('ziel') === '1') : await extras.nearby()); }
      catch { return send(res, 502, { error: 'Fahrplanauskunft gerade nicht erreichbar' }); }
    }
    if (p === '/api/incident') {
      if (req.method === 'DELETE') { db.incident = null; save(); return send(res, 200, { ok: true }); }
      if (req.method === 'PUT') {
        const b = await readBody(req, 2000);
        db.incident = { area: oneOf(b.area, AREAS, 'Sonstiges'), level: oneOf(b.level, ['warn', 'crit'], 'crit'), note: clean(b.note, 40), since: db.incident?.since || Date.now() };
        save(); return send(res, 200, db.incident);
      }
    }
    if (p === '/api/scantool/save' && req.method === 'POST') {
      // nur am Board selbst, vom Handy aus landet nichts auf dem PC
      if (!isLocal(req)) return send(res, 403, { error: 'Nur am Board möglich' });
      try { return send(res, 200, await saveScanTool()); } catch (e) { return send(res, 500, { error: e.message }); }
    }
    if (p === '/api/stats/tasks' && req.method === 'GET') {
      // Am Board nur mit Passwort, am Handy reicht die PIN
      if (isLocal(req)) {
        let pw = ''; try { pw = decodeURIComponent(req.headers['x-wallboard-passwort'] || ''); } catch {}
        if (!checkPw(pw)) return send(res, 403, { error: 'Passwort nötig' });
      }
      return send(res, 200, taskStats(oneOf(+url.searchParams.get('tage'), [7, 30, 90], 30)));
    }
    if ((m = p.match(/^\/api\/(tasks|events|loans|people|absences|notes)(?:\/([a-z0-9]{1,16}))?$/))) {
      const [, coll, id] = m;
      // Urlaube am Board nur mit Passwort ändern; am Handy reicht die PIN
      if ((coll === 'people' || coll === 'absences') && isLocal(req)) {
        let pw = ''; try { pw = decodeURIComponent(req.headers['x-wallboard-passwort'] || ''); } catch {}
        if (!checkPw(pw)) return send(res, 403, { error: 'Passwort nötig' });
      }
      if (req.method === 'POST' && !id) {
        const b = await readBody(req, 5000);
        const item = schemas[coll](b);
        if (!item) return send(res, 400, { error: 'Angaben unvollständig' });
        if (coll === 'notes' && db.notes.length >= 12) return send(res, 400, { error: 'Höchstens 12 Notizen, bitte erst eine löschen' });
        item.id = newId(); item.created = Date.now();
        db[coll].push(item); save();
        return send(res, 201, item);
      }
      const item = db[coll].find(x => x.id === id);
      if (!item) return send(res, 404, { error: 'Nicht gefunden' });
      if (req.method === 'PATCH') {
        const b = await readBody(req, 5000);
        const merged = schemas[coll]({ ...item, ...Object.fromEntries(Object.entries(b).filter(([k]) => patchable[coll].includes(k))) });
        if (!merged) return send(res, 400, { error: 'Angaben unvollständig' });
        if (coll === 'tasks' && merged.done !== item.done) {
          item.doneAt = merged.done ? Date.now() : null;
          if (merged.done) logTask({ ...item, ...merged }); else db.taskLog = db.taskLog.filter(e => e.id !== item.id);
        }
        Object.assign(item, merged); save();
        return send(res, 200, item);
      }
      if (req.method === 'DELETE') {
        db[coll] = db[coll].filter(x => x !== item);
        if (coll === 'people') db.absences = db.absences.filter(a => a.person !== item.id);
        save();
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'Unbekannt' });
  } catch (e) {
    if (e.message === 'too_large') return send(res, 413, { error: 'Zu groß (Foto max. 6 MB)' });
    if (e.message === 'bad_json') return send(res, 400, { error: 'Ungültige Daten' });
    log('Fehler', e); send(res, 500, { error: 'Interner Fehler' });
  }
});

// Eingang für den Fernzugang: nur von diesem Rechner aus erreichbar
http.createServer(server.listeners('request')[0]).on('error', e => log('Fernzugang-Port nicht verfügbar:', e.message)).listen(config.externalPort, '127.0.0.1');
server.listen(config.port, () => {
  log(`Wallboard ${VERSION} läuft auf http://localhost:${config.port}  ·  Handy: ${mobileUrl()}`);
  // Nach einer Minute stabilem Lauf gilt ein frisches Update als gelungen
  setTimeout(() => {
    const pending = readJson(path.join(DATA, 'update-pending'), null);
    if (!pending) return;
    // Passt die gestartete Version nicht zur angekündigten, nicht endlos neu installieren
    if (pending.to !== VERSION) fs.writeFileSync(path.join(DATA, 'update-failed'), pending.to);
    fs.writeFileSync(path.join(DATA, 'last-update.json'), JSON.stringify({ from: pending.from, version: VERSION, at: Date.now() }));
    try { fs.unlinkSync(path.join(DATA, 'update-pending')); } catch {}
    broadcast();
  }, 60000);
  display.installHelpers();
  setInterval(display.tick, 20000);
  // Nach Updates schauen im eingestellten Abstand (Standard alle 30 Sekunden)
  const updateLoop = () => checkUpdate().finally(() => setTimeout(updateLoop, (db.settings.updateEvery || 30) * 1000));
  setTimeout(updateLoop, 15000);
  cleanup(); backup(); updateWeather(); radar.update();
  setInterval(updateWeather, 10 * 60000);
  extras.start();
  setInterval(radar.update, 5 * 60000);
  setInterval(() => { cleanup(); }, 10 * 60000);
  setInterval(backup, 6 * 3600000);
});
