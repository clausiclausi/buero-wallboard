// Wahl-Modus: Live-Stand der US-Zwischenwahlen (Midterms) 3.11.2026 und passende Nachrichten.
// Ergebnisse: Wikipedia (englisch), dort tragen Freiwillige die Ergebnisse in der Wahlnacht laufend ein.
// Frei nutzbar (CC BY-SA 4.0, Quellenangabe steht im Wahl-Feld), offizielle Programmierschnittstelle.
// Eine kostenlose, offizielle Live-Ergebnis-Schnittstelle (wie AP) gibt es nicht; die großen Anbieter sind kostenpflichtig.
// Nachrichten: öffentliche RSS-Feeds von tagesschau und Deutschlandfunk, nur Meldungen zur US-Wahl.
// Abgefragt wird nur, solange der Wahl-Modus eingeschaltet ist.
const fs = require('fs');
const path = require('path');

module.exports = function createElection({ DATA, log, getSettings, broadcast }) {
  const FILE = path.join(DATA, 'wahl.json');
  let st = { senate: null, house: null, gov: null, news: [], updated: 0, error: '' };
  try { st = Object.assign(st, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
  const persist = () => { try { fs.writeFileSync(FILE, JSON.stringify(st)); } catch {} };
  // Ehrliche Kennung, wie Wikipedia sie für automatische Abrufe verlangt (kein Browser vorgetäuscht)
  const UA = 'Buero-Wallboard/1.38 (Kiosk-Anzeige im Buero; https://github.com/clausiclausi/buero-wallboard)';
  async function get(url, type) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: type === 'json' ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === 'json' ? r.json() : r.text();
  }
  const why = e => `${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`;
  const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

  /* ---------- Wikipedia-Quelltext auswerten ---------- */
  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
  const ABBR = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v, k]));
  const party = s => /democrat/i.test(s) ? 'D' : /republican/i.test(s) ? 'R' : /independent/i.test(s) ? 'I' : 'O';
  // Fußnoten und Kommentare entfernen, damit nur der sichtbare Text bleibt
  const noRefs = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  const plain = s => clean(s.replace(/\{\{(?:Aye|Y|Yes|Check mark|Tick|Won)[^}]*\}\}/gi, '').replace(/\{\{efn[^}]*\}\}/gi, '').replace(/\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').replace(/<[^>]+>/g, ' '), 120);

  // Eine Zeile pro Rennen: Kopfzelle (Bundesstaat oder Wahlkreis) und Kandidatenliste mit „* {{Party stripe|…}}“
  function races(wikitext, kind) {
    const out = [], seen = new Set();
    for (const row of noRefs(wikitext).split(/\n\|-[^\n]*/)) {
      if (!/\{\{\s*Party stripe/i.test(row)) continue;
      const head = (row.match(/^\s*!([^\n]*)/m) || [])[1] || '';
      let abbr = "", label = "";
      if (kind === 'house') {
        const m = head.match(/\{\{\s*ushr\s*\|\s*([A-Z]{2})\s*\|\s*([^|}]+?)\s*(\|[^}]*)?\}\}/i);
        if (!m || /\|\s*X\b/i.test(m[3] || '')) continue; // frühere Nachwahlen (X) zählen nicht
        abbr = m[1].toUpperCase(); label = `${abbr}-${/^\d+$/.test(m[2]) ? m[2] : 'AL'}`;
      } else {
        const m = head.match(/\[\[([^\]|]*)\|([^\]]+)\]\]/) || head.match(/\[\[([^\]]+)\]\]/);
        const name = m ? clean((m[2] || m[1]).replace(/^2026 /, '').replace(/ (gubernatorial|Senate) .*$/, ''), 30) : '';
        if (!ABBR[name]) continue;
        abbr = ABBR[name]; label = name + (/special/i.test(m[1]) ? ' (Nachwahl)' : '');
      }
      if (seen.has(label)) continue;
      const cands = [];
      for (const line of row.split('\n')) {
        const m = line.match(/^\s*\*\s*\{\{\s*Party stripe\s*\|([^}]*)\}\}(.*)$/i);
        if (!m) continue;
        const rest = m[2], won = /\{\{\s*(Aye|Y|Yes|Check mark|Tick|Won)\b/i.test(rest);
        const txt = plain(rest), pm = txt.match(/^(.*?)\s*\(([^)]*)\)\s*([\d.,]+)\s*%/) || txt.match(/^(.*?)\s*\(([^)]*)\)/);
        if (!pm) continue;
        const pct = pm[3] ? parseFloat(pm[3].replace(',', '.')) : null;
        cands.push({ name: clean(pm[1], 50), party: party(m[1] + ' ' + pm[2]), pct: Number.isFinite(pct) ? pct : null, won });
      }
      if (!cands.length) continue;
      seen.add(label);
      cands.sort((a, b) => (b.won - a.won) || ((b.pct ?? -1) - (a.pct ?? -1)));
      const winner = cands.find(c => c.won) || null;
      const leader = winner || (cands[0].pct != null ? cands[0] : null);
      out.push({ st: abbr, label, cands: cands.slice(0, 4), winner: winner?.party || null, leader: leader?.party || null });
    }
    return out;
  }
  // Infobox: Sitze vorher, Sitze zur Wahl („1data“), Sitze danach, falls schon eingetragen
  function infobox(wikitext) {
    const box = (wikitext.match(/\{\{Infobox election[\s\S]*?\n\}\}/) || [''])[0];
    const val = k => { const m = box.match(new RegExp(`\\|[ \\t]*${k}[ \\t]*=[ \\t]*([^\\n]*)`)); return m ? m[1] : ''; };
    const num = s => { const m = String(s).replace(/\{\{[^}]*\}\}/g, '').match(/\d+/); return m ? +m[0] : null; };
    const parties = {};
    for (let i = 1; i <= 6; i++) {
      const p = val(`party${i}`); if (!p) continue;
      const k = party(p);
      parties[k] = { before: num(val(`seats_before${i}`)), up: num(val(`1data${i}`)), after: num(val(`seats_after${i}`)) ?? num(val(`seats${i}`)) };
    }
    return parties;
  }
  const count = (list, key) => list.reduce((a, r) => { if (r[key]) a[r[key]] = (a[r[key]] || 0) + 1; return a; }, {});
  async function wiki(page) {
    const r = await get(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', formatversion: '2', redirects: '1' })}`, 'json');
    if (!r?.parse?.wikitext) throw new Error('Seite leer');
    return r.parse.wikitext;
  }

  async function updateResults() {
    const errs = [];
    // Senat: 100 Sitze, 35 zur Wahl. Gesamt = nicht zur Wahl stehende Sitze + gewonnene Rennen
    try {
      const t = await wiki('2026_United_States_Senate_elections');
      const list = races(t, 'senate'), box = infobox(t), won = count(list, 'winner'), lead = count(list, 'leader'), total = {};
      for (const k of ['D', 'R', 'I']) {
        const b = box[k] || {};
        total[k] = b.after ?? ((b.before ?? 0) - (b.up ?? 0) + (won[k] || 0));
      }
      st.senate = { seats: 100, need: 51, total, won, lead, decided: list.filter(r => r.winner).length, races: list, at: Date.now() };
    } catch (e) { errs.push('Senat: ' + why(e)); }
    // Repräsentantenhaus: alle 435 Sitze zur Wahl
    try {
      const t = await wiki('2026_United_States_House_of_Representatives_elections');
      const list = races(t, 'house'), box = infobox(t), won = count(list, 'winner'), lead = count(list, 'leader'), total = {};
      for (const k of ['D', 'R', 'I']) total[k] = box[k]?.after ?? (won[k] || 0);
      // Pro Bundesstaat: gewonnene Wahlkreise je Partei
      const states = {};
      for (const r of list) { const s = states[r.st] ||= { D: 0, R: 0, O: 0, n: 0 }; s.n++; if (r.winner) s[r.winner === 'I' ? 'O' : r.winner]++; }
      st.house = { seats: 435, need: 218, total, won, lead, decided: list.filter(r => r.winner).length, count: list.length, states, close: list.filter(r => !r.winner && r.cands.some(c => c.pct != null)).slice(0, 40), at: Date.now() };
    } catch (e) { errs.push('Repräsentantenhaus: ' + why(e)); }
    // Gouverneure: 36 Bundesstaaten
    try {
      const t = await wiki('2026_United_States_gubernatorial_elections');
      const list = races(t, 'gov');
      st.gov = { won: count(list, 'winner'), lead: count(list, 'leader'), decided: list.filter(r => r.winner).length, races: list, at: Date.now() };
    } catch (e) { errs.push('Gouverneure: ' + why(e)); }
    st.error = errs.join(' · ');
    if (errs.length) log('Wahl-Ergebnisse:', st.error);
  }

  /* ---------- Wahl-Nachrichten ---------- */
  const FEEDS = [
    { src: 'tagesschau', url: 'https://www.tagesschau.de/ausland/amerika/index~rss2.xml', host: 'tagesschau.de' },
    { src: 'tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml', host: 'tagesschau.de' },
    { src: 'dlf', url: 'https://www.deutschlandfunk.de/nachrichten-100.rss', host: 'deutschlandfunk.de' },
  ];
  const WAHL = /midterm|zwischenwahl|kongresswahl|us-wahl|wahl in den usa|wahlen in den usa|us-kongress|repräsentantenhaus|senat\b|senats|gouverneur|wahllokal|wahlnacht|hochrechnung|demokraten|republikaner|trump/i;
  const unxml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  async function updateNews() {
    const all = [], seen = new Set();
    for (const f of FEEDS) {
      try {
        const xml = await get(f.url, 'text');
        for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
          const tag = t => unxml((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
          const title = clean(tag('title'), 160), link = clean(tag('link'), 300), date = new Date(tag('pubDate')).getTime() || 0;
          const host = (/^https:\/\/(?:[a-z0-9-]+\.)*([a-z0-9-]+\.[a-z]+)\//i.exec(link) || [])[1];
          if (!title || host !== f.host || /\/(video|multimedia|livestream)/i.test(link) || Date.now() - date > 48 * 3600000) continue;
          if (!WAHL.test(title + ' ' + clean(tag('description'), 400))) continue;
          const key = title.toLowerCase().replace(/\W+/g, '');
          if (seen.has(key) || seen.has(link)) continue;
          seen.add(key); seen.add(link);
          all.push({ title, link, date, src: f.src });
        }
      } catch (e) { log('Wahl-Nachrichten', f.url, why(e)); }
    }
    if (all.length) st.news = all.sort((a, b) => b.date - a.date).slice(0, 25);
  }

  let busy = false, timer = 0, last = 0;
  async function update() {
    if (busy) return; busy = true;
    try { await Promise.all([updateResults(), updateNews()]); st.updated = Date.now(); persist(); broadcast(); }
    catch (e) { log('Wahl:', why(e)); }
    finally { busy = false; last = Date.now(); }
  }
  // Alle 2 Minuten, solange der Wahl-Modus an ist (schont Wikipedia, reicht für die Wahlnacht)
  function tick() { if (getSettings().election && Date.now() - last > 120000) update(); }
  return {
    start() { clearInterval(timer); timer = setInterval(tick, 15000); tick(); },
    refresh() { last = 0; tick(); },
    view: () => getSettings().election ? st : null,
    _races: races, _infobox: infobox,
  };
};
