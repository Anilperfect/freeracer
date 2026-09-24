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

Fictional manufacturers (all in-game as of v0.3.0): **Kinetix Dynamics**, **Veloce Performance**,
**Ordnance Hero Works**, **Radian Motors**, **Veyra Automotive**, **Monarch Motorworks**,
**Voltrix Dynamics**, **Apex Forge**.

| Car | Maker | Archetype | Drive | Price | Personality |
| --- | --- | --- | --- | --- | --- |
| Kairo Pulse S | Kinetix | Compact Tuner (starter) | FWD | free | forgiving, nimble, low top end |
| Veloce V10 Corsa | Veloce | Supercar | RWD | free | balanced all-rounder |
| Radian Sprint 4 | Radian | Rally Hatch | AWD | 9,000 | launches hard, unbothered by kerbs/dirt |
| Veyra Corsair | Veyra | Drift Coupe | RWD | 12,000 | quick rack, loose rear, low stability |
| Veloce V8 GT | Veloce | Grand Tourer | RWD | — | heavy, stable, strong brakes |
| Monarch Sovereign GT | Monarch | Muscle GT | RWD | 22,000 | huge straight-line pace, lazy turn-in |
| Voltrix Ion | Voltrix | Electric Sport | AWD | 28,000 | instant torque, heaviest car, silent whine |
| Veloce V12 Stradale | Veloce | Hypercar | AWD | — | high downforce, sharp |
| Apex Forge Halo | Apex Forge | Hypercar (flagship) | AWD | 80,000 | best at everything — the end-game goal |
| Bujji | Ordnance Hero Works | Armoured hyper | AWD | — | showcase model |

Still to add: Off-Road Truck (with Red Mesa Canyon). Each car is a `CarDatabase` entry with dimensions,
engine, drivetrain, stats, physics profile, audio profile, anchors and a procedural `bodyStyle`.
Personality comes from mass, drivetrain, power, grip balance and drift multiplier — never just
"bigger numbers".

### Parts (8 categories × 5 stages, with trade-offs)

| Category | Stages | Gains | Costs |
| --- | --- | --- | --- |
| Engine | ECU Remap → Intake & Exhaust → Hybrid Turbo → Forged Bottom End → Race Engine | power, top speed | a little mass |
| Drivetrain | Sport Clutch → Short-Shift Kit → Limited-Slip Diff → Carbon Driveshaft → Sequential Gearbox | traction (grip), power delivery | — |
| Tyres | Sport Compound → Semi-Slicks → Track Slicks → Race Compound → Adaptive Compound | grip, braking | driftability, a touch of top speed |
| Brakes | Performance Pads → Slotted Discs → Big Brake Kit → Carbon-Ceramic → Race ABS Module | braking, stability | small mass |
| Suspension | Lowering Springs → Sport Dampers → Coilovers → Anti-Roll Kit → Race Suspension | handling, stability | rough-surface grip |
| Aero | Front Splitter → Rear Spoiler → Flat Underbody → GT Wing → Active Aero Kit | grip at speed, stability | drag (top speed) |
| Weight Reduction | Lightweight Wheels → Carbon Panels → Interior Delete → Polycarbonate Glass → Carbon Tub | everything via mass | stability |
| Nitro | Wet Kit → Twin Bottles → Direct Port → Progressive Controller → Overdrive Cell | tank, efficiency, hit | — |

Cost per stage = base (₡1,200 → ₡10,500) × category weight × car tier factor. A fully built starter costs
about ₡110k, the Halo about ₡240k — earned only through driving, never bought with real money.

### Tuning (free, per car)

Brake bias, downforce, final drive, steering, ride height (−1…+1), plus presets Balanced / Grip / Drift /
Sprint / Off-Road. Tuning is shown live on the garage stat bars so trade-offs are obvious before driving.

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
