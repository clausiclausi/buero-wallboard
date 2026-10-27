// Starter für den Wallboard-Server. Wird nie per Update ersetzt.
// Startet app/server.js neu, wenn er beendet wird, und holt nach einem misslungenen
// Update automatisch die vorherige Version (app.old) zurück.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP = path.join(ROOT, 'app'), OLD = path.join(ROOT, 'app.old'), FAILED = path.join(ROOT, 'app.failed');
const PENDING = path.join(ROOT, 'data', 'update-pending');
let quickFails = 0;

function log(msg) { console.log(new Date().toISOString(), '[Starter]', msg); }

function rollback() {
  log('Neue Version startet nicht, stelle vorherige Version wieder her');
  fs.rmSync(FAILED, { recursive: true, force: true });
  fs.renameSync(APP, FAILED);
  fs.renameSync(OLD, APP);
  // gescheiterte Version merken, damit sie nicht erneut angeboten wird
  try { fs.writeFileSync(path.join(ROOT, 'data', 'update-failed'), JSON.parse(fs.readFileSync(PENDING, 'utf8')).to); } catch {}
  fs.rmSync(PENDING, { force: true });
}

function start() {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(APP, 'server.js')], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code) => {
    const quick = Date.now() - started < 30000;
    quickFails = quick && code !== 0 ? quickFails + 1 : 0;
    if (quickFails >= 2 && fs.existsSync(PENDING) && fs.existsSync(OLD)) {
      try { rollback(); } catch (e) { log('Wiederherstellen fehlgeschlagen: ' + e.message); }
      quickFails = 0;
    }
    setTimeout(start, code === 0 ? 1000 : 5000);
  });
}
start();
