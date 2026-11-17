'use strict';
// Wetter direkt vom Deutschen Wetterdienst (opendata.dwd.de), ohne Zwischendienst:
// - aktuelle Messung der Station Hannover-Flughafen (POI-CSV, stündlich)
// - Stundenvorhersage MOSMIX_L für dieselbe Station (KMZ = ZIP mit einer KML-Datei)
// - Unwetterwarnungen aus der amtlichen Warnliste (warnings.json)
const zlib = require('zlib');

const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
async function fetchBuf(url, ms = 20000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// Erste Datei aus einem ZIP entpacken (über das zentrale Verzeichnis, damit Größen stimmen)
function unzipFirst(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP ohne Verzeichnis');
  const cd = buf.readUInt32LE(e + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('ZIP-Verzeichnis kaputt');
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), off = buf.readUInt32LE(cd + 42);
  const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
  const data = buf.subarray(start, start + size);
  return method === 8 ? zlib.inflateRawSync(data) : data;
}

// MOSMIX ww (WMO-Code) → Symbolnamen wie bei Bright Sky; 0–3 steht bei MOSMIX für die Bewölkung
function wwIcon(ww, day) {
  if (ww == null || ww <= 0) return day ? 'clear-day' : 'clear-night';
  if (ww <= 2) return day ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (ww === 3) return 'cloudy';
  if (ww >= 95) return 'thunderstorm';
  if (ww === 45 || ww === 49) return 'fog';
  if ([56, 57, 66, 67, 68, 69, 83, 84].includes(ww)) return 'sleet';
  if ((ww >= 70 && ww <= 79) || ww === 85 || ww === 86) return 'snow';
  if (ww >= 50) return 'rain';
  return 'cloudy';
}
// Code „aktuelles Wetter“ der DWD-Stationsmeldung (POI)
function poiIcon(c, day) {
  if (c === 1) return day ? 'clear-day' : 'clear-night';
  if (c === 2 || c === 3) return day ? 'partly-cloudy-day' : 'partly-cloudy-night';
  if (c === 4) return 'cloudy';
  if (c === 5 || c === 6) return 'fog';
  if ((c >= 7 && c <= 9) || c === 18 || c === 19) return 'rain';
  if ((c >= 10 && c <= 13) || c === 20 || c === 21) return 'sleet';
  if ((c >= 14 && c <= 16) || c === 22 || c === 23) return 'snow';
  if (c === 17 || c === 24 || c === 25) return 'hail';
  if (c >= 26 && c <= 30) return 'thunderstorm';
  if (c === 31) return 'wind';
  return null;
}
const isDay = (d) => { const h = d.getHours(); return h >= 7 && h < 17; };

module.exports = ({ localDate, localDateOf, station = '10338' }) => {
  async function forecast() {
    const kml = unzipFirst(await fetchBuf(`https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/${station}/kml/MOSMIX_L_LATEST_${station}.kmz`)).toString('latin1');
    const steps = [...kml.matchAll(/<dwd:TimeStep>([^<]+)<\/dwd:TimeStep>/g)].map(m => new Date(m[1]));
    const el = (name) => {
      const m = kml.match(new RegExp(`elementName="${name}">\\s*<dwd:value>([^<]*)<`));
      return m ? m[1].trim().split(/\s+/).map(v => (v === '-' ? null : Number(v))) : [];
    };
    const T = el('TTT'), RR = el('RR1c'), P = el('wwP'), R101 = el('R101'), WW = el('ww'), FF = el('FF'), DD = el('DD');
    if (!steps.length || !T.length) throw new Error('DWD-Vorhersage ohne Daten');
    return steps.map((d, i) => ({ d, temp: T[i] != null ? Math.round((T[i] - 273.15) * 10) / 10 : null, mm: RR[i] ?? 0,
      prob: R101[i] ?? P[i] ?? null, ww: WW[i], wind: FF[i] != null ? Math.round(FF[i] * 3.6 * 10) / 10 : null, dir: DD[i] }));
  }
  async function observation() {
    const lines = (await fetchBuf(`https://opendata.dwd.de/weather/weather_reports/poi/${station}-BEOB.csv`)).toString('latin1').split(/\r?\n/);
    const head = lines[0].split(';');
    const row = lines.slice(3).map(l => l.split(';')).find(r => r.length === head.length);
    if (!row) throw new Error('DWD-Messung ohne Daten');
    const num = (key) => { const v = row[head.indexOf(key)]; return v == null || v === '---' || v === '' ? null : Number(v.replace(',', '.')); };
    const [dd, mm, yy] = row[0].split('.'), at = new Date(`20${yy}-${mm}-${dd}T${row[1]}:00Z`);
    return { at, temp: num('dry_bulb_temperature_at_2_meter_above_ground'), wind: num('mean_wind_speed_during last_10_min_at_10_meters_above_ground'),
      dir: num('mean_wind_direction_during_last_10 min_at_10_meters_above_ground'), code: num('present_weather') };
  }

  async function weather() {
    const [fc, obs] = await Promise.all([forecast(), observation().catch(() => null)]);
    const now = new Date(), today = localDate(0), hours = {};
    for (const s of fc) {
      if (localDateOf(s.d) !== today || s.temp == null) continue;
      hours[s.d.getHours()] = { prob: s.prob ?? (s.mm > 0.1 ? 80 : s.mm > 0 ? 40 : 5), mm: s.mm, temp: s.temp };
    }
    // Vorhersage-Stunde, die gerade läuft (Zeitstempel = Ende der Stunde)
    const cur = fc.find(s => s.d > now) || fc[fc.length - 1];
    const fresh = obs && obs.temp != null && now - obs.at < 3 * 3600000;
    const icon = (fresh && poiIcon(obs.code, isDay(now))) || wwIcon(cur.ww, isDay(now));
    return {
      source: 'DWD (opendata.dwd.de)',
      now: { temp: fresh ? obs.temp : cur.temp, icon, wind: fresh && obs.wind != null ? obs.wind : cur.wind, windDir: fresh && obs.dir != null ? obs.dir : cur.dir },
      hours,
    };
  }

  // Amtliche Warnungen; warncell 103241000 = Region Hannover
  async function alerts(cell = '103241000') {
    const txt = (await fetchBuf('https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json')).toString('utf8');
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const list = [...(j.warnings?.[cell] || []), ...(j.vorabInformation?.[cell] || [])];
    const sev = ['minor', 'minor', 'moderate', 'severe', 'extreme'];
    return list.filter(w => !w.end || w.end > Date.now()).map(w => ({ event: w.event, headline: w.headline, severity: sev[w.level] || 'minor', until: w.end ? new Date(w.end).toISOString() : null }));
  }

  return { weather, alerts, _test: { unzipFirst, wwIcon, poiIcon } };
};
