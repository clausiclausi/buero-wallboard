const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
const txt = t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function post(body) {
  const r = await fetch('https://www.aha-region.de/abholtermine/abfuhrkalender', { method: 'POST', body: new URLSearchParams(body), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
  return { status: r.status, ct: r.headers.get('content-type'), t: await r.text(), cd: r.headers.get('content-disposition') };
}
(async () => {
  const st = '01172@Hans-Böckler-Allee / Bult@Bult';
  for (const hnr of ['', '1', '5']) {
    const { status, t } = await post({ gemeinde: 'Hannover', jsaus: '', strasse: st, hausnr: hnr, hausnraddon: '', anzeigen: 'Suchen' });
    console.log(`\n=== hausnr "${hnr}" ${status} len=${t.length}`);
    const f = (t.match(/<form[^>]*abfuhrkalender[\s\S]*?<\/form>/i) || [''])[0].replace(/<a class="btn[^>]*>[A-Z]<\/a>/g, '').replace(/<option value="[A-Za-zäöü. ]+"[\s\S]*?<\/option>/g, '').replace(/\s+/g, ' ');
    console.log('FORM:', f.slice(0, 3000));
    console.log('ladeort:', (t.match(/ladeort[^>]{0,200}/gi) || []).slice(0, 5).join('\n'));
    const k = t.indexOf('kalendertarget"'); if (k > 0) console.log('ZIEL:', txt(t.slice(k, k + 6000)).slice(0, 2500));
    const m = t.search(/Restabfall\s*<|Abfuhrtermine|Ihre Abfuhrtermine/i); if (m > 0) console.log('TERMINE:', txt(t.slice(m - 500, m + 5000)).slice(0, 2500));
  }
})();
