// Öffentliche Zusatzinfos fürs Board: Abfahrten, Schulferien, Pollen/UV, BSI-Warnungen.
// Alles kommt aus öffentlichen Quellen, niemand gibt Daten ein. Letzter Stand liegt in data/extras.json,
// damit das Board auch ohne Internet etwas zeigt.
const fs = require('fs');
const path = require('path');

module.exports = function createExtras({ DATA, config, log, getSettings, broadcast, localDate }) {
  const FILE = path.join(DATA, 'extras.json');
  let st = { transit: null, school: null, health: null, bsi: null, air: null, lineInfo: null, waste: null };
  try { st = Object.assign(st, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
  const persist = () => { try { fs.writeFileSync(FILE, JSON.stringify(st)); } catch {} };

  async function get(url, type = 'json') {
    const r = await fetch(url, { headers: { 'User-Agent': 'Buero-Wallboard/1.0', Accept: type === 'json' ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === 'json' ? r.json() : r.text();
  }
  // Fehlertext mit Ursache (z. B. ENOTFOUND, ECONNRESET, Zertifikat), damit man am Board sieht, woran es liegt
  const why = e => `${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`;
  const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

  /* ---------- Abfahrten und feste Verbindung ----------
     Öffentliche Fahrplanauskunft efa.de (DELFI, bundesweite Daten mit Echtzeit, enthält Üstra-Stadtbahn und Busse).
     Ersatz, falls die nicht antwortet: die offene Auskunft des VRR mit denselben Daten (ohne Echtzeit für Hannover).
     Beide live getestet am 28.10.2026. Quellenangabe steht in der Kachel. */
  const BASES = [config.efaUrl || 'https://www.efa.de/efa', config.efaFallback || 'https://efa.vrr.de/standard'].map(b => b.replace(/\/$/, ''));
  const DEFAULT_STOP = { id: 'de:03241:2841', name: 'Hannover, Clausewitzstraße' };
  const DEFAULT_ROUTE = config.routeDefault || 'Hemmingen Birkenkamp';
  const ID = /^[^\u0000-\u001f<>]{1,200}$/;
  // alt: andere Parameter für die Ersatzquelle (Straßen haben dort eine andere Kennung, dann zählt der Name)
  async function efa(req, params, alt) {
    let err;
    for (let i = 0; i < BASES.length; i++) {
      try {
        const q = new URLSearchParams({ outputFormat: 'rapidJSON', coordOutputFormat: 'WGS84[dd.ddddd]', ...params, ...(i && alt ? alt : {}) });
        return await get(`${BASES[i]}/${req}?${q}`);
      } catch (e) { err = e; log(`Fahrplan ${BASES[i]}:`, why(e)); }
    }
    throw err;
  }
  // EFA-Verkehrsmittelklassen: 0 Zug, 1 S-Bahn, 2 U-Bahn, 3 Stadtbahn, 4 Straßenbahn, 5–7 Bus, 9 Schiff, 10 Rufbus, 13–16 Regional-/Fernzug, ab 99 Fußweg
  const KIND = c => [1].includes(c) ? 'sbahn' : [2, 3, 4].includes(c) ? 'stadtbahn' : [0, 13, 14, 15, 16].includes(c) ? 'zug' : 'bus';
  const lineOf = tr => ({ line: clean(tr?.disassembledName || tr?.number || tr?.name || '', 10).replace(/^(STR|Bus|U)\s+/i, ''), kind: KIND(tr?.product?.class) });
  const t = v => v ? new Date(v).getTime() : null;
  // Anzeigename fürs Board: bei Straßen nur der Ort (keine Adresse am Board), bei Haltestellen der Name
  const label = l => l.type === 'street' ? clean(String(l.name).split(',')[0].replace(/\s*\(.*?\)/, ''), 40) : clean(l.name, 60);

  // ziel=true: auch Straßen finden (für die feste Verbindung), sonst nur Haltestellen
  async function search(q, ziel = false) {
    q = clean(q, 60);
    const one = async term => {
      const r = await efa('XML_STOPFINDER_REQUEST', { type_sf: 'any', name_sf: term, anyObjFilter_sf: ziel ? 6 : 2, anyMaxSizeHitList: 10 });
      return (r.locations || []).filter(l => (l.type === 'stop' || (ziel && l.type === 'street')) && ID.test(l.id || ''))
        .slice(0, 8).map(l => ({ id: l.id, name: clean(l.name, 60), type: l.type, label: label(l), dist: null }));
    };
    let list = await one(q);
    // „Clausewitzstraße“ allein findet sonst Haltestellen in ganz Deutschland
    if (!/hannover|hemmingen|laatzen|langenhagen|garbsen|seelze|ronnenberg/i.test(q)) {
      const local = await one(`Hannover ${q}`).catch(() => []);
      list = [...local, ...list.filter(s => !local.some(l => l.id === s.id))].slice(0, 8);
    }
    return list;
  }
  async function nearby() {
    try {
      const r = await efa('XML_COORD_REQUEST', { coord: `${config.lon}:${config.lat}:WGS84[dd.ddddd]`, inclFilter: 1, type_1: 'STOP', radius_1: 1000, max: 8 });
      const l = (r.locations || []).filter(x => ID.test(x.id || '')).map(x => ({ id: x.id, name: clean(x.name, 60), dist: x.properties?.distance ?? null }));
      if (l.length) return l.sort((a, b) => (a.dist ?? 9e9) - (b.dist ?? 9e9)).slice(0, 8);
    } catch (e) { log('Fahrplan Umkreis:', why(e)); }
    return [DEFAULT_STOP];
  }
  async function departures(id) {
    const r = await efa('XML_DM_REQUEST', { mode: 'direct', type_dm: 'stop', name_dm: id, useRealtime: 1, limit: 30, depType: 'stopEvents', includeCompleteStopSeq: 0, useAllStops: 1 });
    if (!Array.isArray(r.stopEvents)) throw new Error('Antwort ohne Abfahrten');
    return r.stopEvents.map(e => {
      const plan = t(e.departureTimePlanned), real = t(e.departureTimeEstimated) || plan;
      return { ...lineOf(e.transportation), dir: clean(e.transportation?.destination?.name, 40).replace(/^Hannover\//, ''), when: new Date(real).toISOString(),
        delay: Math.round((real - plan) / 60000), live: !!e.departureTimeEstimated, cancelled: (e.realtimeStatus || []).includes('CANCELLED') || e.isCancelled === true,
        platform: clean(e.location?.properties?.platform, 6) };
    }).filter(d => d.when);
  }
  let autoStop = null;
  async function updateTransit() {
    let stop = getSettings().transit;
    try {
      if (!stop || !stop.id) stop = autoStop || DEFAULT_STOP;
      const deps = (await departures(stop.id)).filter(d => new Date(d.when) > Date.now() - 60000)
        .sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 24);
      st.transit = { ok: true, stop: { id: stop.id, name: stop.name }, deps, updated: Date.now() };
    } catch (e) {
      log('Abfahrten nicht erreichbar:', why(e));
      st.transit = { ...(st.transit || {}), ok: false, error: 'Abfahrten gerade nicht erreichbar', why: clean(why(e), 200), stop: stop ? { id: stop.id, name: stop.name } : st.transit?.stop };
    }
    broadcast();
    updateRoute();
  }

  /* ---------- Verbindung von der Haltestelle zu einem festen Ziel (Standard: Hemmingen, Birkenkamp) ---------- */
  async function trips(fromId, to) {
    const r = await efa('XML_TRIP_REQUEST2', { type_origin: 'any', name_origin: fromId, type_destination: 'any', name_destination: to.id, useRealtime: 1, calcNumberOfTrips: 6, itdTripDateTimeDepArr: 'dep' },
      { name_destination: to.name });
    if (!Array.isArray(r.journeys)) throw new Error('Antwort ohne Verbindungen');
    return r.journeys.map(j => {
      const all = j.legs || [], legs = all.filter(l => { const c = l.transportation?.product?.class; return c != null && c < 90; });
      if (!legs.length) return null;
      const a = legs[0], z = all[all.length - 1];
      return {
        dep: t(a.origin?.departureTimeEstimated || a.origin?.departureTimePlanned), depPlan: t(a.origin?.departureTimePlanned),
        // Ankunft am Ziel inklusive Fußweg am Ende, wie in der Fahrplan-App
        arr: t(z.destination?.arrivalTimeEstimated || z.destination?.arrivalTimePlanned), arrPlan: t(z.destination?.arrivalTimePlanned),
        legs: legs.map(l => lineOf(l.transportation)), live: legs.some(l => l.origin?.departureTimeEstimated),
        cancelled: legs.some(l => (l.realtimeStatus || []).includes('CANCELLED') || l.isCancelled === true),
      };
    }).filter(Boolean);
  }
  let autoRoute = null;
  async function updateRoute() {
    const s = getSettings();
    if (s.routeOn === false) { if (st.route) { st.route = null; broadcast(); } return; }
    const from = st.transit?.stop || s.transit || DEFAULT_STOP;
    let to = s.route;
    try {
      if (!to || !to.id) {
        if (!autoRoute) autoRoute = (await search(DEFAULT_ROUTE, true)).find(x => /birkenkamp/i.test(x.name)) || null;
        to = autoRoute;
      }
      if (!to) throw new Error('Ziel nicht gefunden');
      const list = (await trips(from.id, to)).filter(x => x.dep && x.arr && x.dep > Date.now() - 60000).sort((p, q) => p.dep - q.dep).slice(0, 5);
      st.route = { ok: true, to: { id: to.id, name: to.name, label: to.label || to.name }, trips: list, updated: Date.now() };
    } catch (e) {
      log('Verbindung nicht erreichbar:', why(e));
      st.route = { ...(st.route || {}), ok: false, error: 'Verbindung gerade nicht abrufbar', why: clean(why(e), 200), to: to ? { id: to.id, name: to.name, label: to.label || to.name } : st.route?.to };
    }
    broadcast();
  }

  /* ---------- Schulferien Niedersachsen (OpenHolidays) ---------- */
  async function updateSchool() {
    try {
      const y = new Date().getFullYear();
      const r = await get(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-NI&languageIsoCode=DE&validFrom=${y - 1}-12-01&validTo=${y + 1}-12-31`);
      const list = (Array.isArray(r) ? r : []).map(h => ({
        from: String(h.startDate).slice(0, 10), to: String(h.endDate).slice(0, 10),
        name: clean((h.name || []).find(n => n.language === 'DE')?.text || h.name?.[0]?.text || 'Schulferien', 40),
      })).filter(h => /^\d{4}-\d\d-\d\d$/.test(h.from) && /^\d{4}-\d\d-\d\d$/.test(h.to));
      if (list.length) { st.school = { list, updated: Date.now() }; persist(); broadcast(); }
    } catch (e) { log('Schulferien nicht erreichbar:', why(e)); }
  }

  /* ---------- Pollenflug und UV-Index vom DWD ---------- */
  const POLLEN = { Hasel: 'Hasel', Erle: 'Erle', Esche: 'Esche', Birke: 'Birke', Graeser: 'Gräser', Roggen: 'Roggen', Beifuss: 'Beifuß', Ambrosia: 'Ambrosia' };
  const LEVEL = { '0': 0, '0-1': .5, '1': 1, '1-2': 1.5, '2': 2, '2-3': 2.5, '3': 3 };
  async function updateHealth() {
    const h = { updated: Date.now() };
    try {
      const p = await get('https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json');
      const reg = (p.content || []).find(c => c.partregion_id === (config.pollenRegion || 32)) || (p.content || []).find(c => c.region_id === 30);
      if (reg) h.pollen = Object.entries(reg.Pollen || {}).map(([k, v]) => ({ name: POLLEN[k] || clean(k, 12), today: LEVEL[v.today] ?? 0, tomorrow: LEVEL[v.tomorrow] ?? 0 }))
        .sort((a, b) => b.today - a.today);
    } catch (e) { log('Pollenflug nicht erreichbar:', why(e)); }
    try {
      const u = await get('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json');
      const c = (u.content || []).find(x => x.city === (config.uvCity || 'Hannover'));
      if (c) h.uv = { today: +c.forecast.today || 0, tomorrow: +c.forecast.tomorrow || 0 };
    } catch (e) { log('UV-Index nicht erreichbar:', why(e)); }
    if (h.pollen || h.uv) { st.health = { ...(st.health || {}), ...h }; persist(); broadcast(); }
  }

  /* ---------- Warnungen des BSI für Verbraucher (Bürger-CERT) ---------- */
  const unxml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&[a-z]+;/gi, ' ');
  async function updateBsi() {
    try {
      const xml = await get('https://wid.cert-bund.de/content/public/buergercert/rss', 'text');
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
        const tag = t => unxml((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
        // Link nur, wenn er wirklich zum BSI führt (für den QR-Code am Board)
        const link = clean(tag('link'), 300);
        return { title: clean(tag('title'), 110), date: new Date(tag('pubDate')).getTime() || 0,
          link: /^https:\/\/([a-z0-9-]+\.)*(cert-bund\.de|bsi\.bund\.de)\/[^\s"'<>]*$/i.test(link) ? link : '' };
      }).filter(i => i.title).slice(0, 6);
      if (items.length) { st.bsi = { items, updated: Date.now() }; persist(); broadcast(); }
    } catch (e) { log('BSI-Warnungen nicht erreichbar:', why(e)); }
  }

  /* ---------- Nachrichten: Schlagzeilen aus offenen RSS-Feeds, nur Titel, Quelle, Zeit und Link ---------- */
  const NEWS = {
    tagesschau: { name: 'tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml', host: 'tagesschau.de' },
    dlf: { name: 'Deutschlandfunk', url: 'https://www.deutschlandfunk.de/nachrichten-100.rss', host: 'deutschlandfunk.de' },
    ntv: { name: 'n-tv', url: 'https://www.n-tv.de/rss', host: 'n-tv.de' },
    zdf: { name: 'ZDFheute', url: 'https://www.zdf.de/rss/zdf/nachrichten', host: 'zdfheute.de' },
    welt: { name: 'WELT', url: 'https://www.welt.de/feeds/latest.rss', host: 'welt.de' },
  };
  // Thema einer Meldung: aus Link-Pfad, Feed-Kategorie oder Stichworten im Titel. Ohne Treffer „allgemein“ (immer sichtbar).
  const FUSSBALL = /fu(ß|ss)ball|bundesliga|\bdfb\b|dfb-pokal|\bfifa\b|\buefa\b|champions.league|europa.league|elfmeter|ballon d.or|torjäger|hertha|schalke|hannover 96|\bhsv\b/i;
  const SPORT = /\bsport|formel.1|tennis|handball|basketball|biathlon|olympi|\bnfl\b|\bnba\b|eishockey|skispringen|leichtathletik|radsport|boxen\b/i;
  function topic(link, title, cat) {
    let p = ''; try { p = new URL(link).pathname.toLowerCase(); } catch {}
    if (/\/fussball\b/.test(p) || FUSSBALL.test(`${cat} ${title}`)) return 'fussball';
    if (/^\/sport\b/.test(p) || SPORT.test(`${cat} ${title.split(' - ')[0]}`)) return 'sport';
    if (/^\/(wirtschaft|finanzen|geld|boerse)\b/.test(p) || /^wirtschaft/i.test(cat) || /^(wirtschaft|konjunktur|börse|finanzen)\b/i.test(title)) return 'wirtschaft';
    if (/^\/(inland|ausland|politik)\b/.test(p) || /^politik/i.test(cat)) return 'politik';
    if (/^\/(panorama|vermischtes|leute|unterhaltung|promis)\b/.test(p) || /^(panorama|unterhaltung|leute)/i.test(cat)) return 'panorama';
    if (/^\/(wissen|wissenschaft|technik|digital|gesundheit|klima)\b/.test(p) || /^(wissen|technik|digital)/i.test(cat) || /^(astronomie|forschung|wissenschaft|medizin|technik|raumfahrt|klima)\b/i.test(title)) return 'wissen';
    if (/^\/(kultur|ratgeber|reise|auto|geschichte|debatte|lifestyle|kino|musik)\b/.test(p) || /^(kultur|ratgeber|reise|auto)/i.test(cat)) return 'kultur';
    return 'allgemein';
  }

  // Gleiche Meldung bei mehreren Sendern: Titel mit überwiegend denselben Wörtern gelten als doppelt
  const STOP = new Set('aber alle also auch beim bereits bisher dass dem den der des die dies diese dieser durch eine einem einen einer eines gegen haben hatte heute immer jetzt kann kein keine mehr nach nicht noch nur oder schon sein seine sich sind soll über unter vom von vor war wegen weil wenn werden wieder will wird wurde zum zur zwei drei neue neuen neuer januar februar märz april juni juli august september oktober november dezember montag dienstag mittwoch donnerstag freitag samstag sonntag woche jahr jahres prozent bericht deutschland deutsche deutschen berlin würde könnte sollen müssen'.split(' '));
  const words = t => new Set(t.toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').split(' ').filter(w => w.length > 3 && !STOP.has(w)));
  // Wörter gelten als gleich bei gleichem Anfang (Eralp/Eralps, Ukraine/ukrainische, Gipfel/Gipfeltreffen)
  const wordMatch = (x, y) => x === y || Math.min(x.length, y.length) >= 5 && (x.startsWith(y) || y.startsWith(x)) || x.length >= 6 && y.length >= 6 && x.slice(0, 6) === y.slice(0, 6);
  // Mit echten Schlagzeilen vom 30.10.2026 abgestimmt: 7 doppelte von 52 erkannt, keine falschen
  const sameStory = (a, b) => { let n = 0; for (const w of a) if ([...b].some(v => wordMatch(w, v))) n++; return n >= 2 && n / Math.min(a.size, b.size) >= .25; };

  async function updateNews() {
    const want = (getSettings().newsSources || ['tagesschau', 'dlf', 'ntv']).filter(k => NEWS[k]);
    const all = [], seen = new Set();
    for (const k of want) {
      try {
        const xml = await get(NEWS[k].url, 'text');
        const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].map(m => {
          const tag = t => unxml((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
          const link = clean(tag('link'), 300), host = (/^https:\/\/(?:[a-z0-9-]+\.)*([a-z0-9-]+\.[a-z]+)\//i.exec(link) || [])[1];
          const title = clean(tag('title'), 160);
          return { title, date: new Date(tag('pubDate')).getTime() || 0, link: host === NEWS[k].host ? link : '', src: k, topic: topic(link, title, clean(tag('category'), 60)) };
        })
          // nur echte Meldungen mit Link: keine Videos, Livestreams, Bezahlartikel, Hinweise des Senders oder alten Meldungen
          .filter(i => i.title && i.link && !/\/(video|multimedia|livestream|plus)/i.test(i.link) && !/^(livestream|video|liveblog|schlagzeilen|aktuelle pressemitteilungen|entdecken sie|tagesschau|tagesthemen|tagesschau24|nachtmagazin|wetter deutschland)\b/i.test(i.title) && Date.now() - i.date < 24 * 3600000)
          .sort((a, b) => b.date - a.date).slice(0, 20);
        for (const i of items) {
          const key = i.title.toLowerCase().replace(/\W+/g, ''), w = words(i.title);
          if (seen.has(key) || seen.has(i.link) || all.some(o => sameStory(w, o.w))) continue;
          seen.add(key); seen.add(i.link); all.push(Object.assign(i, { w }));
        }
      } catch (e) { log(`Nachrichten ${NEWS[k].name} nicht erreichbar:`, why(e)); }
    }
    // Quellen abwechselnd, damit nicht eine Quelle mit gleicher Uhrzeit alles oben belegt
    const by = want.map(k => all.filter(i => i.src === k)), mixed = [];
    for (let n = 0; n < 20; n++) for (const l of by) if (l[n]) mixed.push(l[n]);
    if (all.length || !want.length) { st.news = { items: mixed.slice(0, 60).map(({ w, ...i }) => i), updated: Date.now() }; persist(); broadcast(); }
  }

  /* ---------- Störungen bei Bus und Bahn ----------
     Aktuelle Meldungen der Verkehrsunternehmen aus derselben Fahrplanauskunft (efa.de), nur Hinweise zu Linien,
     die an der eingestellten Haltestelle fahren, oder zur Haltestelle selbst. Rolltreppen und Aufzüge bleiben weg. */
  async function updateLineInfo() {
    try {
      const deps = st.transit?.deps || [], stopId = st.transit?.stop?.id || '';
      const lines = new Set(deps.map(d => d.line));
      const r = await get(`${BASES[0]}/XML_ADDINFO_REQUEST?${new URLSearchParams({ outputFormat: 'rapidJSON', filterPublicationStatus: 'current', filterOMC: '3241' })}`);
      const now = Date.now(), seen = new Set(), items = [];
      for (const x of r.infos?.current || []) {
        if (x.type === 'infrastructure') continue;
        const valid = (x.timestamps?.validity || []).some(v => (!v.from || new Date(v.from) <= now) && (!v.to || new Date(v.to) >= now));
        if (!valid) continue;
        // Nur Linien im Großraum Hannover (GVH: Üstra, regiobus), sonst passen gleiche Liniennummern aus Hameln oder Hildesheim
        const ls = [...new Set((x.affected?.lines || []).filter(l => /^gvh:/i.test(l.id || '') || /üstra|regiobus/i.test(l.operator?.name || '')).map(l => clean(l.disassembledName || l.number || '', 10)).filter(Boolean))];
        const hit = ls.filter(l => lines.has(l));
        const atStop = (x.affected?.stops || []).some(p => p.id === stopId);
        if (!hit.length && !atStop) continue;
        const text = clean(x.infoLinks?.[0]?.title || x.infoLinks?.[0]?.subtitle || '', 180);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        items.push({ text, lines: hit, kind: /blocking/i.test(x.type) ? 'sperrung' : 'hinweis' });
      }
      st.lineInfo = { items: items.slice(0, 5), updated: now }; persist(); broadcast();
    } catch (e) { log('Verkehrsmeldungen nicht erreichbar:', why(e)); }
  }

  /* ---------- Müllabfuhr (aha Region Hannover) ----------
     Wie im Abfuhrkalender auf aha-region.de: Straße wählen, Hausnummer, dann den Jahreskalender als iCal laden.
     Live getestet am 29.10.2026 mit Hans-Böckler-Allee 1. Nur Datum und Abfallart werden gespeichert. */
  const AHA = config.ahaUrl || 'https://www.aha-region.de/abholtermine/abfuhrkalender';
  async function aha(body) {
    const r = await fetch(AHA, { method: 'POST', body: new URLSearchParams(body), headers: { 'User-Agent': 'Buero-Wallboard/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }
  const norm = v => String(v).toLowerCase().replace(/straße\b/g, 'str.').replace(/strasse\b/g, 'str.').replace(/\s+/g, ' ').trim();
  async function updateWaste() {
    const set = getSettings();
    if (set.wasteOn === false) { if (st.waste) { st.waste = null; persist(); broadcast(); } return; }
    const w = set.waste || { street: 'Hans-Böckler-Allee', nr: '1', town: 'Hannover' }, nr = w.nr || '1';
    try {
      const page = await get(`${AHA}?${new URLSearchParams({ gemeinde: w.town, von: w.street.trim()[0].toUpperCase(), bis: '[' })}`, 'text');
      const opts = [...page.matchAll(/<option value='([^']+)'\s*>\s*([^<]+)/g)].map(m => ({ v: m[1], t: m[2].trim() }));
      const want = norm(w.street), street = opts.find(o => norm(o.t.split(' / ')[0]) === want) || opts.find(o => norm(o.t).startsWith(want));
      if (!street) throw new Error(`Straße „${w.street}“ nicht gefunden`);
      const base = { gemeinde: w.town, jsaus: '', strasse: street.v, hausnr: nr, hausnraddon: '', anzeigen: 'Suchen' };
      const step = await aha(base), k = step.indexOf('name="ladeort"');
      const places = [...step.slice(k, k + 4000).matchAll(/<option value="([^"]+)"\s*>\s*([^<]+)/g)].map(m => ({ v: m[1], t: m[2].trim() }));
      if (k < 0 || !places.length) throw new Error('Hausnummer nicht gefunden');
      const place = places.find(p => norm(p.t).startsWith(`${want} ${norm(nr)}`)) || places[0];
      const ics = await aha({ ...base, ladeort: place.v, ical: 'ICAL Jahresübersicht' });
      const today = localDate(0), list = [];
      for (const m of ics.matchAll(/BEGIN:VEVENT[\s\S]*?DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})[\s\S]*?SUMMARY:([^\r\n]*)[\s\S]*?END:VEVENT/g)) {
        const date = `${m[1]}-${m[2]}-${m[3]}`, kind = clean(m[4].replace(/\s*\*\s*$/, ''), 30);
        if (date >= today && kind) list.push({ date, kind, moved: /\*\s*$/.test(m[4]) });
      }
      if (!list.length) throw new Error('keine Termine im Kalender');
      st.waste = { place: clean(place.t.replace(/,.*$/, ''), 60), list: list.sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 40), updated: Date.now(), error: '' };
    } catch (e) {
      log('Müllabfuhr nicht erreichbar:', why(e));
      st.waste = { ...(st.waste || { list: [] }), error: clean(e.message, 120) };
    }
    persist(); broadcast();
  }

  /* ---------- Luftqualität (Umweltbundesamt, Messstation Hannover) ---------- */
  const AIR = ['sehr gut', 'gut', 'mäßig', 'schlecht', 'sehr schlecht'];
  const AIR_COMP = { 1: 'Feinstaub (PM10)', 3: 'Ozon', 5: 'Stickstoffdioxid', 9: 'Feinstaub (PM2,5)' };
  async function updateAir() {
    try {
      const station = config.airStation || '938';
      const d = new Date(), from = localDate(-1), to = localDate(0);
      const r = await get(`${config.airUrl || 'https://luftdaten.umweltbundesamt.de/api/air-data/v3/airquality/json'}?${new URLSearchParams({ date_from: from, time_from: 1, date_to: to, time_to: 24, station, lang: 'de' })}`);
      const rows = Object.entries(r.data?.[station] || {}).filter(([, v]) => Array.isArray(v) && Number.isInteger(v[1]) && v[1] >= 0).sort((a, b) => a[0] < b[0] ? -1 : 1);
      if (!rows.length) throw new Error('keine Messwerte');
      const [at, v] = rows[rows.length - 1];
      const worst = v.slice(3).filter(Array.isArray).sort((a, b) => b[2] - a[2])[0];
      st.air = { index: v[1], label: AIR[v[1]] || '', at: clean(at, 20), comp: worst && worst[2] >= 2 ? AIR_COMP[worst[0]] || '' : '', updated: d.getTime() };
      persist(); broadcast();
    } catch (e) { log('Luftqualität nicht erreichbar:', why(e)); }
  }

  // Abfahrten nur zu Bürozeiten jede Minute, sonst alle 15 Minuten
  function officeNow() {
    const s = getSettings(), d = new Date(), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.getDay() !== 0 && d.getDay() !== 6 && hm >= (s.officeStart || '06:00') && hm < (s.officeEnd || '20:00');
  }
  let lastTransit = 0;
  function start() {
    setTimeout(() => { updateTransit(); updateSchool(); updateHealth(); updateBsi(); }, 5000);
    setInterval(() => { if (Date.now() - lastTransit > (officeNow() ? 60000 : 900000)) { lastTransit = Date.now(); updateTransit(); } }, 15000);
    setInterval(updateHealth, 3 * 3600000);
    setInterval(updateBsi, 3600000);
    setTimeout(updateNews, 8000);
    setInterval(updateNews, 10 * 60000);
    setInterval(updateSchool, 24 * 3600000);
    setTimeout(() => { updateLineInfo(); updateAir(); updateWaste(); }, 20000);
    setInterval(updateLineInfo, 15 * 60000);
    setInterval(updateAir, 3600000);
    setInterval(updateWaste, 12 * 3600000);
  }

  // Verbindungstest für die Einstellungen: jede Quelle einmal echt abfragen und das Ergebnis zeigen
  async function diagnose() {
    const out = [];
    const step = async (name, fn) => {
      const t0 = Date.now();
      try { const detail = await fn(); out.push({ name, ok: true, detail: clean(detail, 160), ms: Date.now() - t0 }); }
      catch (e) { out.push({ name, ok: false, detail: clean(why(e), 200), ms: Date.now() - t0 }); }
    };
    const s = getSettings(), stop = s.transit?.id ? s.transit : DEFAULT_STOP;
    let dest = s.route?.id ? s.route : null;
    await step('Internet (GitHub)', async () => { const r = await fetch('https://raw.githubusercontent.com/clausiclausi/buero-wallboard/main/app/version.json', { signal: AbortSignal.timeout(15000) }); return `HTTP ${r.status}`; });
    await step('Fahrplan: Haltestellensuche', async () => {
      const l = await search('Hannover Clausewitzstraße'); if (!l.length) throw new Error('keine Haltestelle gefunden');
      return `${l.length} gefunden, z. B. ${l[0].name}`;
    });
    await step(`Fahrplan: Abfahrten ${stop.name}`, async () => {
      const l = await departures(stop.id); if (!l.length) throw new Error('keine Abfahrten');
      return `${l.length} Abfahrten, davon ${l.filter(d => d.live).length} mit Echtzeit`;
    });
    await step('Fahrplan: Verbindung zum Ziel', async () => {
      if (!dest) dest = (await search(DEFAULT_ROUTE, true)).find(x => /birkenkamp/i.test(x.name));
      if (!dest) throw new Error('Ziel nicht gefunden');
      const l = await trips(stop.id, dest); if (!l.length) throw new Error('keine Verbindung gefunden');
      return `${l.length} Verbindungen nach ${dest.label || dest.name}, z. B. ${l[0].legs.map(x => x.line).join(' › ')}`;
    });
    // Ersatzquelle einzeln prüfen, damit man sieht, ob es im Notfall weiterläuft
    await step('Ersatzquelle VRR', async () => {
      const r = await get(`${BASES[1]}/XML_STOPFINDER_REQUEST?${new URLSearchParams({ outputFormat: 'rapidJSON', type_sf: 'any', name_sf: 'Hannover Clausewitzstraße', anyObjFilter_sf: 2 })}`);
      return `${(r.locations || []).length} gefunden`;
    });
    return { at: Date.now(), results: out };
  }

  return {
    start, nearby, search, diagnose,
    refreshTransit: () => { autoStop = null; autoRoute = null; lastTransit = Date.now(); return updateTransit(); },
    refreshNews: () => updateNews(),
    refreshWaste: () => updateWaste(),
    newsSources: () => Object.fromEntries(Object.entries(NEWS).map(([k, v]) => [k, v.name])),
    view: () => ({ route: st.route, transit: st.transit, school: st.school?.list || [], health: st.health, bsi: st.bsi?.items || [], news: st.news?.items || [],
      air: st.air, lineInfo: st.lineInfo?.items || [], waste: st.waste }),
  };
};
