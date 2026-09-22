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
* **Garage** — paint/finish/rims/underglow/flame cosmetics, all applied in the open world.

## New in v0.3.0 (Phase 2 — core vehicle system)

* **10 cars, 8 fictional manufacturers** — Kinetix, Veloce, Ordnance Hero Works, Radian (Sprint 4 rally
  hatch), Veyra (Corsair drift coupe), Monarch (Sovereign GT muscle), Voltrix (Ion electric), Apex Forge
  (Halo hypercar). Every car is a data entry (`js/carData.js`, `js/carDataNeonCoast.js`) that picks a
  procedural body style, engine audio profile and physics set.
* **Part-based upgrades** — Engine, Drivetrain, Tyres, Brakes, Suspension, Aero, Weight, Nitro, each with
  five named stages and honest trade-offs (aero adds drag, sticky tyres resist sliding, stripping weight
  makes the car twitchier). Costs scale with the car's tier; no real-money anything.
* **Tuning** — brake bias, downforce, final drive, steering and ride height sliders plus Balanced / Grip /
  Drift / Sprint / Off-Road presets. Free to change, previewed live on the stat bars.
* **Garage stat bars** show before/after ghosts and the PR change when you hover a part.
* **Test drive** any locked car in Apex Downtown before buying it (events disabled during the test).
* Old saves keep their upgrades: legacy stat levels migrate once into part stages.
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
js/partsData.js            parts catalogue (8 categories × 5 stages), tuning sliders & presets
js/upgradeSystem.js        UpgradeSystem: stages, costs, tuning, modifier vector, PR
js/carDataNeonCoast.js     Phase 2 roster additions (Radian, Veyra, Monarch, Voltrix, Apex Forge)
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
