const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
const txt = t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function post(body) {
  const r = await fetch('https://www.aha-region.de/abholtermine/abfuhrkalender', { method: 'POST', body: new URLSearchParams(body), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
  return { status: r.status, ct: r.headers.get('content-type'), t: await r.text(), cd: r.headers.get('content-disposition') };
}
(async () => {
  const base = { gemeinde: 'Hannover', jsaus: '', strasse: '01172@Hans-Böckler-Allee / Bult@Bult', hausnr: '1', hausnraddon: '', anzeigen: 'Suchen' };
  let { t } = await post(base);
  const s = t.indexOf('</select>', t.indexOf('name="strasse"'));
  const e = t.indexOf('</form>', s);
  console.log('REST FORM:', t.slice(s, e + 7).replace(/\s+/g, ' ').slice(0, 4000));
  const k = t.indexOf('name="ladeort"');
  const opts = [...t.slice(k, k + 3000).matchAll(/<option[^>]*value=['"]([^'"]*)['"][^>]*>([^<]*)/g)].map(m => [m[1], m[2].trim()]);
  console.log('LADEORT OPTIONS', JSON.stringify(opts));
  const after = t.slice(e, e + 30000);
  console.log('NACH FORM:', txt(after).slice(0, 3000));
  console.log('FORMS GESAMT:', (t.match(/<form[^>]*>/g) || []).join('\n'));
  if (opts[0]) {
    for (const extra of [{ ladeort: opts[0][0], anzeigen: 'Suchen' }, { ladeort: opts[0][0], ical: 'ICAL Jahresübersicht' }]) {
      const r = await post({ ...base, ...extra });
      console.log('\n=== MIT', JSON.stringify(extra), r.status, r.ct, r.cd, r.t.length);
      if (/calendar/.test(r.ct || '')) console.log(r.t.slice(0, 1500));
      else { const m = r.t.search(/\d{2}\.\d{2}\.\d{4}/); console.log(m > 0 ? txt(r.t.slice(m - 1500, m + 3000)).slice(0, 2500) : 'keine Daten'); }
    }
  }
})();
