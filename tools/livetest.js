const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
async function post(body) {
  const r = await fetch('https://www.aha-region.de/abholtermine/abfuhrkalender', { method: 'POST', body: new URLSearchParams(body), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
  return { status: r.status, ct: r.headers.get('content-type'), t: await r.text(), cd: r.headers.get('content-disposition') };
}
(async () => {
  const base = { gemeinde: 'Hannover', jsaus: '', strasse: '01172@Hans-Böckler-Allee / Bult@Bult', hausnr: '1', hausnraddon: '', anzeigen: 'Suchen' };
  let { t } = await post(base);
  const k = t.indexOf('name="ladeort"');
  console.log('LADEORT SELECT', t.slice(k - 100, k + 800).replace(/\s+/g, ' '));
  const s = t.indexOf('</select>', k), e = t.indexOf('</form>', s);
  console.log('NACH LADEORT', t.slice(s, Math.min(e + 7, s + 2500)).replace(/\s+/g, ' '));
  const opts = [...t.slice(k, k + 3000).matchAll(/<option[^>]*value=['"]([^'"]*)['"]/g)].map(m => m[1]);
  console.log('OPTS', JSON.stringify(opts));
  const r = await post({ ...base, ladeort: opts[0], ical: 'ICAL Jahresübersicht' });
  console.log('ICAL', r.status, r.ct, r.cd, r.t.length);
  const ev = [...r.t.matchAll(/DTSTART;VALUE=DATE:(\d{8})[\s\S]*?SUMMARY:([^\r\n]*)/g)].map(m => m[1] + ' ' + m[2]);
  console.log('EVENTS', ev.length, ev.slice(0, 12).join(' | '));
  console.log('ARTEN', [...new Set(ev.map(x => x.slice(9)))].join(', '));
  // ohne anzeigen-Feld
  const r2 = await post({ gemeinde: 'Hannover', strasse: base.strasse, hausnr: '1', hausnraddon: '', ladeort: opts[0], ical: 'ICAL Jahresübersicht' });
  console.log('ICAL2', r2.status, r2.ct, r2.t.length);
  const r3 = await post({ gemeinde: 'Hannover', strasse: base.strasse, hausnr: '20', hausnraddon: '', anzeigen: 'Suchen' });
  const k3 = r3.t.indexOf('name="ladeort"');
  console.log('HNR20 OPTS', JSON.stringify([...r3.t.slice(k3, k3 + 3000).matchAll(/<option[^>]*value=['"]([^'"]*)['"]/g)].map(m => m[1])));
})();
