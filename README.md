# Asteroid-Arcade

Ein kleines, sofort spielbares **Asteroids-Arcade-Spiel** als statische Website mit reinem HTML, CSS und JavaScript.

## Features

- 2D-Canvas-Gameplay im Retro-Arcade-Stil
- Trägheitsbasierte Schiffsteuerung (Rotation + Schub)
- Wrap-around an Bildschirmrändern
- Asteroiden mit zufälliger Richtung, Geschwindigkeit und Form
- Asteroiden splitten bei Treffern in kleinere Teile
- Score-System
- 3 Leben
- Game-Over-Screen mit Restart (Enter)
- Sauberer Reset nach Neustart
- Keine Build-Tools, kein Backend, keine externen Abhängigkeiten

## Lokal starten

Da das Projekt vollständig statisch ist, gibt es zwei einfache Wege:

1. Datei direkt öffnen:
   - `index.html` im Browser öffnen.
2. Optional via lokalem Static-Server (empfohlen):
   - Im Projektordner z. B. `python3 -m http.server 8080`
   - Dann im Browser `http://localhost:8080` öffnen.

## GitHub Pages / statische Vorschau

1. Repository nach GitHub pushen.
2. In GitHub: **Settings → Pages** öffnen.
3. Unter **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - Branch auswählen (z. B. `main`) und Ordner `/ (root)`
4. Speichern.
5. Nach kurzer Zeit ist die Seite über die angezeigte GitHub-Pages-URL erreichbar.

## Steuerung

- **Pfeil links/rechts**: Schiff rotieren
- **Pfeil hoch**: Schub
- **Leertaste**: Schießen
- **Enter** (bei Game Over): Neustart

## Projektstruktur

```text
.
├── index.html   # Grundstruktur + Canvas + HUD
├── style.css    # Retro-Layout und Styling
├── script.js    # Spiel-Logik (Loop, Input, Entities, Rendering, Kollisionen)
└── README.md    # Doku
```

## Hinweise zur Implementierung

Der Code in `script.js` ist bewusst klar gegliedert in:

- Initialisierung
- Game Loop (`requestAnimationFrame`)
- Input Handling
- Entity-Update (Schiff, Kugeln, Asteroiden, Partikel)
- Collision Detection
- Rendering
- HUD-/Status-Updates

Dadurch bleibt das Projekt leicht verständlich und gut erweiterbar.
