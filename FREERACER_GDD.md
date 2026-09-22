# FreeRacer — Game Design Document

_Original IP. Fictional manufacturers, cities and crews. No real brands, maps, music or assets._

## 1. Vision

FreeRacer is an open-world driving and car-culture game. You arrive in **Neon Coast** with a
basic car and a small garage, explore a connected region, discover events, beat rival drivers,
earn **credits** and **reputation**, buy and build cars, and become the most respected racer in
the region.

Player fantasy: _"I built my own car, tuned it for my driving style, explored a living open world,
and became the fastest driver in the city."_

Feel targets: fast, stylish, responsive, personal, rewarding, easy to start, hard to master.
Handling is an **arcade-simulation hybrid** (see §6).

## 2. Phase 0 audit — what existed ("Turbo Rush")

| Area | State found | Decision |
| --- | --- | --- |
| Rendering | Three.js r128 + HDR/bloom pipeline, weather, lighting profiles | Keep |
| Cars | 5 procedural PBR cars (Kairo Pulse S, Veloce V10 Corsa, V8 GT, V12 Stradale, Bujji) with doors/aero/lights | Keep; extend roster & customization |
| Physics | 120 Hz **spline-rail** model (`trackU` + lateral offset). Great for stunt circuits, cannot drive intersections | Keep for circuits; add free-body model for the open world |
| Tracks | 4 stunt circuits (Emerald Highway, Helios Rift, Drowned Meridian, Thornwild Crown) | Keep as "Circuit Events" |
| AI | PID + curvature speed planner on spline | Keep for circuits; new route-following AI for open world |
| Traffic | Emerald Highway only, spline-bound | Keep; new lane-graph traffic for open world |
| Garage | Turntable, purchase, 7-stat ×10-level upgrades, paint/finish/rims/underglow/flame, showroom | Keep, rebrand, add DRIVE flow |
| Economy | Credits (₡), per-race earnings breakdown | Keep; add reputation |
| Save | localStorage v2, no versioning, no corruption handling, hits `/api/profile` (404 spam offline) | Migrate to v3 with versioning |
| Multiplayer | WebSocket client with no server in repo | Keep code, **mark button as unavailable** (no fake buttons) |
| Menus | Boots straight into the garage; no title/main menu; settings modal doubles as pause | Add title, main menu, proper pause menu |
| Bugs found | `nitroFlameColor` cosmetic never applied (`setCustomization` expected `nitroColor`); ESC handled only in RACING; caliper colour has no UI | Flame colour + ESC fixed in Phase 1; caliper UI deferred to Phase 2 |

Result: **stable, playable circuit racer** with strong car/audio/rendering foundations and no
open world. Phase 1 builds the open world on top without breaking circuit mode.

## 3. Core loop

1. Garage → pick car → customize → upgrade
2. **DRIVE** into Neon Coast (free roam)
3. Discover events, shops, landmarks (discovery XP)
4. Drive into an event marker → countdown → race → results
5. Earn credits + reputation; unlock cars, parts, districts, events
6. Return to garage (drive into it or from the pause menu) and improve the build
7. Repeat toward the FreeRacer Championship

The HUD always shows: current objective, nearest event, credits, reputation level, checkpoint /
timer during events.

## 4. World — Neon Coast

Districts (data-driven, each its own file under `js/openworld/districts/`):

| District | Identity | Phase |
| --- | --- | --- |
| **Apex Downtown** | Neon high-rises, tight grid, underpass, plaza, waterfront edge | **1 (built)** |
| Harborline | Docks, containers, cranes, industrial sprints | 3 |
| Sunspire Coast | Beaches, coastal highway, tunnels, sunset speed | 3 |
| Ironworks | Factories, drift arenas, technical corners | 3 |
| Red Mesa Canyon | Desert, dirt, jumps, off-road | 3 |
| Pinecrest Pass | Forest, hairpins, fog, downhill | 3 |
| Skyway Airfield | Runways, drag, test track | 3 |

World rules: every district has a visual identity; roads connect meaningfully; multiple routes
between hubs; short/medium/long routes; landmarks for navigation; natural boundaries; minimap +
full map with filters; exploration rewarded (discovery points give credits + reputation).

## 5. Vehicles

Fictional manufacturers: **Kinetix Dynamics**, **Veloce Performance**, **Ordnance Hero Works**
(existing), plus **Kairo**, **Voltrix**, **Radian**, **Monarch**, **Apex Forge** (planned).

Target roster (8 archetypes): Beginner Street, Compact Tuner, Muscle, Drift Coupe, Rally Hatch,
Off-Road Truck, Supercar, Hypercar. Existing cars map to: Kairo Pulse S (Compact Tuner /
starter), V8 GT (Muscle-GT), V10 Corsa (Supercar), V12 Stradale & Bujji (Hypercar).

Each car is defined in `CarDatabase` with dimensions, engine, drivetrain, stats, physics profile,
audio profile and anchors. Personality comes from mass, drivetrain, power curve, grip balance and
drift multiplier — never just "bigger numbers".

## 6. Driving model (open world)

* Longitudinal: engine power curve × gear ratios × drivetrain efficiency − aero drag − rolling
  resistance; brakes with ABS-like pressure ramp; reverse.
* Lateral: front/rear slip-angle tire model with saturation (simplified Pacejka), yaw inertia,
  speed-sensitive steering, counter-steer support; handbrake cuts rear grip → drift with score.
* Surfaces: asphalt / sidewalk / grass with different μ; curbs bump.
* Air: ramps launch; gravity; air control; landing impact.
* Assists (settings): Beginner / Standard / Expert → steering assist, stability, traction, ABS.
* Nitro: 3-tier system inherited from circuit mode (standard / precision / overdrive).
* Collisions: buildings & props (AABB grid), traffic & AI (circle/OBB sweep), world bounds.
* Reset (R) → nearest road point facing the road direction; respawn to last checkpoint in events.

## 7. Events

Types (Phase 1 built: **Sprint, Circuit (laps), Time Attack**; others Phase 4): Drag,
Drift challenge, Speed trap, Jump, Off-road, Elimination, Rival, Tournament, Delivery, Pursuit,
Free-roam challenge, Photo.

Each event: name, location, type, difficulty, recommended class, entry requirement, credits
reward table by position, reputation reward, best time, medals (gold/silver/bronze by time),
route (checkpoints), AI opponents, results screen. Rules: clear checkpoints, wrong-way detection,
restart, replayable, no rubber-banding (AI speed comes from difficulty, not player position).

## 8. Progression & economy

* **Credits (₡)** — race placement, completion bonus, drift bonus, discovery, medals.
* **Reputation (REP)** — event completion, wins, discovery. Levels: Rookie → Local → Known →
  Respected → Feared → Legend. Levels unlock cars, districts and event tiers.
* Economy targets: first upgrade affordable after 1 event; new car after ~4–6 events; no
  single-event grinding required (events pay comparably, medals add bonuses).
* No real-money purchases.

## 9. UI

Automotive dark theme: carbon/matte backgrounds, neon cyan primary, magenta accent, Orbitron
headings / Inter + Rajdhani body. Screens (Phase 1 ✓): Title ✓, Main menu (Drive continues at the last
position; profile reset) ✓, Garage ✓, Vehicle select ✓, Customization ✓, Upgrades ✓, Full map (M) ✓,
Event prompt ✓, Countdown ✓, HUD ✓, Pause menu ✓, Results ✓, Settings ✓, Controls (in pause) ✓,
Credits ✓. Planned: dedicated tuning screen, progression screen, accessibility panel.

Rule: **no fake buttons** — anything not implemented is disabled with an "unavailable" label.

## 10. Audio

Procedural engine/turbo/nitro/screech/impact, UI beeps, countdown, victory, announcer (speech
synthesis where available) and a layered synth soundtrack with intensity states — all original,
generated at runtime; no licensed material.

## 11. Definition of done (tracked in DEVELOPMENT_ROADMAP.md)

New game → garage → choose/customize/upgrade → free roam multiple districts → find & complete
events with working AI/traffic → rewards & progression → unlocks → reliable save → map/minimap →
complete menus, no fake buttons, no console errors, smooth performance, enjoyable handling.
