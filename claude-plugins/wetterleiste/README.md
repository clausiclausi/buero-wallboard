# Wetterleiste

Eine schmale Leiste über dem Eingabefeld von Claude Code, die zeigt, wie voll das
Kontextfenster des Gesprächs ist. Das „Wetter“ steht für die Auslastung: Sonnig
unter 25 %, Heiter, Bewölkt, Regnerisch ab 65 % und Gewitter ab 80 %. Dazu kommen
Prozent und Tokens, ein kleiner Verlauf der letzten Runden mit der Änderung zur
vorigen Runde, ob Auto-Compact an ist, die Uhrzeit der letzten Messung und eine
Taste „Jetzt kompaktieren“, die dasselbe macht wie `/compact`. Wo die Oberfläche
keine Leiste zeichnen kann, steht dieselbe Info als Statuszeile unter der Eingabe.

Es wird nichts ins Internet geschickt.

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
