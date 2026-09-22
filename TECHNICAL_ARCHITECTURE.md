# FreeRacer — Technical Architecture

_Last updated: Phase 1 (vertical slice)._

## 1. Stack (as found — not changed)

| Concern | Technology |
| --- | --- |
| Language | Plain browser JavaScript (ES2020 classes, no bundler, no modules) |
| Rendering | Three.js **r128** loaded from CDN (`three.min.js`, `GLTFLoader.js`) + vendored post-processing passes in `js/lib/` |
| Physics | Custom, in `js/physics.js` (circuit) and `js/openworld/freeVehiclePhysics.js` (open world) |
| Audio | Procedural WebAudio synth in `js/audio.js` (no audio files, no licensing risk) |
| Persistence | `localStorage` through `js/saveManager.js` (versioned) |
| Entry point | `index.html` → loads scripts in dependency order → `js/game.js` creates `window.Game` on `DOMContentLoaded` |
| Hosting | Static files — GitHub Pages or any static server (`python3 -m http.server`) |
| Tooling | `tools/smoke-test.js` (jsdom + real Three math, stubbed WebGL) boots the whole game headlessly |

There is **no build step**. Every file is a classic script that attaches its public class to `window.*`.
Script order in `index.html` is the dependency graph.

## 2. Two driving models, one game

The original project ("Turbo Rush") is a **spline-rail circuit racer**: a car's state is
`trackU ∈ [0,1)` (progress along a `CatmullRomCurve3`) plus a `lateralOffset`. That enables wall
rides, loops and inverted ceilings, but it cannot represent intersections, U-turns or leaving the
road — i.e. it cannot drive an open world.

Rather than throwing away 18k lines of working code, FreeRacer runs **two vehicle controllers that
share everything else** (car models, save, audio, camera, HUD, post-processing, weather):

```
                    ┌────────────────────────────┐
                    │  Shared: CarModel, Sound,  │
                    │  SaveManager, ChaseCamera, │
                    │  HUD, RenderingPipeline,   │
                    │  Weather, Workshop/Garage  │
                    └──────┬──────────────┬──────┘
                           │              │
   ┌───────────────────────▼───┐   ┌──────▼──────────────────────────┐
   │ CIRCUIT MODE (legacy)     │   │ OPEN WORLD MODE (new)           │
   │ TrackManager (spline)     │   │ RoadNetwork (graph of nodes/    │
   │ ArcadeCarPhysics (u/lat)  │   │   edges → lanes)                │
   │ AIRacer (PID on spline)   │   │ FreeVehiclePhysics (free body)  │
   │ TrackProps/Destructibles  │   │ WorldBuilder (roads, blocks,    │
   │ RaceModes/Replay/Tutorial │   │   props, collision grid)        │
   │ EmeraldHighway traffic    │   │ TrafficSystem (lane followers)  │
   └───────────────────────────┘   │ OpenWorldAI (route followers)   │
                                   │ EventSystem (sprint/…)          │
                                   │ WorldManager (free roam, map,   │
                                   │   discovery, garage entry)      │
                                   └─────────────────────────────────┘
```

Both controllers expose the same **duck-typed interface** consumed by `ChaseCamera`, `HUDManager`,
`SoundEngine` and `RenderingPipeline`:

```
position: Vector3, quaternion: Quaternion, velocity: Vector3, linearAcceleration: Vector3
speed (m/s, signed), maxSpeed, getSpeedKmh(), getNitroPercent()
getForwardVector(), getUpVector(), getRightVector()
isNitroActive, nitroTier, nitroTimingWindow, isDrifting, driftScore, isAirborne, landingImpact
car (CarModel), track (may be null in open world)
saveState(), interpolateVisuals(alpha), update(dt, inputs), applyUpgrades(upgrades)
```

## 3. Game states (`GameEngine.gameState`)

```
TITLE ─► MAIN_MENU ─┬─► FREE_ROAM ◄──────────────► (event countdown / running / results live inside FREE_ROAM)
                    │       │  ▲                     pause menu, settings (PAUSED), garage (WORKSHOP) return here
                    │       ▼  │
                    ├─► WORKSHOP (garage) ── DRIVE ─┘
                    │       └─ CIRCUIT EVENTS ─► MAP_SELECT ─► COUNTDOWN ─► RACING ─► FINISHED   (circuit mode, preserved)
                    └─► CIRCUIT EVENTS ─► MAP_SELECT (same flow)
```

* `TITLE`/`MAIN_MENU` — `js/mainMenu.js`. The open world is built while the title screen is up and used as a
  live cinematic backdrop for the menu (orbiting camera + light ambient traffic).
* `FREE_ROAM` — `js/openworld/openWorldManager.js` owns the loop (its own 120 Hz accumulator), the HUD, the pause
  menu, the results screen, discoveries and the garage marker. Event sub-states (`idle / countdown / running /
  results`) live in `EventSystem.state`.
* `WORKSHOP` — `js/workshop.js` (garage). Buttons: **DRIVE ▶** → free roam (spawns at the garage when you came
  from the world, otherwise at the last saved position), **CIRCUIT EVENTS 🏁** → legacy map select,
  **◀ MAIN MENU**.
* `PAUSED` is only used by the shared settings modal; `GameEngine.settingsReturnState` remembers where to go back.
* Circuit mode keeps its fixed-step loop in `GameEngine.animate()` unchanged.

## 4. Module map

### Shared
| File | Responsibility |
| --- | --- |
| `js/game.js` | `GameEngine`: Three setup, input polling (keyboard/touch/gamepad), state machine, fixed-timestep circuit loop, settings/pause wiring, flow helpers (`enterFreeRoam`, `showGarage`, `goToMainMenu`) |
| `js/mainMenu.js` | Title screen, main menu, driver profile card, credits, profile reset, cinematic backdrop |
| `js/car.js` | `CarModel`: procedural PBR car meshes per `carId`, wheels, lights, exhaust flames, doors/aero animation, `setCustomization()` |
| `js/carData.js` + `js/carDataNeonCoast.js` | `window.CarDatabase` — data-driven vehicle specs (10 cars). `bodyStyle` selects the procedural exterior (`hatch | track | gt | hyper`); `accentColor`, `spokeCount`, `engine.audioProfile` pick trim, rims and engine sound |
| `js/partsData.js` | `PartsCatalog` (8 categories × 5 stages, each stage = multipliers on the modifier vector), `TuningSliders`, `TuningPresets` |
| `js/upgradeSystem.js` | `UpgradeSystem` singleton: installed stages + tuning per car (in the save), tier-scaled costs, `getModifiers()` → one modifier vector consumed by both physics models, display stats (0–100), PR, legacy migration |
| `js/saveManager.js` | Versioned profile v3 (credits, reputation levels, cars, upgrades, cosmetics, event records, discoveries, settings, last position). Migrates legacy `turbo_rush_save_v2`; backs up and resets corrupt data |
| `js/audio.js` | `SoundEngine` procedural audio + music layers + announcer |
| `js/camera.js` | `ChaseCamera` (CHASE / COCKPIT / CINEMATIC); `OpenWorldCamera` in the manager extends it with building-aware placement |
| `js/hud.js` | Circuit HUD (speed, gear, nitro, position, spline minimap) |
| `js/renderingPipeline.js` + `js/lib/*` | HDR/ACES, bloom, lighting profiles (`neon_dusk` added for the open world), quality presets |
| `js/weather.js` | Particle weather + fog/light overrides |
| `js/workshop.js` | Garage UI: turntable, purchase, upgrades, cosmetics, showroom |

### Circuit mode (legacy, preserved)
`js/track.js`, `js/physics.js`, `js/ai.js`, `js/mapData.js`, `js/mapSelect.js`, `js/raceModes.js`,
`js/trackProps.js`, `js/destructibles.js`, `js/racingLine.js`, `js/replay.js`, `js/tutorial.js`,
`js/damage.js`, `js/streaming.js`, `js/multiplayer.js` (lobby button disabled — needs a relay server),
`assets/tracks/emerald_highway/*`, `assets/vehicles/bujji/*`.

### Open world (new, `js/openworld/`)
| File | Responsibility |
| --- | --- |
| `roadNetwork.js` | `RoadNetwork`: nodes/edges → per-edge lane polylines (`sampleLane`, `lanesFrom`), spatial hash, `nearestRoadPoint()`, `surfaceAt()`, Dijkstra `route()`, `buildRoutePolyline()` |
| `districts/apexDowntown.js` | Data: 7×7 node grid, avenue/street/alley edges, plaza, waterfront, garage, spawn, discovery points, bounds |
| `districts/apexDowntownEvents.js` | Data: 5 events (sprint, harbor run, 3-lap circuit, time attack, old-town dash) with routes, opponents, AI skill, rewards, unlock REP |
| `collisionGrid.js` | Static AABB hash grid, `resolveCircle()` for cars vs buildings/props/boundaries |
| `worldBuilder.js` | Builds roads/intersections/sidewalks, 300 merged neon buildings, street lights, trees, stadium, fountain, sea wall, sky dome; feeds the `CollisionGrid`; ground/surface queries |
| `freeVehiclePhysics.js` | Free-body arcade-sim car (bicycle model with lateral slip, gears, drag, handbrake drift, nitro tiers, surface grip, assists, AABB/vehicle collisions, ghost respawn, `applyUpgrades`) |
| `trafficSystem.js` | Pooled civilian cars following lanes, turning at nodes, braking for cars/player, despawn/respawn ring, density presets |
| `openWorldAI.js` | `RouteFollower` + `OpenWorldAIRacer` (pure pursuit, corner speed planning, rubber-band skill, recovery) |
| `eventSystem.js` | Event markers, gate meshes, start prompt, countdown, checkpoint/lap logic, wrong-way/off-route, standings, medals, rewards → save |
| `openWorldHUD.js` | Street name, reputation strip, event panel, checkpoint arrow, rotating road-graph minimap, full map (M) |
| `openWorldManager.js` | Owns free roam: world build, player spawn/respawn, traffic, events, discoveries, garage marker, pause/results/toasts, position persistence, `OpenWorldCamera` |

## 5. Data-driven definitions

* **Vehicles** — `js/carData.js` (`CarDatabase`). Open-world handling reads `physics.*` plus
  `dimensions.curbWeightKg`, `engine.peakPowerKw`, `engine.drivetrain` when present.
* **Parts & tuning** — `js/partsData.js`. A stage is `{ name, effects }` where `effects` multiplies entries of the
  modifier vector `{ power, topSpeed, grip, brake, handling, stability, mass, drag, driftability, rough,
  nitroCapacity, nitroEfficiency, nitroPower }` (all 1.0 = stock). `UpgradeSystem.getModifiers(carId)` folds
  the installed stages and the tuning sliders into one vector; `FreeVehiclePhysics.applyModifiers()` and
  `ArcadeCarPhysics.applyModifiers()` map it onto their own parameters (mass/Iz, acceleration, maxSpeed, cdA,
  brake, tyre μ, steer response, drift multiplier, off-road grip scale, nitro tank/burn/power).
  Cost = `stageBaseCost[stage] × category.costWeight × tierFactor(car.price)`. Legacy `applyUpgrades()` paths
  remain as a fallback when `UpgradeSystem` is absent.
* **Districts** — `js/openworld/districts/*.js` each export a definition:
  `{ id, name, bounds, nodes, edges, plaza, waterfront, garage, spawn, discoveries }`.
* **Events** — `js/openworld/districts/<district>Events.js`: id, name, type (`sprint | circuit | timetrial`),
  tier, laps, route (node ids), opponents, aiSkill, rivalCars, rewards (credits/reputation per position or medal),
  unlockRep.
* **Progression** — reputation levels + titles live in `js/saveManager.js` (`REP_LEVELS`), rewards in event data.

## 6. Save schema (v3)

Key `freeracer_save_v3` (legacy `turbo_rush_save_v2` is migrated on first load; unreadable JSON is copied to
`freeracer_save_corrupt_backup` and a fresh profile is created — `SaveManager.recoveredFromCorruption`).

```
{
  schemaVersion: 3, userId, createdAt, updatedAt,
  cash, totalEarnings, totalSpent, selectedCarId, unlockedCars[], unlockedTracks[], tutorialCompleted,
  bestTimes{}, ghostLaps{},                                   // circuit mode
  upgrades{carId→{stat→level}} (legacy, migrated once), cosmetics{carId→{…}},
  parts{carId→{engine,drivetrain,tires,brakes,suspension,aero,weight,nitro: 0–5}},
  tuning{carId→{brakeBias,downforce,finalDrive,steering,rideHeight: −1..1}}, partsMigrated,
  progress: { reputation, eventRecords{eventId→{bestTime,bestPosition,medal,plays,wins,lastPlayed}},
              discoveries[], distanceKm, driftPoints, eventsPlayed, eventsWon, playtimeSec,
              assistLevel, lastDistrict, lastPosition{x,z,yaw}, introSeen },
  settings: { cameraMode, fov, enableShake, graphicsPreset, masterVol, musicVol, sfxVol, voiceVol,
              racingLine, racingLineOpacity, trafficDensity, minimapRotate }
}
```

## 7. Performance notes

* Physics at a fixed 120 Hz with an 8-substep cap; rendering interpolates.
* World geometry: buildings and sidewalks are merged into a handful of `BufferGeometry`s per
  material (`BufferGeometryUtils`-free manual merge) — the downtown district renders in
  < 40 draw calls excluding cars.
* Traffic and AI are pooled; nothing is allocated per frame in physics (scratch vectors).
* Collision: static AABBs live in a uniform grid (cell 40 m); dynamic bodies use circle sweeps.
* Quality presets adjust pixel ratio, shadows, bloom, traffic density and draw distance.

## 8. Testing

```
# one-off setup (outside the repo)
mkdir -p /tmp/frtest && cd /tmp/frtest && npm i jsdom@24 three@0.128.0
# run
FREERACER_NODE_MODULES=/tmp/frtest/node_modules node tools/smoke-test.js --frames=600
```
The harness boots `index.html`, drives title → garage → free roam → event → results → garage,
and fails on any console error, uncaught exception or NaN in the player transform.
