# Büro-Wallboard entfernen
$ErrorActionPreference = 'Continue'
$Target = 'C:\Wallboard'
Write-Host 'Büro-Wallboard wird entfernt' -ForegroundColor Cyan
New-Item -ItemType File -Force "$Target\data\pause-anzeige" | Out-Null
foreach ($t in 'Wallboard Anzeige', 'Wallboard Server') {
  Stop-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
}
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$Target*" -or $_.CommandLine -like '*WallboardEdge*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item "$env:PUBLIC\Desktop\Wallboard anzeigen.cmd" -ErrorAction SilentlyContinue
Get-NetFirewallRule -DisplayName 'Wallboard (Handy-Zugang)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Remove-Item 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' -Recurse -ErrorAction SilentlyContinue
reg delete 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Personalization' /v NoLockScreen /f 2>$null | Out-Null
Write-Host 'Dienst, Vollbild-Anzeige, Firewall-Regel und Update-Zeiten wurden entfernt.'
if ((Read-Host 'Auch alle Daten (Aufgaben, Termine, Inventarliste, Fotos) in C:\Wallboard löschen? (J/N)') -match '^[jJ]') {
  Remove-Item $Target -Recurse -Force; Write-Host 'Daten gelöscht.'
} else { Write-Host "Daten bleiben in $Target erhalten." }
Write-Host 'Energieeinstellungen und automatische Anmeldung bitte bei Bedarf in Windows selbst zurückstellen (Autologon: C:\Wallboard\tools\Autologon64.exe, "Disable").'
