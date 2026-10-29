const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
const txt = t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function go(label, url, opt = {}) {
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000), ...opt }); const t = await r.text(); console.log(`\n=== ${label} ${r.status} ${r.headers.get('content-type')} len=${t.length}`); return t; }
  catch (e) { console.log(`\n=== ${label} FEHLER ${e.message}`); return ''; }
}
(async () => {
  const body = new URLSearchParams({ gemeinde: 'Hannover', jsaus: '', strasse: '01172@Hans-Böckler-Allee / Bult@Bult', hausnr: '', hausnraddon: '', anzeigen: 'Suchen' });
  let t = await go('aha post', 'https://www.aha-region.de/abholtermine/abfuhrkalender', { method: 'POST', body, headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
  const i = t.indexOf('kalendertarget');
  console.log((t.match(/<form[^>]*abfuhrkalender[\s\S]*?<\/form>/i) || [''])[0].replace(/<option[\s\S]*?<\/option>/g, '').replace(/\s+/g, ' ').slice(0, 2500));
  console.log('ICS/links:', [...new Set((t.match(/href="[^"]*(ics|ical|kalender|export|pdf)[^"]*"/gi) || []))].slice(0, 20).join('\n'));
  const k = t.search(/Restabfall|Papier|Wertstoff|Bioabfall/);
  console.log('TEXT:', txt(t.slice(Math.max(0, k - 3000), k + 4000)).slice(0, 3500));
  // EFA Infos: Übersicht
  t = await go('efa addinfo', 'https://www.efa.de/efa/XML_ADDINFO_REQUEST?outputFormat=rapidJSON&filterPublicationStatus=current&filterProviderCode=uestra');
  try { const j = JSON.parse(t); const c = j.infos?.current || []; console.log('anzahl', c.length, 'keys', Object.keys(j.infos || {}));
    for (const x of c) console.log(x.type, x.priority, x.properties?.type, '| lines:', (x.affected?.lines || []).map(l => l.disassembledName || l.number || l.name).join(','), '| stops:', (x.affected?.stops || []).length, '|', x.infoLinks?.[0]?.title?.slice(0, 140));
  } catch (e) { console.log(e.message, t.slice(0, 300)); }
  t = await go('efa addinfo alle hannover', 'https://www.efa.de/efa/XML_ADDINFO_REQUEST?outputFormat=rapidJSON&filterPublicationStatus=current&filterOMC=3241');
  try { const j = JSON.parse(t); const c = j.infos?.current || []; console.log('anzahl', c.length);
    for (const x of c.slice(0, 40)) console.log(x.type, x.properties?.providerCode, x.properties?.type, '| lines:', (x.affected?.lines || []).map(l => l.disassembledName || l.number || l.name).join(','), '|', x.infoLinks?.[0]?.title?.slice(0, 120));
    const l = c.find(x => (x.affected?.lines || []).length); if (l) console.log('BEISPIEL LINE', JSON.stringify(l.affected.lines[0]).slice(0, 600));
  } catch (e) { console.log(e.message, t.slice(0, 300)); }
  t = await go('uba 938', `https://luftdaten.umweltbundesamt.de/api/air-data/v3/airquality/json?date_from=${new Date().toISOString().slice(0, 10)}&time_from=1&date_to=${new Date().toISOString().slice(0, 10)}&time_to=24&station=938&lang=de`);
  console.log(t.slice(0, 800));
  t = await go('uba components', 'https://luftdaten.umweltbundesamt.de/api/air-data/v3/components/json?lang=de&index=id');
  console.log(t.slice(0, 900));
})();
