// Regenradar im Stil der Wetter-Apps: hellgraue Landkarte vom Bundesamt für Kartographie (TopPlusOpen)
// und darüber das echte Niederschlagsradar des DWD, letzte Stunde plus Vorhersage, falls verfügbar.
// Alle Bilder holt das Notebook selbst und reicht sie ans Board weiter. So sieht kein fremder Dienst,
// wer das Board anschaut, und es gibt keine Werbung oder Cookie-Banner.
const fs = require('fs');
const path = require('path');

module.exports = function createRadar({ DATA, config, log }) {
  const SIZE = 2400; // groß genug, um am Board bis achtfach hineinzuzoomen
  const MAP_FILE = path.join(DATA, `radar-karte-${SIZE}.png`);
  const GEO = (config.radarGeoserver || 'https://maps.dwd.de/geoserver/dwd').replace(/\/$/, ''), DWD = `${GEO}/wms`;
  const MAP = config.radarMapUrl || 'https://sgx.geodatenzentrum.de/wms_topplus_open';
  // Ausschnitt etwa 95 km um das Büro, wie in der WetterOnline-App (Minden bis Braunschweig)
  const R = 6378137, x = R * config.lon * Math.PI / 180, y = R * Math.log(Math.tan(Math.PI / 4 + config.lat * Math.PI / 360));
  const half = (config.radarKm || 95) * 1000 / Math.cos(config.lat * Math.PI / 180);
  const BBOX = [x - half, y - half, x + half, y + half].map(v => v.toFixed(0)).join(',');
  const wms = (base, layer, extra = '') => `${base}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&format=image/png`
    + `&transparent=true&crs=EPSG:3857&bbox=${BBOX}&width=${SIZE}&height=${SIZE}${extra}`;

  let state = { ok: false, updated: 0, frames: [], map: fs.existsSync(MAP_FILE) };
  let images = [];
  let mapBuf = null;
  try { mapBuf = fs.readFileSync(MAP_FILE); } catch {}

  async function getBuf(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Buero-Wallboard/1.0' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const type = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!type.startsWith('image/png')) throw new Error(`kein Bild (${type}): ${buf.toString('utf8', 0, 160)}`);
    return buf;
  }

  // Zeitpunkte einer Radarebene aus den Capabilities lesen (Liste oder Start/Ende/Abstand)
  async function times(layer) {
    const r = await fetch(`${GEO}/${layer}/wms?service=WMS&version=1.3.0&request=GetCapabilities`,
      { headers: { 'User-Agent': 'Buero-Wallboard/1.0' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const xml = await r.text();
    const dim = (xml.match(/<Dimension[^>]*name="time"[^>]*>([^<]*)<\/Dimension>/i) || [])[1];
    if (!dim) return [];
    const out = [];
    for (const part of dim.trim().split(',')) {
      const [a, b, step] = part.trim().split('/');
      if (!b) { const t = Date.parse(a); if (t) out.push(t); continue; }
      const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(step || 'PT5M');
      const inc = ((+m[1] || 0) * 60 + (+m[2] || 5)) * 60000;
      for (let t = Math.max(Date.parse(a), Date.parse(b) - 6 * 3600000); t <= Date.parse(b); t += inc) out.push(t);
    }
    return [...new Set(out)].sort((p, q) => p - q);
  }

  async function updateMap() {
    if (mapBuf && Date.now() - (fs.statSync(MAP_FILE).mtimeMs || 0) < 30 * 86400000) return;
    try {
      mapBuf = await getBuf(wms(MAP, 'web_light_grau').replace('&transparent=true', ''));
      fs.writeFileSync(MAP_FILE, mapBuf);
      state.map = true;
    } catch (e) { log('Radar-Landkarte nicht erreichbar:', e.message); }
  }

  async function update() {
    await updateMap();
    try {
      // Vergangenheit: Niederschlagsradar, alle 10 Minuten der letzten Stunde
      let past = [];
      try { past = (await times('Niederschlagsradar')).filter(t => t > Date.now() - 75 * 60000 && t <= Date.now() - 8 * 60000); }
      // (Der DWD meldet auch Zeiten, deren Bild noch nicht fertig ist; die letzten Minuten deshalb auslassen)
      catch (e) { log('Radarzeiten nicht lesbar:', e.message); }
      // Ohne Zeitliste: die letzten 5-Minuten-Schritte selbst ausrechnen (DWD liefert mit etwa 10 Minuten Verzug)
      if (!past.length) { const t0 = Math.floor((Date.now() - 10 * 60000) / 300000) * 300000; for (let i = 6; i >= 0; i--) past.push(t0 - i * 600000); }
      const latest = past[past.length - 1];
      const pick = past.filter(t => (latest - t) % 600000 === 0).slice(-7);
      // Vorhersage: DWD-Niederschlagsvorhersage (RV), bis 90 Minuten voraus, wenn der Dienst sie anbietet
      let fc = [];
      try {
        fc = (await times('Radar_rv_product_1x1km_ger')).filter(t => t > latest && t <= latest + 90 * 60000 && (t - latest) % 900000 === 0);
      } catch (e) { log('Radar-Vorhersage nicht erreichbar:', e.message); }
      const list = [...pick.map(t => ({ t, layer: 'dwd:Niederschlagsradar', kind: 'past' })),
        ...fc.map(t => ({ t, layer: 'dwd:Radar_rv_product_1x1km_ger', kind: 'fc' }))];
      const imgs = [], frames = [];
      for (const f of list) {
        try {
          imgs.push(await getBuf(wms(DWD, f.layer, `&time=${new Date(f.t).toISOString()}`)));
          frames.push({ t: f.t, kind: f.kind });
        } catch (e) { log('Radarbild fehlt:', new Date(f.t).toISOString(), e.message); }
      }
      // Notfalls nur das aktuellste Bild ohne Zeitangabe
      if (!frames.some(f => f.kind === 'past')) {
        imgs.unshift(await getBuf(wms(DWD, 'dwd:Niederschlagsradar')));
        frames.unshift({ t: latest, kind: 'past' });
      }
      images = imgs;
      state = { ok: true, updated: Date.now(), frames, map: !!mapBuf };
    } catch (e) {
      log('Radar nicht erreichbar:', e.message);
      state = { ...state, ok: false, updated: Date.now(), map: !!mapBuf };
    }
  }

  return {
    update,
    view: () => state,
    // /api/radar/karte.png und /api/radar/bild/<nr>.png
    image(name) {
      if (name === 'karte.png') return mapBuf;
      const m = /^bild\/(\d+)\.png$/.exec(name);
      return m ? images[+m[1]] || null : null;
    },
  };
};
