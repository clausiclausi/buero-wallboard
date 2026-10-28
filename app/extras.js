// Öffentliche Zusatzinfos fürs Board: Abfahrten, Schulferien, Pollen/UV, BSI-Warnungen.
// Alles kommt aus öffentlichen Quellen, niemand gibt Daten ein. Letzter Stand liegt in data/extras.json,
// damit das Board auch ohne Internet etwas zeigt.
const fs = require('fs');
const path = require('path');

module.exports = function createExtras({ DATA, config, log, getSettings, broadcast, localDate }) {
  const FILE = path.join(DATA, 'extras.json');
  const TRANSIT = (config.transitUrl || 'https://v6.db.transport.rest').replace(/\/$/, '');
  let st = { transit: null, school: null, health: null, bsi: null };
  try { st = Object.assign(st, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
  const persist = () => { try { fs.writeFileSync(FILE, JSON.stringify(st)); } catch {} };

  async function get(url, type = 'json') {
    const r = await fetch(url, { headers: { 'User-Agent': 'Buero-Wallboard/1.0', Accept: type === 'json' ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status}`);
    return type === 'json' ? r.json() : r.text();
  }
  const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

  /* ---------- Abfahrten ----------
     Zuerst direkt die Fahrplanauskunft von bahn.de (enthält Üstra-Stadtbahn und Bus in Hannover),
     wenn die nicht antwortet, der freie Spiegel db.transport.rest. */
  const DBWEB = (config.dbwebUrl || 'https://int.bahn.de/web/api/reiseloesung').replace(/\/$/, '');
  const DEFAULT_STOP = config.transitDefault || 'Clausewitzstraße, Hannover';
  const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', Accept: 'application/json', 'Accept-Language': 'de' };
  async function getWeb(url) {
    const r = await fetch(url, { headers: BROWSER, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }
  const PRODUCT = { nationalExpress: 'zug', national: 'zug', regionalExpress: 'zug', regional: 'zug', suburban: 'sbahn', subway: 'stadtbahn', tram: 'stadtbahn', bus: 'bus', ferry: 'bus', taxi: 'bus',
    ICE: 'zug', EC_IC: 'zug', IR: 'zug', REGIONAL: 'zug', SBAHN: 'sbahn', UBAHN: 'stadtbahn', TRAM: 'stadtbahn', BUS: 'bus', SCHIFF: 'bus', ANRUFPFLICHTIG: 'bus' };
  const VM = ['ICE', 'EC_IC', 'IR', 'REGIONAL', 'SBAHN', 'BUS', 'SCHIFF', 'UBAHN', 'TRAM', 'ANRUFPFLICHTIG'].map(v => `&verkehrsmittel[]=${v}`).join('');
  // Haltestellen von bahn.de: { extId, name, type: 'ST' }; von transport.rest: { id, name, type: 'stop' }
  const stopList = list => (Array.isArray(list) ? list : []).map(s => s && (s.type === 'ST' || s.type === 'stop' || s.type === 'station')
      ? { id: clean(String(s.extId || s.id || '').replace(/^0+/, ''), 20), name: clean(s.name, 60), dist: s.distance ?? s.dist ?? null } : null)
    .filter(s => s && /^[A-Za-z0-9:_.-]{1,20}$/.test(s.id)).slice(0, 8);
  async function both(web, rest) {
    try { const l = stopList(await web()); if (l.length) return l; } catch (e) { log('bahn.de Haltestellen:', e.message); }
    return stopList(await rest());
  }
  const nearby = () => both(
    () => getWeb(`${DBWEB}/orte/nearby?lat=${config.lat}&long=${config.lon}&radius=1500&maxNo=8`),
    () => get(`${TRANSIT}/locations/nearby?latitude=${config.lat}&longitude=${config.lon}&results=8&distance=1500`));
  async function search(q) {
    q = clean(q, 60);
    const one = t => both(
      () => getWeb(`${DBWEB}/orte?suchbegriff=${encodeURIComponent(t)}&typ=HALTESTELLEN&limit=8`),
      () => get(`${TRANSIT}/locations?query=${encodeURIComponent(t)}&results=8&addresses=false&poi=false`));
    let list = await one(q);
    // „Clausewitzstraße“ allein findet sonst Haltestellen in ganz Deutschland
    if (!/hannover/i.test(q)) {
      const local = await one(`${q} Hannover`).catch(() => []);
      list = [...local, ...list.filter(s => !local.some(l => l.id === s.id))].slice(0, 8);
    }
    return list;
  }
  const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  async function departures(id) {
    try {
      const now = new Date(), [datum, zeit] = localIso(now).split('T');
      const r = await getWeb(`${DBWEB}/abfahrten?ortExtId=${encodeURIComponent(id)}&datum=${datum}&zeit=${zeit.slice(0, 5)}${VM}`);
      const list = (r.entries || []).map(d => {
        const vm = d.verkehrmittel || d.verkehrsmittel || {}, plan = new Date(d.zeit), real = d.ezZeit ? new Date(d.ezZeit) : plan;
        const line = vm.linienNummer && /^(BUS|TRAM|UBAHN)$/.test(vm.produktGattung) ? vm.linienNummer : vm.mittelText || vm.name;
        return { line: clean(line, 12), kind: PRODUCT[vm.produktGattung] || 'bus', dir: clean(d.terminus, 40), when: real.toISOString(),
          delay: Math.round((real - plan) / 60000), cancelled: (d.meldungen || []).some(m => /fällt aus|entfällt/i.test(m.text || '')), platform: clean(d.ezGleis || d.gleis, 6) };
      });
      if (r.entries) return list;
    } catch (e) { log('bahn.de Abfahrten:', e.message); }
    const r = await get(`${TRANSIT}/stops/${encodeURIComponent(id)}/departures?duration=90&results=14&remarks=false&linesOfStops=false`);
    return (Array.isArray(r) ? r : r.departures || []).filter(d => d && (d.when || d.plannedWhen)).map(d => ({
      line: clean(d.line?.name, 12), kind: PRODUCT[d.line?.product] || 'bus', dir: clean(d.direction, 40),
      when: d.when || d.plannedWhen, delay: Math.round((d.delay || 0) / 60), cancelled: !!d.cancelled,
      platform: clean(d.platform || d.plannedPlatform, 6),
    }));
  }
  let autoStop = null;
  async function updateTransit() {
    let stop = getSettings().transit;
    try {
      if (!stop || !stop.id) {
        // Standard: Clausewitzstraße, sonst die nächste Haltestelle am Büro
        if (!autoStop) autoStop = (await search(DEFAULT_STOP).catch(() => [])).find(s => /clausewitz/i.test(s.name)) || (await nearby())[0] || null;
        stop = autoStop;
      }
      if (!stop) throw new Error('Keine Haltestelle gefunden');
      const deps = (await departures(stop.id)).filter(d => new Date(d.when) > Date.now() - 60000)
        .sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 12);
      st.transit = { ok: true, stop: { id: stop.id, name: stop.name }, deps, updated: Date.now() };
    } catch (e) {
      log('Abfahrten nicht erreichbar:', e.message);
      st.transit = { ...(st.transit || {}), ok: false, error: 'Abfahrten gerade nicht erreichbar', stop: stop ? { id: stop.id, name: stop.name } : st.transit?.stop };
    }
    broadcast();
    updateRoute();
  }

  /* ---------- Verbindung von der Haltestelle zu einem festen Ziel (Standard: Hemmingen, Birkenkamp) ---------- */
  const DEFAULT_ROUTE = config.routeDefault || 'Birkenkamp, Hemmingen';
  const PG = ['ICE', 'EC_IC', 'IR', 'REGIONAL', 'SBAHN', 'BUS', 'SCHIFF', 'UBAHN', 'TRAM', 'ANRUFPFLICHTIG'];
  const JOURNEYS = (config.dbwebJourneys || DBWEB.replace(/reiseloesung$/, 'angebote/fahrplan'));
  const lineOf = vm => {
    const g = vm.produktGattung || '';
    const nr = vm.linienNummer && /^(BUS|TRAM|UBAHN|SBAHN)$/.test(g) ? vm.linienNummer : vm.mittelText || vm.name || vm.kurzText || '';
    return { line: clean(String(nr).replace(/^(STR|Bus|U)\s+/, ''), 10), kind: PRODUCT[g] || 'bus' };
  };
  const t = v => v ? new Date(v).getTime() : null;
  async function tripsWeb(fromId, toId) {
    const body = {
      abfahrtsHalt: `A=1@L=${fromId}@`, ankunftsHalt: `A=1@L=${toId}@`, anfrageZeitpunkt: localIso(new Date()), ankunftSuche: 'ABFAHRT',
      klasse: 'KLASSE_2', produktgattungen: PG, schnelleVerbindungen: true, sitzplatzOnly: false, bikeCarriage: false,
      reservierungsKontingenteVorhanden: false, nurDeutschlandTicketVerbindungen: false, deutschlandTicketVorhanden: false,
      reisende: [{ typ: 'ERWACHSENER', ermaessigungen: [{ art: 'KEINE_ERMAESSIGUNG', klasse: 'KLASSENLOS' }], alter: [], anzahl: 1 }],
    };
    const r = await fetch(JOURNEYS, { method: 'POST', headers: { ...BROWSER, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.verbindungen)) throw new Error('keine Verbindungen');
    return j.verbindungen.map(v => {
      const legs = (v.verbindungsAbschnitte || []).filter(a => !/^(WALK|FUSSWEG|TRANSFER)$/.test(a.verkehrsmittel?.typ || a.typ || ''));
      if (!legs.length) return null;
      const a = legs[0], z = legs[legs.length - 1];
      const notes = legs.map(l => JSON.stringify([l.risNotizen, l.priorisierteMeldungen, l.himMeldungen])).join(' ');
      return {
        dep: t(a.ezAbfahrtsZeitpunkt || a.abfahrtsZeitpunkt), depPlan: t(a.abfahrtsZeitpunkt),
        arr: t(z.ezAnkunftsZeitpunkt || z.ankunftsZeitpunkt), arrPlan: t(z.ankunftsZeitpunkt),
        legs: legs.map(l => lineOf(l.verkehrsmittel || {})),
        cancelled: legs.some(l => l.halte?.some(h => h.canceled || h.cancelled)) || /fällt aus|Halt entfällt|cancelled/i.test(notes),
        warn: /nicht erreichbar|not be reachable|brokentrip/i.test(notes),
      };
    }).filter(Boolean);
  }
  async function tripsRest(fromId, toId) {
    const r = await get(`${TRANSIT}/journeys?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}&results=5&stopovers=false&remarks=false`);
    return (r.journeys || []).map(j => {
      const legs = (j.legs || []).filter(l => !l.walking);
      if (!legs.length) return null;
      const a = legs[0], z = legs[legs.length - 1];
      return { dep: t(a.departure || a.plannedDeparture), depPlan: t(a.plannedDeparture), arr: t(z.arrival || z.plannedArrival), arrPlan: t(z.plannedArrival),
        legs: legs.map(l => ({ line: clean(String(l.line?.name || '').replace(/^(STR|Bus|U)\s+/, ''), 10), kind: PRODUCT[l.line?.product] || 'bus' })),
        cancelled: legs.some(l => l.cancelled), warn: false };
    }).filter(Boolean);
  }
  let autoRoute = null;
  async function updateRoute() {
    const s = getSettings();
    if (s.routeOn === false) { if (st.route) { st.route = null; broadcast(); } return; }
    const from = st.transit?.stop || s.transit;
    let to = s.route;
    try {
      if (!from?.id) throw new Error('Keine Haltestelle');
      if (!to || !to.id) {
        if (!autoRoute) autoRoute = (await search(DEFAULT_ROUTE)).find(x => /birkenkamp/i.test(x.name)) || null;
        to = autoRoute;
      }
      if (!to) throw new Error('Ziel nicht gefunden');
      let trips;
      try { trips = await tripsWeb(from.id, to.id); } catch (e) { log('bahn.de Verbindungen:', e.message); trips = await tripsRest(from.id, to.id); }
      trips = trips.filter(x => x.dep && x.arr && x.dep > Date.now() - 60000).sort((p, q) => p.dep - q.dep).slice(0, 5);
      st.route = { ok: true, to: { id: to.id, name: to.name }, trips, updated: Date.now() };
    } catch (e) {
      log('Verbindung nicht erreichbar:', e.message);
      st.route = { ...(st.route || {}), ok: false, error: 'Verbindung gerade nicht abrufbar', to: to ? { id: to.id, name: to.name } : st.route?.to };
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
    } catch (e) { log('Schulferien nicht erreichbar:', e.message); }
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
    } catch (e) { log('Pollenflug nicht erreichbar:', e.message); }
    try {
      const u = await get('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json');
      const c = (u.content || []).find(x => x.city === (config.uvCity || 'Hannover'));
      if (c) h.uv = { today: +c.forecast.today || 0, tomorrow: +c.forecast.tomorrow || 0 };
    } catch (e) { log('UV-Index nicht erreichbar:', e.message); }
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
    } catch (e) { log('BSI-Warnungen nicht erreichbar:', e.message); }
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

  return {
    start, nearby, search,
    refreshTransit: () => { autoStop = null; autoRoute = null; lastTransit = Date.now(); return updateTransit(); },
    view: () => ({ route: st.route, transit: st.transit, school: st.school?.list || [], health: st.health, bsi: st.bsi?.items || [] }),
  };
};
