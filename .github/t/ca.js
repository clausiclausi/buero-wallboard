const n = require('../../app/net.js')({ DATA: '.', config: {}, log: console.log });
n.ready.then(async () => {
  console.log('RES winCa', n.state.winCa, 'proxy', n.state.proxy || '-', n.state.proxySource);
  const r = await n.altFetch('https://raw.githubusercontent.com/clausiclausi/buero-wallboard/main/app/version.json'); console.log('RES alt', r.status);
}).catch(e => console.log('RES ERR', e));
