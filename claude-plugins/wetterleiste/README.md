# Wetterleiste

Eine schmale Leiste über dem Eingabefeld von Claude Code. Sie zeigt das aktuelle
Wetter in Hannover, wie voll das Kontextfenster des Gesprächs ist (Prozent und
Tokens), einen kleinen Verlauf der letzten Runden mit der Änderung zur vorigen
Runde, ob Auto-Compact an ist, und die Uhrzeit der letzten Messung. Wo die
Oberfläche keine Leiste zeichnen kann, steht dieselbe Info als Statuszeile unter
der Eingabe.

Das Wetter kommt von Open-Meteo (kostenlos, ohne Schlüssel) und wird alle
30 Minuten aktualisiert.

## Installieren

Im Terminal in einer Claude-Code-Sitzung:

```
/plugin install wetterleiste --marketplace clausiclausi/buero-wallboard
```

Die Frage „Add marketplace?“ mit `y` bestätigen, dann den vorgeschlagenen
Bereich (User) mit Enter wählen.

Aus einer Shell:

```
claude plugin install wetterleiste --marketplace clausiclausi/buero-wallboard
```

In der Desktop-App, wo `/plugin` nicht läuft: auf **+** neben dem Eingabefeld
klicken, dann **Plugins**, **Add marketplace** mit `clausiclausi/buero-wallboard`,
dann **Add plugin** und `wetterleiste` wählen.
