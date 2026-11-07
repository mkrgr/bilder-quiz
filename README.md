# Zoom-Bilderquiz

[Spielen](https://mkrgr.github.io/bilder-quiz/)

Ein Bild wird stark vergrößert gezeigt und alle 3 Sekunden ein Stück herausgezoomt,
bis das ganze Bild zu sehen ist und die Lösung erscheint. Wer früher rät, bekommt mehr Punkte
(Stufe 1 = 6 Punkte … letzte Stufe = 1 Punkt).

## Teams & Rangliste

- Vor dem Spiel Teams anlegen (bis zu 8), Namen eintippen und Farbe wählen. Teams werden im Browser gemerkt.
- Anzahl Bilder pro Spiel wählen (5, 10, 15 oder 20).
- Nach jeder Auflösung tippt man an, welches Team es wusste – bei Gleichstand mehrere.
  Alle gewählten Teams bekommen die Punkte der aktuellen Stufe. „Niemand“ vergibt keine Punkte.
- Am Ende: Rangliste für dieses Spiel und die ewige Rangliste (Punkte, Siege, Spiele).
  Die ewige Rangliste ordnet nach Teamnamen zu und wird nur in diesem Browser gespeichert.

## Starten

Die Seite muss über einen kleinen Webserver laufen (sonst darf der Browser `begriffe.txt` nicht lesen):

```bash
cd ~/Documents/bilder-quiz && python3 -m http.server 8765
```

Dann im Browser öffnen: http://localhost:8765

## Begriffe bearbeiten – `begriffe.txt`

```
[🎬 Filmfigur]          ← neue Kategorie
Pumuckl                 ← Lösung = Suchbegriff
Igel | Braunbrustigel   ← Lösung | genauer Suchbegriff
Pikachu | en:Pikachu    ← "en:" = nur englische Wikipedia fragen
# Kommentar
```

## Bildquelle

In `config.js` einstellbar:

- **`wikipedia`** (Standard, kein Schlüssel nötig): nimmt das Hauptbild des Wikipedia-Artikels
  (erst deutsch, dann englisch). Kindgerecht und zuverlässig.
- **`google`**: echte Google-Bildersuche über die *Programmable Search Engine* mit SafeSearch.
  Dafür braucht man einen API-Schlüssel und eine Suchmaschinen-ID (`cx`):
  1. https://programmablesearchengine.google.com → neue Suchmaschine, „Gesamtes Web durchsuchen“ und „Bildersuche“ einschalten → ID kopieren (`googleCx`).
  2. https://console.cloud.google.com → „Custom Search API“ aktivieren → API-Schlüssel erstellen (`googleApiKey`).
  3. In `config.js` `source: "google"` setzen.

  Hinweise: 100 Suchen pro Tag kostenlos. Google nimmt für diese API keine Neukunden mehr an
  und will sie bis Anfang 2027 abschalten – daher ist Wikipedia der Standard.
  Der Schlüssel steht im Browser-Code; die Seite also nicht öffentlich ins Netz stellen.
  Google-Bilder können außerdem Text/Wasserzeichen enthalten, die die Lösung verraten.

## Weitere Einstellungen (`config.js`)

- `zoomSteps`: Zoomfaktoren je Stufe, z. B. `[10, 6, 4, 2.5, 1.6, 1]`
- `secondsPerStep`: Sekunden pro Stufe (Standard 3)
