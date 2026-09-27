# Offiziersskat

Browser-App für Offiziersskat, die Skat-Variante für zwei Personen. Sie hat zwei Modi:

- **2 Spieler** – zwei Personen spielen an einem Gerät. Weil alle spielbaren Karten offen liegen, muss niemand wegschauen. Mit der Option „Gegenüber sitzen“ wird die obere Seite um 180° gedreht, praktisch für ein Tablet, das zwischen den Spielern liegt.
- **Gegen Computer** – in drei Stärken:
  - *Leicht*: Heuristik mit gelegentlichen Zufallszügen.
  - *Mittel*: Heuristik mit einem Stich Vorausschau.
  - *Stark*: Monte-Carlo-Suche. Die verdeckten Karten werden hunderte Male zufällig verteilt, jeder mögliche Zug wird bis zum Ende durchgespielt, und der Zug mit dem besten Durchschnitt wird gewählt.

## Starten

Es gibt keine Abhängigkeiten und keinen Build-Schritt. Du kannst einfach `index.html` im Browser öffnen oder einen lokalen Server starten:

```sh
python3 -m http.server 8000   # dann http://localhost:8000 öffnen
```

Punktestand und laufendes Spiel werden im `localStorage` gespeichert. Ein unterbrochenes Spiel kannst du über „Gespeichertes Spiel fortsetzen“ weiterspielen.

Live unter **https://skat.kesch.dev** (GitHub Pages, Domain siehe `CNAME`).

### Offline & als App installieren

Die App ist eine PWA. Nach dem ersten Aufruf funktioniert sie auch ohne Internet (`sw.js`).

- **iPhone/iPad:** In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.
- **Android/Chrome:** Im Menü „App installieren“ wählen.

Neue Versionen lädt die App im Hintergrund und zeigt sie beim nächsten Start an.

## Regeln (Kurzfassung)

- 32 Karten. Jeder Spieler bekommt 8 Stapel, jeweils eine verdeckte Karte mit einer offenen darauf.
- Die Vorhand (Nicht-Geber) sagt anhand ihrer offenen Karten an: Karo, Herz, Pik, Kreuz oder Grand.
- Rangfolge wie beim Skat, Buben sind Trumpf. Es gilt Bedienpflicht mit den offenen Karten.
- Nach jedem Stich wird die verdeckte Karte unter einer gespielten Karte aufgedeckt.
- Wer mehr als 60 Augen hat, gewinnt. Er bekommt Grundwert (9/10/11/12/24) × (1 + Schneider + Schwarz). Bei 60:60 ist die Runde unentschieden.

Die vollständigen Regeln stehen in der App unter „?“.

## Entwicklung

```
js/engine.js   Spielregeln (rein, ohne DOM, auch in Node nutzbar)
js/ai.js       Computergegner
js/ui.js       Oberfläche
tests/         Engine-Tests, KI-Simulation
```

```sh
node --test tests/*.test.js     # Engine-Tests
node tests/sim.js hard medium 100   # KI-Stärken gegeneinander antreten lassen
```
