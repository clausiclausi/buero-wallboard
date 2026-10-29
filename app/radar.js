// Regenradar im Stil der Wetter-Apps: hellgraue Landkarte vom Bundesamt für Kartographie (TopPlusOpen)
// und darüber das echte Niederschlagsradar des DWD, letzte Stunde plus Vorhersage, falls verfügbar.
// Alle Bilder holt das Notebook selbst und reicht sie ans Board weiter. So sieht kein fremder Dienst,
// wer das Board anschaut, und es gibt keine Werbung oder Cookie-Banner.
const fs = require('fs');
const path = require('path');

module.exports = function createRadar({ DATA, config, log }) {
  const GEO = (config.radarGeoserver || 'https://maps.dwd.de/geoserver/dwd').replace(/\/$/, ''), DWD = `${GEO}/wms`;
  const MAP = config.radarMapUrl || 'https://sgx.geodatenzentrum.de/wms_topplus_open';
  // Zwei Ausschnitte: „weit“ etwa 95 km um das Büro wie in der WetterOnline-App (Minden bis Braunschweig),
  // „nah“ ein Viertel davon mit schärferer Straßenkarte, damit man am Board bis 16-fach hineinzoomen kann.
  const R = 6378137, x = R * config.lon * Math.PI / 180, y = R * Math.log(Math.tan(Math.PI / 4 + config.lat * Math.PI / 360));
  const KM = config.radarKm || 95;
  const VIEWS = [{ key: 'weit', km: KM, size: 2400 }, { key: 'nah', km: KM / 4, size: 1600 }].map(v => {
    const half = v.km * 1000 / Math.cos(config.lat * Math.PI / 180);
    const file = path.join(DATA, `radar-karte-${v.key}-${v.size}.png`);
    let map = null; try { map = fs.readFileSync(file); } catch {}
    return { ...v, file, map, images: [], bbox: [x - half, y - half, x + half, y + half].map(n => n.toFixed(0)).join(',') };
  });
  const [WIDE, NEAR] = VIEWS;
  const wms = (base, layer, extra = '', v = WIDE) => `${base}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&format=image/png`
    + `&transparent=true&crs=EPSG:3857&bbox=${v.bbox}&width=${v.size}&height=${v.size}${extra}`;

  let state = { ok: false, updated: 0, frames: [], map: !!WIDE.map, near: false };
  let running = false;

  async function getBuf(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Buero-Wallboard/1.0' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${r.status}`);
    const type = r.headers.get('content-type') || '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!type.startsWith('image/png')) throw new Error(`kein Bild (${type}): ${buf.toString('utf8', 0, 160)}`);
    return buf;
  }

  // Der DWD-Dienst antwortet bei einzelnen Zeitpunkten zufällig mit „Zeit nicht gefunden“
  // (mehrere Server mit unterschiedlichem Stand). Ein zweiter oder dritter Versuch klappt fast immer.
  async function getFrame(url) {
    let err;
    for (let i = 0; i < 4; i++) {
      try { return await getBuf(url); }
      catch (e) { err = e; await new Promise(r => setTimeout(r, 700)); }
    }
    throw err;
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

  async function updateMap(v) {
    if (v.map && Date.now() - (fs.statSync(v.file).mtimeMs || 0) < 30 * 86400000) return;
    try {
      // Nahansicht mit der normalen grauen Karte, die zeigt mehr Straßen und Ortsnamen
      v.map = await getBuf(wms(MAP, v === NEAR ? 'web_grau' : 'web_light_grau', '', v).replace('&transparent=true', ''));
      fs.writeFileSync(v.file, v.map);
    } catch (e) { log(`Radar-Landkarte (${v.key}) nicht erreichbar:`, e.message); }
  }

  async function update() {
    if (running) return;
    running = true;
    try { await run(); } finally { running = false; }
  }
  async function run() {
    for (const v of VIEWS) await updateMap(v);
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
      const imgs = [], near = [], frames = [];
      for (const f of list) {
        const time = `&time=${new Date(f.t).toISOString()}`;
        try {
          imgs.push(await getFrame(wms(DWD, f.layer, time)));
          frames.push({ t: f.t, kind: f.kind });
        } catch (e) { log('Radarbild fehlt:', new Date(f.t).toISOString(), e.message.slice(0, 160)); continue; }
        // Nahansicht: fehlt ein Bild, zeigt das Board dafür den vergrößerten weiten Ausschnitt
        near.push(await getFrame(wms(DWD, f.layer, time, NEAR)).catch(e => (log('Radarbild nah fehlt:', e.message), null)));
      }
      // Notfalls nur das aktuellste Bild ohne Zeitangabe
      if (!frames.some(f => f.kind === 'past')) {
        imgs.unshift(await getBuf(wms(DWD, 'dwd:Niederschlagsradar')));
        near.unshift(await getBuf(wms(DWD, 'dwd:Niederschlagsradar', '', NEAR)).catch(() => null));
        frames.unshift({ t: latest, kind: 'past' });
      }
      WIDE.images = imgs; NEAR.images = near;
      state = { ok: true, updated: Date.now(), frames, map: !!WIDE.map, near: !!NEAR.map && near.every(Boolean) };
    } catch (e) {
      log('Radar nicht erreichbar:', e.message);
      state = { ...state, ok: false, updated: Date.now(), map: !!WIDE.map };
    }
  }

  return {
    update,
    view: () => state,
    // /api/radar/karte.png, /api/radar/bild/<nr>.png und dasselbe unter /api/radar/nah/
    image(name) {
      const v = name.startsWith('nah/') ? NEAR : WIDE, n = v === NEAR ? name.slice(4) : name;
      if (n === 'karte.png') return v.map;
      const m = /^bild\/(\d+)\.png$/.exec(n);
      return m ? v.images[+m[1]] || null : null;
    },
  };
};
