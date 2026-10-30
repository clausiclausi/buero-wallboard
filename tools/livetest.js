const fs = require('fs'), path = require('path'), os = require('os');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
const localDate = o => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ex = require('../app/extras.js')({ DATA, config: {}, log: (...a) => console.log('LOG', ...a), getSettings: () => ({}), broadcast: () => {}, localDate });
ex.start();
setTimeout(() => {
  const v = ex.view(), n = v.news?.items || v.news || [];
  console.log('NEWS', n.length);
  for (const i of n) console.log('N', i.src.padEnd(10), i.title);
  process.exit(0);
}, 45000);
