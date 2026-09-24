# FreeRacer — Development Roadmap

Legend: ✅ done · 🔄 in progress · ⬜ planned · ⚠️ limitation

## Phase 0 — Project audit ✅
- ✅ Stack identified (Three.js r128, plain JS, localStorage, procedural audio, static hosting)
- ✅ Headless smoke test harness (`tools/smoke-test.js`) — boots the game, runs a race, checks save
- ✅ Working systems catalogued (see FREERACER_GDD.md §2)
- ✅ Broken/missing: no title/menu, spline-only physics, no reputation, save unversioned,
  `/api/profile` 404 spam, nitro flame colour cosmetic not applied, multiplayer button without server
- ✅ Docs created: FREERACER_GDD.md, TECHNICAL_ARCHITECTURE.md, DEVELOPMENT_ROADMAP.md

## Phase 1 — Polished vertical slice ✅ (v0.2.0)
| Item | Status | Notes |
| --- | --- | --- |
| Title screen + main menu (Drive / Garage / Circuit Events / Settings / Credits, profile card, reset) | ✅ | `js/mainMenu.js`; world builds behind the title screen and is the menu backdrop |
| Garage rebranded, DRIVE ▶ / MAIN MENU / CIRCUIT EVENTS buttons | ✅ | `js/workshop.js`, `index.html` |
| Drivable cars in free-body physics | ✅ | `js/openworld/freeVehiclePhysics.js`; all 5 existing cars drive, assists Beginner/Standard/Expert |
| Basic customization | ✅ | existing cosmetics applied to the free-roam car |
| Basic performance upgrades | ✅ | existing 7-stat system → `applyUpgrades()` of the new controller |
| One open-world district (Apex Downtown) | ✅ | 7×7 road graph, 300 buildings, plaza, waterfront, stadium, garage, sky dome, static collision |
| Events in the world | ✅ | 5 events: 2 sprints, 1 harbor run, 1 three-lap circuit, 1 time attack; markers, gates, countdown, standings |
| Traffic | ✅ | pooled lane followers with car/player braking, density Off/Light/Normal/Heavy |
| AI opponents in events | ✅ | route-following, corner planning, skill per event, rubber band |
| Credits + reputation (10 levels, titles) | ✅ | rewards per position/medal + discoveries; unlocks events by REP |
| Save/load v3 with versioning + migration + corruption handling | ✅ | `js/saveManager.js`; legacy Turbo Rush save imported |
| Results screen | ✅ | position/medal, time, standings, rewards, level progress, retry/continue/garage |
| Pause menu | ✅ | resume, restart/abandon event, garage, settings, main menu, assists, traffic density |
| Keyboard + gamepad | ✅ | existing normalized input; Start = pause, Y (stopped at marker) = interact, D-pad ↑ camera, D-pad ↓ map |
| Minimap from road network + full map (M) | ✅ | `js/openworld/openWorldHUD.js`, rotation toggle (N) |
| Discovery points | ✅ | 8 landmarks — credits + REP on first visit |
| Last position persisted (Continue) | ✅ | saved every 20 s and on exit |
| Multiplayer button | ⚠️ | disabled and labelled "unavailable (no server)" |
| Headless regression test | ✅ | `tools/smoke-test.js` — title → menu → free roam → event → results → pause/garage → circuits → save |

Known Phase 1 limitations: no real-browser GPU profiling was possible in the build sandbox (see TESTING notes in
the session report); the world is flat (no heightmap yet); the rival roster reuses existing car meshes.

## Phase 2 — Core vehicle system 🟨 (v0.3.0 — core done, cosmetics/off-road pending)
- ✅ Roster expanded to 10 cars / 8 manufacturers (`js/carDataNeonCoast.js`): Radian Sprint 4 (Rally Hatch, AWD), Veyra Corsair (Drift Coupe, RWD), Monarch Sovereign GT (Muscle GT), Voltrix Ion (Electric Sport, AWD), Apex Forge Halo (Hypercar flagship). Cars pick their procedural body via data (`bodyStyle`), plus per-car accent colour and spoke count.
- ✅ Part-based upgrades (`js/partsData.js`, `js/upgradeSystem.js`): 8 categories × 5 named stages with trade-offs (aero adds drag, tyres cost driftability, weight reduction costs stability…). Legacy 10-level stat upgrades migrate once into stages.
- ✅ Modifier vector drives both physics models (`FreeVehiclePhysics.applyModifiers`, `ArcadeCarPhysics.applyModifiers`) — no more per-stat multipliers scattered across code.
- ✅ Tuning (free, per car): brake bias, downforce, final drive, steering, ride height + presets Balanced / Grip / Drift / Sprint / Off-Road.
- ✅ Garage: live stat bars with hover before/after ghosts and PR delta, Parts/Tuning sub-tabs, wallet display, stage pips.
- ✅ Test-drive of locked cars from the garage (events disabled, selection unchanged, returns to the garage focused on that car).
- ⬜ Off-Road Truck archetype + dedicated mesh (arrives with Red Mesa Canyon in Phase 3)
- ⬜ Dyno / before-after graph view (bars with deltas ship now; graph is cosmetic)
- ⬜ Extended cosmetics (secondary paint, body kits, spoilers, wheel size, tint, plates, decals)
- ⬜ Per-drivetrain handling personality pass (FWD/RWD/AWD launch + throttle-steer differences)

## Phase 3 — Open-world expansion ⬜
- ⬜ Remaining six districts as data files + district-specific builders (terrain heightmap for canyon/mountain)
- ⬜ Highways/bridges/tunnels connecting districts; district unlocks by reputation
- ⬜ Map filters, fast travel to discovered garages
- ⬜ Day/night cycle and weather in free roam (pipeline already supports profiles)
- ⬜ Streaming: district chunk load/unload, LOD for buildings, traffic density by quality preset

## Phase 4 — Content & progression ⬜
- ⬜ Rival crews (Harbor Kings, Redline Syndicate, Canyon Wolves, Neon Circuit, Iron District Crew) with leaders, territories and story beats
- ⬜ More event types (drag, drift, speed trap, jump, off-road, elimination, rival, tournament, delivery)
- ⬜ Championship finale
- ⬜ Progression screen, collectibles, photo spots
- ⬜ AI variety (styles, mistakes, recovery), heat/pursuit system last

## Phase 5 — Polish & release ⬜
- ⬜ Controller navigation for every menu, remappable controls
- ⬜ Accessibility panel (colorblind indicators, text scale, motion reduction, subtitles for announcer)
- ⬜ Performance pass on low-end (dynamic resolution, shadow cascades off)
- ⬜ Full new-game → endgame playtest, browser matrix

## Known limitations (honest list)
- No headless browser in the CI sandbox: rendering is verified by logic-level smoke tests; visual QA must be done in a browser.
- Three.js is loaded from a CDN; offline play requires vendoring `three.min.js`.
- Multiplayer server is not part of this repository.
