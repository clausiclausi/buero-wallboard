// Öffentliche Zusatzinfos fürs Board: Abfahrten, Schulferien, Pollen/UV, BSI-Warnungen.
// Alles kommt aus öffentlichen Quellen, niemand gibt Daten ein. Letzter Stand liegt in data/extras.json,
// damit das Board auch ohne Internet etwas zeigt.
const fs = require('fs');
const path = require('path');

module.exports = function createExtras({ DATA, config, log, getSettings, broadcast, localDate }) {
  const FILE = path.join(DATA, 'extras.json');
  let st = { transit: null, school: null, health: null, bsi: null };
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
    const r = await efa('XML_DM_REQUEST', { mode: 'direct', type_dm: 'stop', name_dm: id, useRealtime: 1, limit: 16, depType: 'stopEvents', includeCompleteStopSeq: 0, useAllStops: 1 });
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
        .sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 12);
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
  const unxml = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#x?[0-9a-f]+;/gi, ' ');
  async function updateBsi() {
    try {
      const xml = await get('https://wid.cert-bund.de/content/public/buergercert/rss', 'text');
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
        const tag = t => unxml((m[1].match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
        return { title: clean(tag('title'), 110), date: new Date(tag('pubDate')).getTime() || 0 };
      }).filter(i => i.title).slice(0, 6);
      if (items.length) { st.bsi = { items, updated: Date.now() }; persist(); broadcast(); }
    } catch (e) { log('BSI-Warnungen nicht erreichbar:', why(e)); }
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
    setInterval(updateSchool, 24 * 3600000);
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
    view: () => ({ route: st.route, transit: st.transit, school: st.school?.list || [], health: st.health, bsi: st.bsi?.items || [] }),
  };
};
