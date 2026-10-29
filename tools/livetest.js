const fs = require('fs'), path = require('path'), os = require('os');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
const localDate = o => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ex = require('../app/extras.js')({ DATA, config: {}, log: (...a) => console.log('LOG', ...a), getSettings: () => ({}), broadcast: () => {}, localDate });
ex.start();
setTimeout(() => {
  const v = ex.view();
  console.log('TRANSIT', v.transit?.ok, v.transit?.stop?.name, (v.transit?.deps || []).slice(0, 5).map(d => d.line + '>' + d.dir).join(', '));
  console.log('LINEINFO', JSON.stringify(v.lineInfo, null, 1));
  console.log('AIR', JSON.stringify(v.air));
  console.log('WASTE', JSON.stringify({ ...v.waste, list: (v.waste?.list || []).slice(0, 8) }));
  console.log('NEWS', (v.news || []).length);
  process.exit(0);
}, 45000);
