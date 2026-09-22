/**
 * FreeRacer - Apex Downtown event roster (data only).
 * ---------------------------------------------------------------------------
 * Routes are ordered lists of road-network node ids; the EventSystem expands
 * them through the shortest path between consecutive waypoints, builds a
 * smooth racing polyline, and places checkpoint gates at every intersection
 * the route passes through.
 *
 * types: sprint (A→B vs rivals) · circuit (laps vs rivals) · timetrial (solo, medals)
 * Rewards are per finishing position (races) or per medal (time trials).
 * Node grid: n{ix}_{iz}; ix 0..6 → x −480..480, iz 0..6 → z −480..480 (south = +z).
 */
(function () {
  window.DistrictApexDowntownEvents = [
    {
      id: 'apex_plaza_sprint',
      name: 'Plaza Sprint',
      type: 'sprint',
      tier: 1,
      tagline: 'A warm-up dash east along Meridian, then up the Loop to the North Gate.',
      route: ['n3_3', 'n4_3', 'n6_3', 'n6_1', 'n3_1', 'n3_0'],
      opponents: 3,
      aiSkill: 0.70,
      rivalCars: ['veloce_v10_corsa', 'v01_kairo_pulse_s', 'veloce_v8_gt'],
      rewards: { credits: [1200, 800, 500, 250], reputation: [220, 140, 90, 40] },
      unlockRep: 0
    },
    {
      id: 'apex_harbor_run',
      name: 'Harbor Run',
      type: 'sprint',
      tier: 2,
      tagline: 'North Gate to the waterfront, threading the Convention superblock.',
      route: ['n3_0', 'n3_2', 'n5_2', 'n5_5', 'n2_5', 'n2_6', 'n3_6'],
      opponents: 3,
      aiSkill: 0.80,
      rivalCars: ['veloce_v8_gt', 'veloce_v10_corsa', 'veloce_v12_stradale'],
      rewards: { credits: [2200, 1400, 900, 400], reputation: [380, 240, 150, 60] },
      unlockRep: 300
    },
    {
      id: 'apex_plaza_circuit',
      name: 'Plaza Circuit',
      type: 'circuit',
      tier: 2,
      laps: 3,
      tagline: 'Three laps around Apex Plaza. Late braking wins, curbs punish.',
      route: ['n2_2', 'n4_2', 'n4_4', 'n2_4', 'n2_2'],
      opponents: 3,
      aiSkill: 0.84,
      rivalCars: ['veloce_v10_corsa', 'veloce_v12_stradale', 'veloce_v8_gt'],
      rewards: { credits: [2600, 1600, 1000, 450], reputation: [420, 260, 160, 70] },
      unlockRep: 600
    },
    {
      id: 'apex_skyline_attack',
      name: 'Skyline Time Attack',
      type: 'timetrial',
      tier: 1,
      tagline: 'Solo run beneath Skyline Tower. Beat the clock for medals.',
      route: ['n2_3', 'n1_3', 'n1_1', 'n2_1', 'n2_0', 'n5_0', 'n5_2', 'n4_2', 'n4_3'],
      opponents: 0,
      medalSpeeds: { gold: 26, silver: 21, bronze: 16 }, // average m/s over the route length
      rewards: { credits: { gold: 1800, silver: 1200, bronze: 700, none: 250 }, reputation: { gold: 300, silver: 190, bronze: 110, none: 30 } },
      unlockRep: 0
    },
    {
      id: 'apex_old_town_dash',
      name: 'Old Town Alley Dash',
      type: 'sprint',
      tier: 3,
      tagline: 'Narrow alleys, blind exits, no traffic to hide behind — just rivals.',
      route: ['n2_6', 'n1_6', 'n1_4', 'n0_4', 'n0_2', 'n2_2', 'n2_3'],
      opponents: 3,
      aiSkill: 0.90,
      rivalCars: ['veloce_v12_stradale', 'veloce_v10_corsa', 'veloce_v8_gt'],
      rewards: { credits: [3400, 2100, 1300, 600], reputation: [560, 340, 210, 90] },
      unlockRep: 1000
    }
  ];
})();
