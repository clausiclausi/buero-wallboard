# Büro-Wallboard: Installation auf dem Board-Notebook (Windows 10/11)
# Kann jederzeit erneut ausgeführt werden (Update). Daten, PIN und Einstellungen bleiben erhalten.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Target      = 'C:\Wallboard'
$UpdateRepo  = 'clausiclausi/buero-wallboard'   # Update-Quelle auf GitHub (Konto/Repository)
$Port        = 8080
$NodeVersion = '22.12.0'
$Src         = Split-Path -Parent $MyInvocation.MyCommand.Path
$Utf8NoBom   = New-Object System.Text.UTF8Encoding $false

function Step($t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Green }
function Info($t) { Write-Host "    $t" }
function Ask($q)  { (Read-Host "    $q (J/N)") -match '^[jJyY]' }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Bitte über "Installieren.cmd" starten, dafür sind Administratorrechte nötig.' }

Clear-Host
Write-Host 'Büro-Wallboard wird installiert' -ForegroundColor Cyan
Write-Host '-------------------------------'
Write-Host "Zielordner: $Target"
Write-Host "Computer:   $env:COMPUTERNAME"

# Unter welchem Benutzer läuft die Anzeige?
$consoleUser = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $consoleUser) { $consoleUser = "$env:USERDOMAIN\$env:USERNAME" }
$answer = Read-Host "    Unter welchem Windows-Benutzer soll das Board angezeigt werden? [Enter = $consoleUser]"
$KioskUser = if ($answer) { $answer } else { $consoleUser }

# 1. Programmdateien
Step 'Programmdateien kopieren'
New-Item -ItemType Directory -Force -Path $Target, "$Target\data", "$Target\tools" | Out-Null
# laufenden Server für das Update stoppen
Get-ScheduledTask -TaskName 'Wallboard Server' -ErrorAction SilentlyContinue | Stop-ScheduledTask -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$Target*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($d in 'app.new', 'app.failed') { if (Test-Path "$Target\$d") { Remove-Item "$Target\$d" -Recurse -Force } }
robocopy "$Src\Wallboard\app" "$Target\app" /MIR /NJH /NJS /NFL /NDL | Out-Null
Copy-Item "$Src\Wallboard\launcher.js" "$Target\launcher.js" -Force
Remove-Item "$Target\data\update-pending" -ErrorAction SilentlyContinue
Get-ChildItem $Target -Recurse -File | Unblock-File
Info 'erledigt'

# 2. Node.js (portable, ohne Installation)
Step "Laufzeitumgebung Node.js $NodeVersion"
$nodeExe = "$Target\node\node.exe"
$haveVersion = if (Test-Path $nodeExe) { (& $nodeExe --version) } else { '' }
if ($haveVersion -ne "v$NodeVersion") {
  $zipName = "node-v$NodeVersion-win-x64.zip"
  $tmp = Join-Path $env:TEMP 'wallboard-node'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Info 'wird heruntergeladen (ca. 30 MB) ...'
  Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/$zipName" -OutFile "$tmp\$zipName" -UseBasicParsing
  Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile "$tmp\SHASUMS256.txt" -UseBasicParsing
  $expected = (Select-String -Path "$tmp\SHASUMS256.txt" -Pattern ([regex]::Escape($zipName))).Line.Split(' ')[0]
  $actual = (Get-FileHash "$tmp\$zipName" -Algorithm SHA256).Hash.ToLower()
  if ($expected -ne $actual) { throw 'Download von Node.js ist beschädigt (Prüfsumme stimmt nicht). Bitte erneut versuchen.' }
  Expand-Archive "$tmp\$zipName" -DestinationPath $tmp -Force
  if (Test-Path "$Target\node") { Remove-Item "$Target\node" -Recurse -Force }
  Move-Item "$tmp\node-v$NodeVersion-win-x64" "$Target\node"
  Remove-Item $tmp -Recurse -Force
  Info 'installiert und Prüfsumme bestätigt'
} else { Info 'bereits aktuell' }

# 3. Konfiguration und PIN
Step 'Konfiguration'
$cfgFile = "$Target\config.json"
if (Test-Path $cfgFile) {
  $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json
  Info 'vorhandene Konfiguration und PIN bleiben erhalten'
} else {
  $bytes = New-Object byte[] 4; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pin = '{0:D6}' -f [int]([BitConverter]::ToUInt32($bytes, 0) % 1000000)
  $cfg = [ordered]@{ port = $Port; pin = $pin; lat = 52.3705; lon = 9.7550; ort = 'Hannover, Hans-Böckler-Allee' }
  [IO.File]::WriteAllText($cfgFile, ($cfg | ConvertTo-Json), $Utf8NoBom)
  Info 'neue PIN erzeugt'
}
# Update-Quelle (GitHub). Bei einem privaten Repository wird ein Lese-Schlüssel gebraucht.
$cfgObj = Get-Content $cfgFile -Raw | ConvertFrom-Json
# Das Repository wird bei jeder Installation neu gesetzt, damit ein Kontowechsel ankommt
$cfgObj | Add-Member -NotePropertyName updateRepo -NotePropertyValue $UpdateRepo -Force
if (-not $cfgObj.PSObject.Properties['updateToken']) { $cfgObj | Add-Member -NotePropertyName updateToken -NotePropertyValue '' -Force }
[IO.File]::WriteAllText($cfgFile, ($cfgObj | ConvertTo-Json), $Utf8NoBom)
Info "Updates kommen aus github.com/$UpdateRepo"
[IO.File]::WriteAllText("$Target\PIN.txt", "PIN für den Handy-Zugang zum Wallboard: $($cfg.pin)`r`nÄndern: in config.json eintragen und das Notebook neu starten.`r`n", [Text.Encoding]::UTF8)
# PIN-Datei und Konfiguration nur für Administratoren und SYSTEM lesbar
foreach ($f in @($cfgFile, "$Target\PIN.txt")) { icacls $f /inheritance:r /grant:r 'SYSTEM:F' '*S-1-5-32-544:F' | Out-Null }

# 4. Server als Dienst (geplante Aufgabe beim Systemstart, startet sich bei Absturz neu)
Step 'Wallboard-Server als Dienst einrichten'
$run = @"
@echo off
cd /d "$Target"
:loop
"$Target\node\node.exe" "$Target\launcher.js" >> "$Target\data\server.log" 2>&1
timeout /t 5 /nobreak >nul
goto loop
"@
[IO.File]::WriteAllText("$Target\run-server.cmd", $run, [Text.Encoding]::ASCII)
# Log klein halten
if ((Test-Path "$Target\data\server.log") -and (Get-Item "$Target\data\server.log").Length -gt 5MB) { Move-Item "$Target\data\server.log" "$Target\data\server.old.log" -Force }
$action    = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$Target\run-server.cmd`""
$trigger   = New-ScheduledTaskTrigger -AtStartup
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'Wallboard Server' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'Wallboard Server'
$up = $false
for ($i = 0; $i -lt 30 -and -not $up; $i++) {
  Start-Sleep -Seconds 1
  try { Invoke-WebRequest "http://localhost:$($cfg.port)/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch {}
}
if ($up) { Info "läuft auf http://localhost:$($cfg.port)" } else { Write-Warning "Server antwortet noch nicht. Details: $Target\data\server.log" }

# 5. Firewall: Handy-Zugang nur im privaten Netz (Büro-WLAN), nie im öffentlichen
Step 'Firewall für den Handy-Zugang'
Get-NetFirewallRule -DisplayName 'Wallboard (Handy-Zugang)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Wallboard (Handy-Zugang)' -Direction Inbound -Protocol TCP -LocalPort $cfg.port -Action Allow -Profile Private, Domain | Out-Null
Info "Port $($cfg.port) im privaten Netzwerk freigegeben"
$public = Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public'
foreach ($n in $public) {
  Write-Host "    Das Netzwerk '$($n.Name)' ist als ÖFFENTLICH eingestuft. Dann erreichen Handys das Board nicht." -ForegroundColor Yellow
  if (Ask "Ist '$($n.Name)' euer Büro-WLAN und soll als privates Netzwerk gelten?") {
    Set-NetConnectionProfile -InterfaceIndex $n.InterfaceIndex -NetworkCategory Private
    Info 'auf privat umgestellt'
  }
}

# 6. Anzeige im Vollbild nach der Anmeldung
Step "Vollbild-Anzeige für $KioskUser"
# Den Wächter (start-board.ps1) und das Desktop-Symbol legt der Wallboard-Server selbst an, damit Updates sie mitbringen
for ($i = 0; $i -lt 30 -and -not (Test-Path "$Target\start-board.ps1"); $i++) { Start-Sleep -Seconds 1 }
if (-not (Test-Path "$Target\start-board.ps1")) { Write-Warning 'start-board.ps1 fehlt, bitte data\server.log prüfen' }
$kAction    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Target\start-board.ps1`""
$kTrigger   = New-ScheduledTaskTrigger -AtLogOn -User $KioskUser
$kSettings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$kPrincipal = New-ScheduledTaskPrincipal -UserId $KioskUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Wallboard Anzeige' -Action $kAction -Trigger $kTrigger -Settings $kSettings -Principal $kPrincipal -Force | Out-Null
icacls "$Target\data" /grant "*S-1-5-32-545:(OI)(CI)M" | Out-Null
Remove-Item "$Target\data\pause-anzeige" -ErrorAction SilentlyContinue
# Nach einer Neuinstallation wird das Board immer wieder angezeigt (auch wenn es vorher dauerhaft geschlossen war)
try { Invoke-RestMethod -Method Post -Uri "http://localhost:$($cfg.port)/api/display?mode=show" -TimeoutSec 5 | Out-Null }
catch { [IO.File]::WriteAllText("$Target\data\anzeige.json", '{"mode":"show","until":0,"id":"install"}', $Utf8NoBom) }
Info 'startet nach jeder Anmeldung automatisch'

# 7. Energiesparen und Sperre aus (am Netzteil)
Step 'Energiesparen und Bildschirmsperre abschalten'
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0      # Deckel zu: nichts tun (Notebook am Fernseher)
powercfg /setacvalueindex SCHEME_CURRENT SUB_NONE CONSOLELOCK 0       # nach Aufwachen keine Anmeldung verlangen
powercfg /setactive SCHEME_CURRENT
reg add 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Personalization' /v NoLockScreen /t REG_DWORD /d 1 /f | Out-Null
Info 'Bildschirm, Standby und Ruhezustand am Netzteil aus; Deckel zuklappen erlaubt'
Info 'Hinweis: Das Board selbst wird außerhalb der Bürozeiten schwarz.'

# 8. Windows-Updates nur nachts
Step 'Windows-Updates außerhalb der Bürozeiten'
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
New-Item -Path $wu -Force | Out-Null
Set-ItemProperty $wu -Name SetActiveHours   -Type DWord -Value 1
Set-ItemProperty $wu -Name ActiveHoursStart -Type DWord -Value 6
Set-ItemProperty $wu -Name ActiveHoursEnd   -Type DWord -Value 21
Info 'Nutzungszeit 6 bis 21 Uhr: Neustarts für Updates nur nachts'

# 9. Automatische Anmeldung (optional)
Step 'Automatische Anmeldung nach Neustart oder Stromausfall'
if (Ask "Soll sich '$KioskUser' nach dem Einschalten automatisch anmelden?") {
  $al = "$Target\tools\Autologon64.exe"
  if (-not (Test-Path $al)) {
    Info 'lade das Microsoft-Werkzeug Autologon (Sysinternals) ...'
    Invoke-WebRequest 'https://live.sysinternals.com/Autologon64.exe' -OutFile $al -UseBasicParsing
  }
  $sig = Get-AuthenticodeSignature $al
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Microsoft') { Remove-Item $al -Force; throw 'Autologon ist nicht korrekt von Microsoft signiert, Abbruch.' }
  Info 'Im folgenden Fenster das Windows-Passwort eingeben und "Enable" klicken.'
  Info 'Das Passwort wird von Windows verschlüsselt gespeichert, nicht im Klartext.'
  Start-Process $al -ArgumentList '/accepteula' -Wait
} else { Info 'übersprungen' }

# Fertig
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VMware|VirtualBox' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host ' Fertig! Das Wallboard ist installiert.' -ForegroundColor Cyan
Write-Host '==========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host " Handy-Zugang (im Büro-WLAN):  http://$($ip):$($cfg.port)/m"
Write-Host "                         oder  http://$($env:COMPUTERNAME):$($cfg.port)/m"
Write-Host " PIN:                          $($cfg.pin)" -ForegroundColor Yellow
Write-Host ''
Write-Host " Die PIN steht auch in $Target\PIN.txt (nur für Administratoren lesbar)."
Write-Host ' Tipp: Im Router dem Notebook eine feste IP-Adresse geben, damit sich der Link nie ändert.'
Write-Host " Wartung: '$Target\Board beenden (Wartung).cmd'"
Write-Host ''
if (Ask 'Board jetzt im Vollbild starten?') { Start-ScheduledTask -TaskName 'Wallboard Anzeige' }
