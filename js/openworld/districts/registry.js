/**
 * FreeRacer - District registry (Phase 3)
 * ---------------------------------------------------------------------------
 * Every playable open-world district registers here with its reputation
 * unlock. Districts are separate worlds — OpenWorldManager rebuilds on travel.
 */
(function () {
  const ENTRIES = [
    {
      id: 'apex_downtown',
      name: 'Apex Downtown',
      tagline: 'Where the neon never sleeps.',
      unlockRep: 0,
      defKey: 'DistrictApexDowntown',
      eventsKey: 'DistrictApexDowntownEvents'
    },
    {
      id: 'harborline',
      name: 'Harborline',
      tagline: 'Diesel, salt and floodlights.',
      unlockRep: 1500,
      defKey: 'DistrictHarborline',
      eventsKey: 'DistrictHarborlineEvents'
    },
    {
      id: 'sunspire_coast',
      name: 'Sunspire Coast',
      tagline: 'Salt air and redline sunsets.',
      unlockRep: 3500,
      defKey: 'DistrictSunspireCoast',
      eventsKey: 'DistrictSunspireCoastEvents'
    }
  ];

  const Registry = {
    list() { return ENTRIES.slice(); },

    get(id) { return ENTRIES.find((e) => e.id === id) || null; },

    /** District definition object (road data, garage, discoveries…). */
    getDef(id) {
      const e = Registry.get(id);
      return e ? (window[e.defKey] || null) : null;
    },

    /** Event definition list for the district. */
    getEvents(id) {
      const e = Registry.get(id);
      return e ? (window[e.eventsKey] || []) : [];
    },

    isUnlocked(id) {
      const e = Registry.get(id);
      if (!e) return false;
      const rep = window.SaveManager ? window.SaveManager.getReputation() : 0;
      return rep >= e.unlockRep;
    },

    unlocked() { return ENTRIES.filter((e) => Registry.isUnlocked(e.id)); },

    /** Next district the player has not unlocked yet (REP order). */
    nextLocked() {
      return ENTRIES.find((e) => !Registry.isUnlocked(e.id)) || null;
    },

    /** Total event + discovery counts across all registered districts. */
    totals() {
      let events = 0;
      let discoveries = 0;
      ENTRIES.forEach((e) => {
        events += (window[e.eventsKey] || []).length;
        const def = window[e.defKey];
        discoveries += def && def.discoveries ? def.discoveries.length : 0;
      });
      return { districts: ENTRIES.length, events, discoveries };
    }
  };

  window.DistrictRegistry = Registry;
})();
