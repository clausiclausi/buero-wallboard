# Büro-Wallboard

Update-Quelle für das Büro-Wallboard. Das Board auf dem Notebook liest `manifest.json`
(Version, Patch-Notes, SHA-256 jeder Datei) und lädt bei „Aktualisieren“ die Dateien aus `app/`.

Neue Version: `app/version.json` erhöhen, Patch-Notes oben in `app/changelog.json` eintragen,
`python3 release.py` ausführen und `app/` + `manifest.json` hochladen.

Hier liegen keine Daten aus dem Büro: keine Aufgaben, Inventarlisten, Fotos oder PINs.
