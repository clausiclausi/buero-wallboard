const UA = { 'User-Agent': 'Buero-Wallboard/1.0' };
async function show(label, url, opt = {}, n = 1500, filt) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000), ...opt });
    let t = await r.text();
    console.log(`\n=== ${label} ${r.status} ${r.headers.get('content-type')} len=${t.length} final=${r.url}`);
    if (filt) t = filt(t);
    console.log(t.slice(0, n));
    return t;
  } catch (e) { console.log(`\n=== ${label} FEHLER ${e.message} ${e.cause?.code || ''}`); }
}
(async () => {
  // aha Abfuhrkalender
  const page = await show('aha seite', 'https://www.aha-region.de/abholtermine/abfuhrkalender', {}, 6000, t => (t.match(/<form[\s\S]*?<\/form>/gi) || []).join('\n----\n'));
  await show('aha suche strasse', 'https://www.aha-region.de/abholtermine/abfuhrkalender?gemeinde=Hannover&von=H&bis=%5B', {}, 3000, t => (t.match(/<option[^>]*>[^<]*B[öo]ckler[^<]*/gi) || []).join('\n') + '\n' + (t.match(/<select[\s\S]{0,400}/gi) || []).slice(0, 4).join('\n---\n'));
  // UBA Luft
  await show('uba stations', 'https://www.umweltbundesamt.de/api/air_data/v3/stations/json?use=airquality&lang=de', {}, 3000, t => { try { const j = JSON.parse(t); return JSON.stringify(Object.entries(j.data).filter(([k, v]) => /Hannover/i.test(JSON.stringify(v))).map(([k, v]) => [k, v.slice(0, 4)]), null, 0) + '\nindices: ' + JSON.stringify(j.indices).slice(0, 400); } catch (e) { return t.slice(0, 500); } });
  const d = new Date().toISOString().slice(0, 10);
  await show('uba aq', `https://www.umweltbundesamt.de/api/air_data/v3/airquality/json?date_from=${d}&time_from=1&date_to=${d}&time_to=24&lang=de`, {}, 2000, t => { try { const j = JSON.parse(t); return JSON.stringify(j.indices || j.request).slice(0, 600) + '\n' + JSON.stringify(Object.entries(j.data).slice(0, 2)).slice(0, 1200); } catch { return t.slice(0, 500); } });
  // Bright Sky alerts Hannover (Hitze enthalten?)
  await show('brightsky alerts', 'https://api.brightsky.dev/alerts?lat=52.37&lon=9.75', {}, 800);
  // EFA Infos bei Abfahrten
  await show('efa dm infos', 'https://www.efa.de/efa/XML_DM_REQUEST?outputFormat=rapidJSON&type_dm=any&name_dm=de:03241:2841&mode=direct&useRealtime=1&limit=10&includeCompleteStopSeq=0', {}, 4000, t => { try { const j = JSON.parse(t); return 'top infos: ' + JSON.stringify(j.infos || null).slice(0, 1500) + '\nevent infos: ' + JSON.stringify((j.stopEvents || []).map(e => e.infos || e.hints).filter(Boolean)).slice(0, 2000); } catch { return t.slice(0, 400); } });
  await show('efa addinfo', 'https://www.efa.de/efa/XML_ADDINFO_REQUEST?outputFormat=rapidJSON&filterPublicationStatus=current&filterProviderCode=uestra', {}, 3000);
  await show('efa addinfo2', 'https://www.efa.de/efa/XML_ADDINFO_REQUEST?outputFormat=rapidJSON&filterDateValid=' + d.replace(/-/g, '') + '&itdLPxx_selStop=de:03241:2841', {}, 3000);
  await show('uestra meldungen', 'https://www.uestra.de/fahrplan/verkehrsmeldungen/', {}, 3000, t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000));
  await show('gvh stoerungen', 'https://www.gvh.de/fahrplan/verkehrsmeldungen', {}, 2000, t => t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000));
  await show('uestra rss', 'https://www.uestra.de/rss/verkehrsmeldungen.xml', {}, 1500);
})();
