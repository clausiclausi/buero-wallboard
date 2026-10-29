// Anzeige am Notebook steuern: Board zeigen, minimieren, für eine Zeit oder dauerhaft schließen.
// Der Server schreibt den Wunsch nach data/anzeige.json, der Wächter (start-board.ps1, läuft als
// angemeldeter Benutzer) setzt ihn um. Unter Windows legt der Server Wächter und Desktop-Symbol
// selbst an, damit beides per Update mitkommt.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

// Hinweis: hier kein Dollar-geschweifte-Klammer und keine Backticks verwenden (JS-Template)
const WATCHDOG = String.raw`# Büro-Wallboard: Wächter für die Vollbild-Anzeige (wird vom Wallboard-Server erzeugt, nicht von Hand ändern)
$ErrorActionPreference = 'SilentlyContinue'
$url = 'http://localhost:__PORT__/'
$data = 'C:\Wallboard\data'
$edgeProfile = Join-Path $env:LOCALAPPDATA 'WallboardEdge'
$edge = @((Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class WbWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public static IntPtr[] Find(uint[] pids) {
    var set = new HashSet<uint>(pids); var list = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) { uint p; GetWindowThreadProcessId(h, out p);
      if (set.Contains(p) && IsWindowVisible(h) && GetWindowTextLength(h) > 0) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
function Get-BoardProcs { Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*WallboardEdge*' } }
function Get-BoardWindows { $p = @(Get-BoardProcs | ForEach-Object { [uint32]$_.ProcessId }); if ($p.Count) { [WbWin]::Find($p) } else { @() } }
function Start-Board { Start-Process $edge -ArgumentList @('--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run', ('--user-data-dir="' + $edgeProfile + '"'), '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate', '--disable-pinch', '--overscroll-history-navigation=0') }
function Stop-Board { Get-BoardProcs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }

for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 1 } }
$done = ''; $lastStart = [DateTime]::MinValue
while ($true) {
  $want = 'show'; $id = ''
  try { $s = Get-Content (Join-Path $data 'anzeige.json') -Raw | ConvertFrom-Json; $want = [string]$s.mode; $id = [string]$s.id } catch {}
  if (Test-Path (Join-Path $data 'pause-anzeige')) { $want = 'off'; $id = 'datei' }
  $running = @(Get-BoardProcs).Count -gt 0
  if ($want -eq 'pause') {
    if ($running) { Stop-Board }
  } elseif ($want -eq 'off') {
    # Dauerhaft schließen: einmal beenden. Startet es danach jemand von Hand, bleibt es offen.
    if ($running -and $done -ne $id) { Stop-Board }
    $done = $id
  } elseif ($want -eq 'minimize') {
    if ($running -and $done -ne $id) {
      foreach ($w in Get-BoardWindows) { [WbWin]::ShowWindow($w, 6) | Out-Null }
      Start-Sleep -Milliseconds 800
      # Lässt sich das Vollbild nicht minimieren, wird es geschlossen, bis jemand "Wallboard anzeigen" wählt
      if (@(Get-BoardWindows | Where-Object { -not [WbWin]::IsIconic($_) }).Count) { Stop-Board }
      $done = $id
    }
  } else {
    if (-not $running) {
      if (((Get-Date) - $lastStart).TotalSeconds -gt 15) { Start-Board; $lastStart = Get-Date }
    } elseif ($done -ne $id) {
      foreach ($w in Get-BoardWindows) { if ([WbWin]::IsIconic($w)) { [WbWin]::ShowWindow($w, 9) | Out-Null }; [WbWin]::SetForegroundWindow($w) | Out-Null }
    }
    $done = $id
  }
  Start-Sleep -Seconds 3
}
`;

const MODES = ['show', 'minimize', 'pause', 'off'];

module.exports = function createDisplay({ ROOT, DATA, config, log, broadcast, officeStart }) {
  const FILE = path.join(DATA, 'anzeige.json');
  let state = { mode: 'show', until: 0, id: '0' };
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}
  if (!MODES.includes(state.mode)) state.mode = 'show';
  // „Dauerhaft schließen“ gilt nur bis zum nächsten Neustart des Notebooks
  const BOOT = Math.round(Date.now() / 1000 - os.uptime()); // Startzeit des Notebooks in Sekunden
  if (state.mode === 'off' && !(Math.abs((+state.boot || 0) - BOOT) < 300)) { state = { mode: 'show', until: 0, id: String(Date.now()) }; write(); }

  // Nächster Bürobeginn (Mo–Fr) als Zeitpunkt
  function nextMorning() {
    const [h, m] = (officeStart() || '06:00').split(':').map(Number);
    const d = new Date(); d.setSeconds(0, 0);
    d.setHours(h, m);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function write() {
    try {
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(state));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch {
      // Windows: Datei liest gerade der Wächter, dann direkt schreiben
      try { fs.writeFileSync(FILE, JSON.stringify(state)); } catch (e) { log('Anzeige-Status nicht gespeichert', e.message); }
    }
  }

  // mode: show | minimize | pause | off; minutes: Zahl oder 'morning' (nur bei pause)
  function set(mode, minutes) {
    if (!MODES.includes(mode)) throw new Error('Unbekannte Auswahl');
    let until = 0;
    if (mode === 'pause') {
      const min = parseInt(minutes, 10);
      until = minutes === 'morning' ? nextMorning() : Date.now() + (min >= 5 && min <= 720 ? min : 60) * 60000;
    }
    if (mode === 'minimize') until = nextMorning();
    state = { mode, until, id: String(Date.now()), boot: BOOT };
    write(); broadcast();
    log('Anzeige:', mode, until ? new Date(until).toLocaleString('de-DE') : '');
    return state;
  }

  function tick() { if (state.mode !== 'show' && state.until && Date.now() >= state.until) set('show'); }

  const view = () => ({ mode: state.mode, until: state.until });

  // Wächter und Hilfsdateien unter Windows anlegen bzw. aktualisieren
  function installHelpers() {
    if (process.platform !== 'win32') return;
    const crlf = s => s.replace(/\r?\n/g, '\r\n');
    const port = config.port;
    try {
      const ps1 = '\ufeff' + crlf(WATCHDOG.replace('__PORT__', port));
      const file = path.join(ROOT, 'start-board.ps1');
      let old = ''; try { old = fs.readFileSync(file, 'utf8'); } catch {}
      const call = mode => `powershell -NoProfile -WindowStyle Hidden -Command "try { Invoke-RestMethod -Method Post -Uri 'http://localhost:${port}/api/display?mode=${mode}' | Out-Null } catch {}"`;
      const show = crlf(`@echo off\n${call('show')}\ndel "${ROOT}\\data\\pause-anzeige" >nul 2>&1\nschtasks /run /tn "Wallboard Anzeige" >nul 2>&1\n`);
      const off = crlf(`@echo off\n${call('off')}\necho Das Board ist geschlossen. Wieder anzeigen: Symbol "Wallboard anzeigen" auf dem Desktop.\ntimeout /t 5 >nul\n`);
      fs.writeFileSync(path.join(ROOT, 'Board starten.cmd'), show);
      fs.writeFileSync(path.join(ROOT, 'Board beenden (Wartung).cmd'), off);
      const desk = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');
      try { fs.writeFileSync(path.join(desk, 'Wallboard anzeigen.cmd'), show); } catch (e) { log('Desktop-Symbol nicht angelegt', e.message); }
      if (old !== ps1) {
        fs.writeFileSync(file, ps1);
        log('Wächter für die Anzeige aktualisiert, starte ihn neu');
        const restart = "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*start-board.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Start-Sleep -Seconds 2; schtasks /run /tn 'Wallboard Anzeige'";
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', restart], { windowsHide: true, timeout: 60000 }, (err) => { if (err) log('Wächter-Neustart:', err.message); });
      }
    } catch (e) { log('Anzeige-Helfer nicht angelegt', e.message); }
  }

  return { set, tick, view, installHelpers, nextMorning };
};
module.exports.WATCHDOG = WATCHDOG;
