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

  /* ---------- Abfahrten (Deutsche Bahn, enthält auch Stadtbahn und Bus in Hannover) ---------- */
  const PRODUCT = { nationalExpress: 'zug', national: 'zug', regionalExpress: 'zug', regional: 'zug', suburban: 'sbahn', subway: 'stadtbahn', tram: 'stadtbahn', bus: 'bus', ferry: 'bus', taxi: 'bus' };
  const stopList = list => (Array.isArray(list) ? list : []).filter(s => s && (s.type === 'stop' || s.type === 'station') && s.id)
    .slice(0, 8).map(s => ({ id: clean(s.id, 20), name: clean(s.name, 60), dist: s.distance ?? null }));
  async function nearby() {
    return stopList(await get(`${TRANSIT}/locations/nearby?latitude=${config.lat}&longitude=${config.lon}&results=8&distance=1500`));
  }
  async function search(q) {
    return stopList(await get(`${TRANSIT}/locations?query=${encodeURIComponent(clean(q, 60))}&results=8&addresses=false&poi=false`));
  }
  let autoStop = null;
  async function updateTransit() {
    let stop = getSettings().transit;
    try {
      if (!stop || !stop.id) {
        if (!autoStop) autoStop = (await nearby())[0] || null;
        stop = autoStop;
      }
      if (!stop) throw new Error('Keine Haltestelle in der Nähe gefunden');
      const r = await get(`${TRANSIT}/stops/${encodeURIComponent(stop.id)}/departures?duration=90&results=14&remarks=false&linesOfStops=false`);
      const list = Array.isArray(r) ? r : r.departures || [];
      const deps = list.filter(d => d && (d.when || d.plannedWhen)).map(d => ({
        line: clean(d.line?.name, 12), kind: PRODUCT[d.line?.product] || 'bus', dir: clean(d.direction, 40),
        when: d.when || d.plannedWhen, delay: Math.round((d.delay || 0) / 60), cancelled: !!d.cancelled,
        platform: clean(d.platform || d.plannedPlatform, 6),
      })).sort((a, b) => new Date(a.when) - new Date(b.when)).slice(0, 12);
      st.transit = { ok: true, stop: { id: stop.id, name: stop.name }, deps, updated: Date.now() };
    } catch (e) {
      log('Abfahrten nicht erreichbar:', e.message);
      st.transit = { ...(st.transit || {}), ok: false, error: 'Abfahrten gerade nicht erreichbar', stop: stop ? { id: stop.id, name: stop.name } : st.transit?.stop };
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
    refreshTransit: () => { autoStop = null; lastTransit = Date.now(); return updateTransit(); },
    view: () => ({ transit: st.transit, school: st.school?.list || [], health: st.health, bsi: st.bsi?.items || [] }),
  };
};
