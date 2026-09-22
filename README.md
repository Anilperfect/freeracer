# FreeRacer — Neon Coast

An original open-world arcade racing game for desktop browsers. Plain JavaScript + Three.js (r128),
no build step — every car, brand, district and track is fictional and generated procedurally.

**Play:** serve the folder with any static server and open `index.html`

```bash
cd freeracer
python3 -m http.server 8080      # then visit http://localhost:8080
```

## What's in v0.2.0 (Phase 1 vertical slice)

* **Title → Main menu → Drive** — free roam in **Apex Downtown**, the first district of Neon Coast
  (7×7 road grid, 300 neon buildings, plaza, waterfront, stadium, garage).
* **Free-body driving model** — gears, drift/handbrake, nitro tiers, surface grip, collisions with
  buildings/props/traffic, assists (Beginner / Standard / Expert).
* **5 street events** — sprints, a harbor run, a 3-lap circuit and a time attack, unlocked by reputation.
  Route markers, gates, countdown, standings, medals, results screen.
* **Traffic** and **AI rivals** that follow the road network.
* **Credits + Reputation** (10 levels) → unlocks; **discovery landmarks**.
* **Garage** — 5 cars (Kinetix, Veloce, Ordnance Hero Works), paint/finish/rims/underglow/flame,
  7-stat upgrades — all applied in the open world.
* **Circuit Events** — the original anti-gravity circuits (4 tracks, 5 modes, weather, replay) are kept
  intact and reachable from the main menu.
* **Save v3** in localStorage with schema versioning, legacy-save migration and corrupt-data recovery.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Accelerate / Brake-reverse | W / ↑ · S / ↓ | RT (or A) · LT (or X) |
| Steer | A / D · ← / → | Left stick / D-pad ← → |
| Handbrake | Space | B / LB |
| Nitro | Shift | RB (or Y while moving) |
| Interact (start event / garage) | E or Enter | Y while stopped at a marker |
| Reset to road | R | Back |
| Camera | C | D-pad ↑ |
| Full map / minimap rotation | M / N | D-pad ↓ / — |
| Pause | Esc | Start |

## Project layout

```
index.html                 screens + script order
css/style.css
js/game.js                 GameEngine (state machine, circuit loop, settings)
js/mainMenu.js             title, main menu, credits
js/openworld/              road network, district data, world builder, physics, traffic, AI,
                           events, HUD, manager (free roam)
js/*.js                    garage, cars, audio, camera, circuit mode (track/physics/ai/…)
tools/smoke-test.js        headless regression test (jsdom + Three.js math, stubbed WebGL)
FREERACER_GDD.md           game design document
TECHNICAL_ARCHITECTURE.md  systems & data formats
DEVELOPMENT_ROADMAP.md     phases and status
```

## Headless test

```bash
mkdir -p /tmp/frtest && cd /tmp/frtest && npm install jsdom@24 three@0.128.0
cd /path/to/freeracer
FREERACER_NODE_MODULES=/tmp/frtest/node_modules node tools/smoke-test.js --frames=600 --soak=60
```

## Notes

* No real-money purchases; progress is stored only in your browser.
* Multiplayer rooms need a relay server that is not part of this repository — the button is disabled.
