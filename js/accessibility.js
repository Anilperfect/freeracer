/**
 * FreeRacer - Accessibility options (Phase 5)
 * ---------------------------------------------------------------------------
 * Persisted in SaveManager settings (`accessibility`):
 *   - colorblind: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
 *     (swaps the cyan/magenta event palette for high-contrast alternatives)
 *   - textScale: 0.9 | 1 | 1.15 | 1.3  (root font-size multiplier)
 *   - reduceMotion: bool (kills camera shake + gate pulsing + FOV kick)
 *   - subtitles: bool (announcer speech also shows as on-screen captions)
 *   - highContrastHud: bool (stronger minimap/marker contrast)
 */
(function () {
  const DEFAULTS = {
    colorblind: 'none',
    textScale: 1,
    reduceMotion: false,
    subtitles: true,
    highContrastHud: false
  };

  // Alternative event palettes (next / finish / marker / markerTT / garage).
  const PALETTES = {
    none: null, // built-in EventSystem.COLORS
    deuteranopia: { next: 0x00bfff, later: 0x1f4f8a, finish: 0xff7300, marker: 0x00bfff, markerTT: 0xffd400, garage: 0xffffff },
    protanopia: { next: 0x00bfff, later: 0x1f4f8a, finish: 0xff7300, marker: 0x00bfff, markerTT: 0xffd400, garage: 0xffffff },
    tritanopia: { next: 0xff3cac, later: 0x7a2a5c, finish: 0xffd400, marker: 0xff3cac, markerTT: 0xffffff, garage: 0x00ff88 }
  };

  const BASE_COLORS = { next: 0x00f0ff, later: 0x1f4f8a, finish: 0xff3cac, marker: 0x00f0ff, markerTT: 0xffc93c, garage: 0x7dff6a };

  class AccessibilityManager {
    constructor() {
      this.settings = { ...DEFAULTS };
      this.load();
    }

    load() {
      try {
        const saved = window.SaveManager && window.SaveManager.getSetting('accessibility', null);
        if (saved && typeof saved === 'object') {
          Object.keys(DEFAULTS).forEach((k) => {
            if (saved[k] !== undefined) this.settings[k] = saved[k];
          });
        }
      } catch (e) { /* keep defaults */ }
    }

    persist() {
      if (window.SaveManager) window.SaveManager.setSetting('accessibility', this.settings);
    }

    get(key) { return this.settings[key] !== undefined ? this.settings[key] : DEFAULTS[key]; }

    set(key, value) {
      if (!(key in DEFAULTS)) return;
      this.settings[key] = value;
      this.persist();
      this.apply();
    }

    /** Apply every option to the live document / engine. */
    apply() {
      // text scale
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.setProperty('--fr-text-scale', String(this.get('textScale')));
        document.documentElement.style.fontSize = `${16 * Number(this.get('textScale'))}px`;
      }
      // high-contrast HUD flag on the body for CSS hooks
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('fr-high-contrast', !!this.get('highContrastHud'));
        document.body.classList.toggle('fr-reduce-motion', !!this.get('reduceMotion'));
      }
      // event palette
      if (window.EventSystem && window.EventSystem.COLORS) {
        const pal = PALETTES[this.get('colorblind')] || BASE_COLORS;
        Object.keys(BASE_COLORS).forEach((k) => { window.EventSystem.COLORS[k] = pal[k]; });
      }
      // camera shake honours reduceMotion at call time (see ChaseCamera.addShake)
    }

    /** Show an announcer caption (called from SoundEngine.announce). */
    subtitle(text) {
      if (!this.get('subtitles')) return;
      if (typeof document === 'undefined') return;
      const el = document.getElementById('ow-subtitles');
      if (!el) return;
      el.textContent = text;
      el.classList.remove('hidden');
      clearTimeout(this._subTimer);
      this._subTimer = setTimeout(() => el.classList.add('hidden'), 2600);
    }

    static get DEFAULTS() { return DEFAULTS; }
  }

  window.Accessibility = new AccessibilityManager();
})();
