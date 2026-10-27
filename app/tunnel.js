// Zugriff von unterwegs über Tailscale Funnel: feste Adresse https://wallboard.<euer-netz>.ts.net, ohne eigene Domain.
// Den Zugangsschlüssel (Auth-Key) gibt jemand im Büro-WLAN auf der Handy-Seite ein. Er wird nicht gespeichert,
// Tailscale meldet das Notebook damit einmalig an. Der Funnel leitet nur auf den Fernzugang-Port, dort braucht jeder die PIN.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const PKGS = 'https://pkgs.tailscale.com/stable/';
const HOSTNAME = 'wallboard';

function parseKey(input) {
  const k = String(input || '').trim().split(/\s+/).find(w => w.startsWith('tskey-')) || '';
  return /^tskey-[A-Za-z0-9-]{10,200}$/.test(k) ? k : null;
}

function run(file, args, timeout = 120000, env) {
  return new Promise(resolve => execFile(file, args, { windowsHide: true, timeout, env: env ? { ...process.env, ...env } : undefined },
    (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '') + String(stderr || '') })));
}

module.exports = function createTunnel({ ROOT, config, log, broadcast }) {
  const DIR = path.join(ROOT, 'fernzugang');
  const PF = process.env.ProgramFiles || 'C:\\Program Files';
  const TS = path.join(PF, 'Tailscale', 'tailscale.exe');
  const supported = process.platform === 'win32';
  const target = 'http://127.0.0.1:' + config.externalPort;
  let state = { supported, installed: false, running: false, funnel: false, url: '', approveUrl: '', busy: false, step: '', error: '' };

  async function refresh() {
    if (!supported) return state;
    state.installed = fs.existsSync(TS);
    if (!state.installed) { state.running = state.funnel = false; state.url = ''; return state; }
    const st = await run(TS, ['status', '--json'], 20000);
    try {
      const j = JSON.parse(st.out.slice(st.out.indexOf('{')));
      state.running = j.BackendState === 'Running';
      const dns = String(j.Self?.DNSName || '').replace(/\.$/, '');
      state.url = state.running && dns ? 'https://' + dns + '/m' : '';
    } catch { state.running = false; state.url = ''; }
    const fs_ = await run(TS, ['funnel', 'status', '--json'], 20000);
    try { state.funnel = state.running && /AllowFunnel/.test(fs_.out) && fs_.out.includes(target); } catch { state.funnel = false; }
    if (state.funnel) state.approveUrl = '';
    return state;
  }

  const status = () => ({ ...state });
  function step(s) { state.step = s; log('Fernzugang:', s); broadcast(); }

  // Tailscale-Installer laden, Signatur prüfen und still installieren
  async function installTailscale() {
    fs.mkdirSync(DIR, { recursive: true });
    const list = await (await fetch(PKGS + '?mode=json', { signal: AbortSignal.timeout(30000) })).json();
    const name = list?.MSIs?.amd64;
    if (!/^tailscale-setup-[\d.]+-amd64\.msi$/.test(name || '')) throw new Error('Tailscale-Download nicht gefunden');
    const file = path.join(DIR, name);
    const res = await fetch(PKGS + name, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error('Download fehlgeschlagen (' + res.status + ')');
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
    const ps = "$s = Get-AuthenticodeSignature -LiteralPath $env:WB_FILE; if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -like '*Tailscale*') { 'OK' } else { 'BAD ' + $s.Status }";
    const sig = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 60000, { WB_FILE: file });
    if (sig.out.trim() !== 'OK') { try { fs.unlinkSync(file); } catch {} throw new Error('Der Installer ist nicht von Tailscale signiert'); }
    step('Installiere Tailscale');
    const r = await run('msiexec.exe', ['/i', file, '/quiet', '/norestart', 'TS_NOLAUNCH=1', 'TS_UNATTENDEDMODE=always'], 600000);
    try { fs.unlinkSync(file); } catch {}
    for (let i = 0; i < 30 && !fs.existsSync(TS); i++) await new Promise(r => setTimeout(r, 2000));
    if (!fs.existsSync(TS)) throw new Error('Tailscale konnte nicht installiert werden' + (r.ok ? '' : ' (Installer-Fehler)'));
    await new Promise(r => setTimeout(r, 5000));
  }

  async function startFunnel() {
    step('Schalte die feste Adresse frei');
    const r = await run(TS, ['funnel', '--bg', '--https=443', target], 45000);
    const m = r.out.match(/https:\/\/login\.tailscale\.com\/\S+/);
    if (m) { state.approveUrl = m[0]; throw new Error('Funnel muss einmal im Tailscale-Konto erlaubt werden. Link unten öffnen, bestätigen, dann „Nochmal versuchen“.'); }
    await refresh();
    if (!state.funnel) throw new Error('Die feste Adresse ließ sich nicht einschalten');
  }

  // key: Auth-Key; leer = nur Funnel erneut versuchen (wenn schon angemeldet)
  async function install(input) {
    if (!supported) throw new Error('Nur auf dem Windows-Notebook möglich');
    if (state.busy) throw new Error('Wird gerade eingerichtet');
    await refresh();
    const key = parseKey(input);
    if (!key && (String(input || '').trim() || !state.installed)) throw new Error('Das ist kein gültiger Schlüssel. Er beginnt mit „tskey-auth-“.');
    state = { ...state, busy: true, error: '' };
    (async () => {
      try {
        if (!fs.existsSync(TS)) { step('Lade Tailscale herunter'); await installTailscale(); }
        if (key) {
          step('Melde das Notebook an');
          const up = await run(TS, ['up', '--auth-key=' + key, '--hostname=' + HOSTNAME, '--unattended', '--reset'], 120000);
          await refresh();
          if (!state.running) throw new Error('Anmeldung fehlgeschlagen: ' + (up.out.trim().split('\n').pop() || 'Schlüssel abgelaufen oder schon benutzt?').slice(0, 160));
        }
        if (!key && !state.running) {
          step('Verbinde wieder');
          await run(TS, ['up', '--hostname=' + HOSTNAME, '--unattended'], 60000);
          await refresh();
          if (!state.running) throw new Error('Das Notebook ist nicht mehr angemeldet. Bitte einen neuen Schlüssel einfügen.');
        }
        await startFunnel();
        step('Verbunden');
      } catch (e) {
        state.error = e.message; log('Fernzugang:', e.message);
      } finally {
        state.busy = false; await refresh(); broadcast();
      }
    })();
    return status();
  }

  async function remove() {
    if (!supported) throw new Error('Nur auf dem Windows-Notebook möglich');
    if (state.busy) throw new Error('Wird gerade eingerichtet');
    state.busy = true;
    try {
      if (fs.existsSync(TS)) { await run(TS, ['funnel', '--https=443', 'off'], 30000); await run(TS, ['down'], 30000); }
      state.step = 'Ausgeschaltet'; state.error = ''; state.approveUrl = ''; log('Fernzugang ausgeschaltet');
    } finally { state.busy = false; await refresh(); broadcast(); }
    return status();
  }

  refresh().catch(() => {});
  setInterval(() => { if (!state.busy) refresh().then(() => broadcast()).catch(() => {}); }, 120000);
  return { status, install, remove, refresh };
};
module.exports.parseKey = parseKey;
