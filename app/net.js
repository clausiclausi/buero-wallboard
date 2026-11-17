'use strict';
// Netz-Absicherung für alle Abrufe nach draußen (Wetter, Updates, Nachrichten, Fahrplan ...).
// Klappt ein Abruf mit dem eingebauten fetch nicht („fetch failed“), versucht das Board es
// noch einmal über einen zweiten Weg, der typische Büro-Netz-Hürden umgeht:
//   1) IPv4 zuerst und mehr Zeit beim Verbindungsaufbau (langsames LTE/WLAN, kaputtes IPv6)
//   2) Proxy: aus config.json („proxy“) oder automatisch aus den Windows-Einstellungen
//   3) Firmen-Zertifikate: zusätzlich allen Stammzertifikaten von Windows vertrauen
// Klappt der zweite Weg, bleibt das Board eine Stunde dabei und prüft dann neu.
const net = require('net'), dns = require('dns'), tls = require('tls'), http = require('http'), https = require('https');
const zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { execFile } = require('child_process');

module.exports = ({ DATA, config, log }) => {
  try { dns.setDefaultResultOrder('ipv4first'); } catch {}
  try { net.setDefaultAutoSelectFamilyAttemptTimeout(2500); } catch {}

  const state = { proxy: config.proxy || '', proxySource: config.proxy ? 'config.json' : '', winCa: 0, mode: 'normal', altSince: 0, nativeError: '', altError: '' };
  let ca = null;
  const run = (cmd, args) => new Promise(res => execFile(cmd, args, { windowsHide: true, timeout: 30000, maxBuffer: 20 << 20 }, (e, out) => res(e ? '' : String(out))));
  const why = (e) => { const c = e?.cause; return String(c?.code || c?.message || (e?.name === 'TimeoutError' ? 'Zeitüberschreitung' : e?.message) || e).slice(0, 140); };

  // Windows-Stammzertifikate (auch von Firmen-Firewalls, die verschlüsselte Verbindungen prüfen)
  async function loadWinCa() {
    // Das Laufwerk Cert: gibt es erst nach Import-Module; als EncodedCommand, damit nichts an Anführungszeichen scheitert
    const ps = "Import-Module Microsoft.PowerShell.Security; Get-ChildItem Cert:\\LocalMachine\\Root, Cert:\\LocalMachine\\CA | ForEach-Object { '-----BEGIN CERTIFICATE-----'; [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks'); '-----END CERTIFICATE-----' }";
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')]);
    const pems = (out.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || []).filter(p => { try { new crypto.X509Certificate(p); return true; } catch { return false; } });
    if (pems.length) { ca = [...tls.rootCertificates, ...new Set(pems)]; state.winCa = pems.length; }
  }
  // Proxy aus Windows: WinHTTP (gilt für Dienste) oder Internetoptionen der angemeldeten Benutzer
  async function detectProxy() {
    const pick = (v) => { v = (v || '').trim(); if (!v) return ''; const m = v.match(/https=([^;\s]+)/i) || v.match(/http=([^;\s]+)/i); return m ? m[1] : v.split(/[;\s]/)[0]; };
    const wh = await run('netsh', ['winhttp', 'show', 'proxy']);
    const line = wh.split(/\r?\n/).find(l => /proxy.?server/i.test(l) && /:\d+/.test(l));
    if (line) { const p = pick(line.split(/:\s+/).slice(1).join(':')); if (p) { state.proxy = p; state.proxySource = 'Windows (WinHTTP)'; return; } }
    const users = (await run('reg', ['query', 'HKU'])).split(/\r?\n/).map(s => s.trim()).filter(s => /S-1-5-21-[\d-]+$/.test(s));
    for (const u of users) {
      const q = await run('reg', ['query', `${u}\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings`]);
      const val = (n) => (q.match(new RegExp(`^\\s*${n}\\s+REG_\\w+\\s+(.*)$`, 'mi')) || [])[1]?.trim();
      if (val('ProxyEnable') === '0x1' && pick(val('ProxyServer'))) { state.proxy = pick(val('ProxyServer')); state.proxySource = 'Windows (Internetoptionen)'; return; }
      const pac = val('AutoConfigURL');
      if (pac) {
        try {
          const txt = await (await altFetch(pac, { noProxy: true })).text();
          const m = txt.match(/PROXY\s+([\w.-]+:\d+)/i);
          if (m) { state.proxy = m[1]; state.proxySource = 'Windows (PAC-Datei)'; return; }
        } catch {}
      }
    }
  }
  const ready = process.platform === 'win32'
    ? Promise.all([loadWinCa(), state.proxy ? null : detectProxy()]).catch(() => {}).then(() => {
      if (state.proxy || state.winCa) log(`Netz: Proxy ${state.proxy || 'keiner'}${state.proxySource ? ` (${state.proxySource})` : ''}, ${state.winCa} Windows-Zertifikate`);
    })
    : Promise.resolve();

  // Zweiter Weg: eigener Abruf über http/https, mit Proxy (CONNECT), IPv4 und Windows-Zertifikaten
  function altFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url), secure = u.protocol === 'https:', port = +u.port || (secure ? 443 : 80);
      const headers = { 'accept-encoding': 'gzip, deflate', ...Object.fromEntries(new Headers(opts.headers || {})) };
      const body = opts.body == null ? null : Buffer.from(typeof opts.body === 'string' || Buffer.isBuffer(opts.body) ? opts.body : String(opts.body));
      if (body) headers['content-length'] = body.length;
      const timer = setTimeout(() => fail(new Error('Zeitüberschreitung')), opts.ms || 25000);
      let req, done = false;
      const fail = (e) => { if (done) return; done = true; clearTimeout(timer); try { req?.destroy(); } catch {} reject(e); };
      const go = (socket) => {
        const o = { host: u.hostname, port, path: u.pathname + u.search, method: opts.method || 'GET', headers, agent: false, family: 4, servername: u.hostname };
        if (ca) o.ca = ca;
        if (socket) o.createConnection = () => (secure ? tls.connect({ socket, servername: u.hostname, ca: ca || undefined }) : socket);
        req = (secure ? https : http).request(o, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && (opts.hops || 0) < 5) {
            res.resume(); done = true; clearTimeout(timer);
            return resolve(altFetch(new URL(res.headers.location, u).href, { ...opts, hops: (opts.hops || 0) + 1, method: res.statusCode === 303 ? 'GET' : opts.method, body: res.statusCode === 303 ? null : opts.body }));
          }
          const enc = res.headers['content-encoding'];
          const s = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
          const chunks = [];
          s.on('data', c => chunks.push(c)); s.on('error', fail);
          s.on('end', () => {
            if (done) return; done = true; clearTimeout(timer);
            const h = Object.entries(res.headers).filter(([k, v]) => typeof v === 'string' && !['content-encoding', 'content-length', 'transfer-encoding'].includes(k));
            const nobody = [101, 204, 205, 304].includes(res.statusCode);
            resolve(new Response(nobody ? null : Buffer.concat(chunks), { status: res.statusCode, statusText: res.statusMessage || '', headers: h }));
          });
        });
        req.on('error', fail);
        if (body) req.write(body);
        req.end();
      };
      if (state.proxy && !opts.noProxy) {
        const p = new URL(/:\/\//.test(state.proxy) ? state.proxy : `http://${state.proxy}`);
        const auth = p.username ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(p.username)}:${decodeURIComponent(p.password)}`).toString('base64') } : {};
        const c = http.request({ host: p.hostname, port: +p.port || 8080, method: 'CONNECT', path: `${u.hostname}:${port}`, headers: { host: `${u.hostname}:${port}`, ...auth }, agent: false, family: 4 });
        c.on('connect', (res, socket) => { socket.on('error', fail); if (res.statusCode !== 200) { socket.destroy(); return fail(new Error(`Proxy antwortet ${res.statusCode}`)); } go(socket); });
        c.on('error', (e) => fail(new Error(`Proxy ${p.host} nicht erreichbar (${e.code || e.message})`)));
        c.end();
        req = c;
      } else go(null);
    });
  }

  const nativeFetch = global.fetch;
  global.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!/^https?:/i.test(url) || /^https?:\/\/(localhost|127\.)/i.test(url)) return nativeFetch(input, opts);
    const alt = async () => { await ready; return altFetch(url, { method: opts.method, headers: opts.headers, body: opts.body, ms: 25000 }); };
    if (state.mode === 'alt' && Date.now() - state.altSince < 3600000) return alt();
    try { return await nativeFetch(input, opts); }
    catch (e) {
      state.nativeError = why(e);
      try {
        const r = await alt();
        if (state.mode !== 'alt') log(`Netz: normaler Abruf scheitert (${state.nativeError}), zweiter Weg klappt, nutze ihn ab jetzt`);
        state.mode = 'alt'; state.altSince = Date.now(); state.altError = '';
        return r;
      } catch (e2) { state.altError = why(e2); throw e; }
    }
  };

  // Für den Verbindungstest: beide Wege einzeln gegen GitHub prüfen
  async function diagnose() {
    await ready;
    const target = 'https://raw.githubusercontent.com/clausiclausi/buero-wallboard/main/app/version.json';
    const out = [];
    let t0 = Date.now();
    try { const r = await nativeFetch(target, { signal: AbortSignal.timeout(15000) }); out.push({ name: 'Netz: normaler Weg', ok: r.ok, detail: `HTTP ${r.status}`, ms: Date.now() - t0 }); }
    catch (e) { out.push({ name: 'Netz: normaler Weg', ok: false, detail: why(e), ms: Date.now() - t0 }); }
    t0 = Date.now();
    try { const r = await altFetch(target, { ms: 20000 }); out.push({ name: 'Netz: zweiter Weg', ok: r.ok, detail: `HTTP ${r.status}`, ms: Date.now() - t0 }); }
    catch (e) { out.push({ name: 'Netz: zweiter Weg', ok: false, detail: why(e), ms: Date.now() - t0 }); }
    out.push({ name: 'Netz: Einstellungen', ok: true, detail: `Proxy: ${state.proxy || 'keiner'}${state.proxySource ? ` (${state.proxySource})` : ''} · Windows-Zertifikate: ${state.winCa} · Uhrzeit: ${new Date().toLocaleString('de-DE')}`, ms: 0 });
    return out;
  }

  return { state, ready, altFetch, diagnose };
};
