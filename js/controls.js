/**
 * FreeRacer - Remappable keyboard controls (Phase 5)
 * ---------------------------------------------------------------------------
 * Central registry of driving + menu actions → KeyboardEvent.code bindings.
 * Bindings persist in SaveManager settings (`keyBindings`) and are consumed by
 * GameEngine.pollNormalizedInputs() plus the open-world key handlers. Gamepad
 * and touch mappings are fixed (see pollNormalizedInputs) — only the keyboard
 * layer is remappable.
 */
(function () {
  const DEFAULTS = {
    accelerate: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    handbrake: ['Space'],
    nitro: ['ShiftLeft', 'ShiftRight'],
    interact: ['KeyE', 'Enter'],
    reset: ['KeyR'],
    camera: ['KeyC'],
    map: ['KeyM'],
    minimapRotate: ['KeyN'],
    pause: ['Escape']
  };

  const LABELS = {
    accelerate: 'Accelerate',
    brake: 'Brake / Reverse',
    steerLeft: 'Steer Left',
    steerRight: 'Steer Right',
    handbrake: 'Handbrake',
    nitro: 'Nitro',
    interact: 'Interact',
    reset: 'Reset to Road',
    camera: 'Camera',
    map: 'Full Map',
    minimapRotate: 'Minimap Rotation',
    pause: 'Pause'
  };

  function pretty(code) {
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace('ArrowUp', '↑').replace('ArrowDown', '↓')
      .replace('ArrowLeft', '←').replace('ArrowRight', '→')
      .replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift')
      .replace('Space', 'Space').replace('Escape', 'Esc').replace('Enter', 'Enter');
  }

  class ControlsManager {
    constructor() {
      this.defaults = JSON.parse(JSON.stringify(DEFAULTS));
      this.bindings = JSON.parse(JSON.stringify(DEFAULTS));
      this.load();
    }

    load() {
      try {
        const saved = window.SaveManager && window.SaveManager.getSetting('keyBindings', null);
        if (saved && typeof saved === 'object') {
          Object.keys(this.defaults).forEach((action) => {
            if (Array.isArray(saved[action]) && saved[action].length) {
              this.bindings[action] = saved[action].slice(0, 3);
            }
          });
        }
      } catch (e) { /* keep defaults */ }
    }

    persist() {
      if (window.SaveManager) window.SaveManager.setSetting('keyBindings', this.bindings);
    }

    reset() {
      this.bindings = JSON.parse(JSON.stringify(this.defaults));
      this.persist();
    }

    /** All codes bound to an action. */
    codesFor(action) {
      return this.bindings[action] || this.defaults[action] || [];
    }

    /** True when the KeyboardEvent code triggers the action. */
    matches(action, code) {
      return this.codesFor(action).includes(code);
    }

    /** True when any currently-held key triggers the action. */
    held(action, activeKeys) {
      return this.codesFor(action).some((c) => activeKeys[c]);
    }

    /**
     * Rebind an action's primary slot. Returns { ok, conflict? } — when another
     * action already uses the code, the old owner keeps it and we report the
     * conflict so the UI can warn (no silent double-binds).
     */
    rebind(action, code, slot = 0) {
      if (!this.defaults[action]) return { ok: false, conflict: null };
      let conflict = null;
      Object.keys(this.bindings).forEach((other) => {
        if (other !== action && this.bindings[other].includes(code)) conflict = other;
      });
      const list = this.bindings[action].slice();
      list[slot] = code;
      this.bindings[action] = list;
      this.persist();
      return { ok: true, conflict };
    }

    static get LABELS() { return LABELS; }
    static pretty(code) { return pretty(code); }
  }

  window.FreeRacerControls = new ControlsManager();
})();
