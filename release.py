#!/usr/bin/env python3
"""Erzeugt manifest.json (Version + SHA-256 aller Dateien unter app/) für die Update-Funktion.
Aufruf: python3 release.py   (Version aus app/version.json, Patch-Notes aus app/changelog.json)"""
import hashlib, json, os
root = os.path.dirname(os.path.abspath(__file__))
app = os.path.join(root, 'app')
version = json.load(open(os.path.join(app, 'version.json')))['version']
entry = next((e for e in json.load(open(os.path.join(app, 'changelog.json'), encoding='utf-8')) if e['version'] == version), None)
if not entry: raise SystemExit(f'In app/changelog.json fehlen die Patch-Notes für {version}')
files = {}
for d, _, names in os.walk(app):
    for n in sorted(names):
        full = os.path.join(d, n)
        rel = os.path.relpath(full, app).replace(os.sep, '/')
        files[rel] = hashlib.sha256(open(full, 'rb').read()).hexdigest()
# notes: kurzer Text für Version 1.1.0, changes: Liste für neuere Versionen
notes = ''
for c in entry['changes']:
    if len(notes) + len(c) + 1 > 300: break
    notes = (notes + ' ' + c).strip()
json.dump({'version': version, 'notes': notes, 'changes': entry['changes'], 'files': dict(sorted(files.items()))},
          open(os.path.join(root, 'manifest.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(f'manifest.json für Version {version} mit {len(files)} Dateien geschrieben')
