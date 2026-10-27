// Gescannte Geräte per E-Mail: kleiner SMTP-Versand ohne externe Abhängigkeiten (Gmail über SMTPS, Port 465).
// Zugangsdaten liegen nur auf dem Notebook in data/mail.json und gehen nie an Board oder Handy zurück.
'use strict';
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const crypto = require('crypto');

const MODES = ['sofort', 'taeglich', 'aus'];
const isMail = s => typeof s === 'string' && s.length <= 120 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(s);

// ---------- SMTP ----------
function smtpSend({ host, port, user, pass, insecure }, from, to, message) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: !insecure });
    sock.setEncoding('utf8');
    sock.setTimeout(30000, () => sock.destroy(new Error('Zeitüberschreitung beim Mailserver')));
    let buf = '', waiting = null;
    sock.on('data', d => {
      buf += d;
      // Antwort ist vollständig, wenn eine Zeile "123 ..." (Leerzeichen nach dem Code) kommt
      const lines = buf.split('\r\n'); buf = lines.pop();
      for (const l of lines) {
        if (!waiting) continue;
        waiting.text += l + '\n';
        if (/^\d{3} /.test(l)) { const w = waiting; waiting = null; w.done(+l.slice(0, 3), w.text); }
      }
    });
    sock.on('error', e => reject(new Error('Mailserver nicht erreichbar: ' + e.message)));
    const expect = (codes, send) => new Promise((ok, no) => {
      waiting = { text: '', done: (code, text) => codes.includes(code) ? ok(text) : no(Object.assign(new Error(text.trim().split('\n').pop()), { code })) };
      if (send !== undefined) sock.write(send + '\r\n');
    });
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
    (async () => {
      await expect([220]);
      await expect([250], 'EHLO wallboard');
      await expect([334], 'AUTH LOGIN');
      await expect([334], b64(user));
      try { await expect([235], b64(pass)); }
      catch { throw new Error('Anmeldung beim Mailkonto abgelehnt. Adresse und App-Passwort prüfen.'); }
      await expect([250], `MAIL FROM:<${from}>`);
      for (const r of to) await expect([250, 251], `RCPT TO:<${r}>`);
      await expect([354], 'DATA');
      const body = message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
      await expect([250], body + '\r\n.');
      sock.write('QUIT\r\n'); sock.end();
    })().then(resolve, e => { sock.destroy(); reject(e); });
  });
}

// ---------- Nachricht bauen (MIME) ----------
const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
const wrap = b => b.toString('base64').replace(/.{76}/g, '$&\r\n');
function buildMessage({ from, to, subject, text, attachments = [] }) {
  const boundary = 'wb' + crypto.randomBytes(12).toString('hex');
  const head = [
    `From: ${enc('Büro-Wallboard')} <${from}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${enc(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(10).toString('hex')}@wallboard>`,
    'MIME-Version: 1.0',
  ];
  const textPart = ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(Buffer.from(text, 'utf8'))].join('\r\n');
  if (!attachments.length) return [...head, textPart].join('\r\n');
  const parts = [textPart, ...attachments.map(a => [
    `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${a.name}"`, '', wrap(a.data)].join('\r\n'))];
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    ...parts.map(p => `--${boundary}\r\n${p}`), `--${boundary}--`].join('\r\n');
}

module.exports = function createMail({ DATA, PHOTOS, config, log, getScans, csv }) {
  const FILE = path.join(DATA, 'mail.json');
  const DEFAULTS = { mode: 'aus', dailyTime: '16:00', from: '', pass: '', recipients: [], domain: '', photo: false, lastDaily: '', lastError: '', lastSent: 0 };
  let cfg = Object.assign({}, DEFAULTS);
  try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
  const persist = () => { try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2)); } catch (e) { log('Mail-Einstellungen nicht gespeichert', e.message); } };

  const server = () => ({ host: config.smtpHost || 'smtp.gmail.com', port: config.smtpPort || 465, insecure: !!config.smtpInsecure, user: cfg.from, pass: cfg.pass });
  const ready = () => !!(cfg.from && cfg.pass && cfg.recipients.length);

  // Was Handy-Seite sehen darf: alles außer dem Passwort
  const view = () => ({ mode: cfg.mode, dailyTime: cfg.dailyTime, from: cfg.from, hasPass: !!cfg.pass, recipients: cfg.recipients, domain: cfg.domain, photo: cfg.photo, lastError: cfg.lastError, lastSent: cfg.lastSent, ready: ready() });

  function update(b) {
    const next = { ...cfg };
    if ('mode' in b) next.mode = MODES.includes(b.mode) ? b.mode : 'aus';
    if ('dailyTime' in b && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.dailyTime)) next.dailyTime = b.dailyTime;
    if ('photo' in b) next.photo = !!b.photo;
    if ('domain' in b) {
      const d = String(b.domain || '').trim().toLowerCase().replace(/^@?/, '@');
      next.domain = d === '@' ? '' : d;
      if (next.domain && !/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(next.domain)) throw new Error('Firmen-Endung bitte wie @eure-firma.de angeben');
    }
    if ('from' in b) {
      const f = String(b.from || '').trim();
      if (f && !isMail(f)) throw new Error('Absender ist keine gültige E-Mail-Adresse');
      next.from = f;
    }
    if (typeof b.pass === 'string' && b.pass.trim()) next.pass = b.pass.replace(/\s+/g, '').slice(0, 64);
    if (b.clearPass) next.pass = '';
    if (Array.isArray(b.recipients)) {
      const list = [...new Set(b.recipients.map(r => String(r || '').trim().toLowerCase()).filter(Boolean))];
      if (list.length > 3) throw new Error('Höchstens 3 Empfänger');
      for (const r of list) if (!isMail(r)) throw new Error(`„${r}“ ist keine gültige E-Mail-Adresse`);
      next.recipients = list;
    }
    if (next.domain) for (const r of next.recipients) if (!r.endsWith(next.domain)) throw new Error(`${r} endet nicht auf ${next.domain}`);
    cfg = next; persist();
    return view();
  }

  const fmt = t => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  function scanText(s) {
    return [
      `Gerät:        ${s.type || '–'}`,
      `Inventar-Nr.: ${s.inv || '–'}`,
      `Ablageort:    ${s.location || '–'}`,
      `Erfasst:      ${fmt(s.created)}`,
      `Seriennummer: ${s.serial || '–'}`,
      `Zustand:      ${s.condition || '–'}`,
      `Notiz:        ${s.note || '–'}`,
    ].join('\n');
  }
  const FOOT = '\n\n—\nAutomatisch vom Büro-Wallboard. Interne Gerätedaten, bitte nicht weiterleiten.';

  async function send(subject, text, attachments) {
    if (!ready()) throw new Error('Mailversand ist noch nicht vollständig eingerichtet');
    try {
      await smtpSend(server(), cfg.from, cfg.recipients, buildMessage({ from: cfg.from, to: cfg.recipients, subject, text: text + FOOT, attachments }));
      cfg.lastError = ''; cfg.lastSent = Date.now(); persist();
      log('Mail gesendet:', subject);
    } catch (e) {
      cfg.lastError = e.message; persist();
      log('Mail fehlgeschlagen:', e.message);
      throw e;
    }
  }

  function photoAttachment(s) {
    if (!cfg.photo || !s.photo) return [];
    try {
      const data = fs.readFileSync(path.join(PHOTOS, s.photo));
      const ext = path.extname(s.photo).slice(1);
      return [{ name: `${s.inv || s.id}.${ext}`.replace(/[^\w.-]/g, '_'), type: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext, data }];
    } catch { return []; }
  }

  const sendScan = s => send(`Scan: ${s.type || 'Gerät'} ${s.inv || ''}`.trim(), 'Neu gescannt:\n\n' + scanText(s), photoAttachment(s));
  const sendTest = () => send('Testmail vom Büro-Wallboard', 'Der Mailversand funktioniert.');

  // Nach einem neuen Scan (nur Modus „sofort“)
  function onScan(s) { if (cfg.mode === 'sofort' && ready()) sendScan(s).catch(() => {}); }

  // Tageszusammenfassung
  function tick() {
    if (cfg.mode !== 'taeglich' || !ready()) return;
    const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (hm < cfg.dailyTime || cfg.lastDaily === today) return;
    cfg.lastDaily = today; persist();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const list = getScans().filter(s => s.created >= start.getTime());
    if (!list.length) return;
    send(`Scans vom ${d.toLocaleDateString('de-DE')}: ${list.length} ${list.length === 1 ? 'Gerät' : 'Geräte'}`,
      list.map(scanText).join('\n\n'),
      [{ name: `scans-${today}.csv`, type: 'text/csv; charset=utf-8', data: Buffer.from(csv(list), 'utf8') }]).catch(() => {});
  }
  setInterval(tick, 60000);

  return { view, update, onScan, sendScan, sendTest };
};
module.exports.buildMessage = buildMessage;
