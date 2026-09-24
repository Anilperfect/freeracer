/**
 * FreeRacer - Rival crews & championships (Phase 4)
 * ---------------------------------------------------------------------------
 * All crews, drivers and series are fictional. Crews own a home district and a
 * roster of named AI rivals; events can declare `crew: '<id>'` to draw their
 * opponents from that crew instead of the generic rival pool. Championships
 * are ordered event series scored on points (10/7/5/3/2/1 by position).
 */
(function () {
  window.CrewDatabase = [
    {
      id: 'harbor_kings',
      name: 'Harbor Kings',
      tagline: 'Kings of the docks — torque, noise and container-yard drifting.',
      color: '#ff9a1a',
      homeDistrict: 'harborline',
      leader: 'Big Sal Maro',
      members: [
        { name: 'Big Sal Maro', carId: 'monarch_sovereign', skill: 0.88 },
        { name: 'Dockside Dee', carId: 'veyra_corsair', skill: 0.82 },
        { name: 'Crane Op Cato', carId: 'veloce_v8_gt', skill: 0.78 },
        { name: 'Container Kaz', carId: 'radian_sprint_4', skill: 0.75 }
      ]
    },
    {
      id: 'redline_syndicate',
      name: 'Redline Syndicate',
      tagline: 'Downtown money, downtown power. They own the Plaza Circuit lap record.',
      color: '#e61a2b',
      homeDistrict: 'apex_downtown',
      leader: 'Nova Reyes',
      members: [
        { name: 'Nova Reyes', carId: 'veloce_v12_stradale', skill: 0.92 },
        { name: 'Kade Marlow', carId: 'veloce_v10_corsa', skill: 0.86 },
        { name: 'Ines Vidal', carId: 'apexforge_halo', skill: 0.90 },
        { name: 'Rook Tanaka', carId: 'veloce_v8_gt', skill: 0.80 }
      ]
    },
    {
      id: 'canyon_wolves',
      name: 'Canyon Wolves',
      tagline: 'Dirt-first rally crew. If the road ends, that is where they start smiling.',
      color: '#7dff6a',
      homeDistrict: 'harborline',
      leader: 'Sable Cruz',
      members: [
        { name: 'Sable Cruz', carId: 'radian_sprint_4', skill: 0.86 },
        { name: 'Dusty Vale', carId: 'ironclad_ridgeback', skill: 0.84 },
        { name: 'Rut Runner', carId: 'v01_kairo_pulse_s', skill: 0.76 },
        { name: 'Gravel Gert', carId: 'voltrix_ion', skill: 0.79 }
      ]
    },
    {
      id: 'neon_circuit',
      name: 'Neon Circuit',
      tagline: 'Time-attack purists from the coast highway. Clean lines, cleaner laps.',
      color: '#00f0ff',
      homeDistrict: 'sunspire_coast',
      leader: 'Lumen Park',
      members: [
        { name: 'Lumen Park', carId: 'apexforge_halo', skill: 0.93 },
        { name: 'Aero Ash', carId: 'veloce_v10_corsa', skill: 0.87 },
        { name: 'Slipstream Jo', carId: 'voltrix_ion', skill: 0.85 },
        { name: 'Camber Lee', carId: 'veyra_corsair', skill: 0.81 }
      ]
    },
    {
      id: 'iron_district',
      name: 'Iron District Crew',
      tagline: 'Garage-built muscle from the Ironworks. Slow in, sideways out.',
      color: '#b0b6c4',
      homeDistrict: 'apex_downtown',
      leader: 'Forge Mercer',
      members: [
        { name: 'Forge Mercer', carId: 'monarch_sovereign', skill: 0.87 },
        { name: 'Torque Tilly', carId: 'veloce_v8_gt', skill: 0.83 },
        { name: 'Boost Bully', carId: 'veyra_corsair', skill: 0.80 },
        { name: 'Idle Ira', carId: 'radian_sprint_4', skill: 0.74 }
      ]
    }
  ];

  window.getCrewById = function (id) {
    return (window.CrewDatabase || []).find((c) => c.id === id) || null;
  };

  /**
   * Rival roster for an event: crew members when `eventDef.crew` names a crew,
   * otherwise the classic generic pool.
   * @returns {Array<{name, carId, skill, color}>}
   */
  window.getRivalsForEvent = function (eventDef, count) {
    const generic = [
      { name: 'Nova Reyes', carId: 'veloce_v10_corsa', skill: eventDef.aiSkill || 0.8 },
      { name: 'Kade Marlow', carId: 'veloce_v8_gt', skill: (eventDef.aiSkill || 0.8) - 0.03 },
      { name: 'Ines Vidal', carId: 'veloce_v12_stradale', skill: (eventDef.aiSkill || 0.8) + 0.02 },
      { name: 'Rook Tanaka', carId: 'v01_kairo_pulse_s', skill: (eventDef.aiSkill || 0.8) - 0.06 },
      { name: 'Sable Cruz', carId: 'radian_sprint_4', skill: (eventDef.aiSkill || 0.8) - 0.02 }
    ];
    const crew = eventDef.crew ? window.getCrewById(eventDef.crew) : null;
    const pool = crew ? crew.members.map((m) => ({ ...m, crewId: crew.id, crewName: crew.name })) : generic;
    const out = [];
    for (let i = 0; i < count; i++) {
      const pick = pool[i % pool.length];
      out.push({
        name: pick.name,
        carId: (eventDef.rivalCars && eventDef.rivalCars[i % eventDef.rivalCars.length]) || pick.carId,
        skill: THREE.MathUtils.clamp(pick.skill + (eventDef.aiSkill ? (eventDef.aiSkill - 0.82) * 0.5 : 0), 0.55, 0.98),
        crewId: pick.crewId || null,
        crewName: pick.crewName || null
      });
    }
    return out;
  };

  // ── Championships ─────────────────────────────────────────────────────────
  window.ChampionshipDatabase = [
    {
      id: 'neon_coast_cup',
      name: 'Neon Coast Cup',
      tagline: 'Three downtown rounds. Beat the Syndicate on their own streets.',
      events: ['apex_plaza_sprint', 'apex_harbor_run', 'apex_plaza_circuit'],
      points: [10, 7, 5, 3, 2, 1],
      championBonus: { credits: 8000, rep: 1200 },
      unlockRep: 600
    },
    {
      id: 'harbor_kings_showdown',
      name: 'Harbor Kings Showdown',
      tagline: 'Dockside decider against Big Sal Maro himself.',
      events: ['harbor_container_sprint', 'harbor_drift_basin', 'harbor_night_run'],
      points: [10, 7, 5, 3, 2, 1],
      championBonus: { credits: 12000, rep: 2000 },
      unlockRep: 2500
    },
    {
      id: 'sunspire_sunset_series',
      name: 'Sunspire Sunset Series',
      tagline: 'Coast-highway glory against the Neon Circuit crew.',
      events: ['sunspire_coast_sprint', 'sunspire_tunnel_dash', 'sunspire_drift_point'],
      points: [10, 7, 5, 3, 2, 1],
      championBonus: { credits: 15000, rep: 2500 },
      unlockRep: 4500
    }
  ];

  window.getChampionshipById = function (id) {
    return (window.ChampionshipDatabase || []).find((c) => c.id === id) || null;
  };

  /** Championships that include the given event id. */
  window.getChampionshipsForEvent = function (eventId) {
    return (window.ChampionshipDatabase || []).filter((c) => c.events.includes(eventId));
  };
})();
