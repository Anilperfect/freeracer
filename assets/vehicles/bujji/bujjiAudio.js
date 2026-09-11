/**
 * Turbo Rush - Bujji V6 Twin-Turbo Hybrid Audio Profile
 * Extends the game's procedural SoundEngine with an original acoustic profile:
 * - Low-end mechanical 3.8L Twin-Turbo V6 firing harmonics (120-degree crank)
 * - Dual front electric stator motor high-frequency frequency glide
 * - Dynamic turbocharger boost whistle and wastegate atmospheric release
 * 
 * Strict Physical Invariant:
 * Zero external audio sample files. Pure Web Audio API procedural synthesis.
 */

(function() {
  function hookBujjiAudio() {
    if (!window.SoundEngine || !window.SoundEngine.prototype) {
      setTimeout(hookBujjiAudio, 100);
      return;
    }

    const originalSetupEngine = window.SoundEngine.prototype.setupEngineSound;
    window.SoundEngine.prototype.setupEngineSound = function() {
      originalSetupEngine.apply(this, arguments);

      // Add electric motor stator oscillator for hybrid propulsion
      try {
        if (this.ctx) {
          this.electricOsc = this.ctx.createOscillator();
          this.electricOsc.type = 'sine';
          this.electricOsc.frequency.setValueAtTime(600, this.ctx.currentTime);

          this.electricFilter = this.ctx.createBiquadFilter();
          this.electricFilter.type = 'bandpass';
          this.electricFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
          this.electricFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

          this.electricGain = this.ctx.createGain();
          this.electricGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

          this.electricOsc.connect(this.electricFilter);
          this.electricFilter.connect(this.electricGain);
          if (this.sfxGain) {
            this.electricGain.connect(this.sfxGain);
          }
          this.electricOsc.start();
        }
      } catch (e) {
        console.warn('Bujji electric audio layer init deferred:', e);
      }
    };

    const originalUpdateCarAudio = window.SoundEngine.prototype.updateCarAudio;
    window.SoundEngine.prototype.updateCarAudio = function(speedRatio, isDrifting, isNitroActive, throttle) {
      if (this.audioProfile !== 'v6_hybrid') {
        return originalUpdateCarAudio.apply(this, arguments);
      }

      if (!this.isInitialized || this.isMuted || !this.engineOsc1 || !this.ctx) return;
      const safeRatio = (typeof speedRatio === 'number' && Number.isFinite(speedRatio)) ? Math.max(0, Math.min(1, speedRatio)) : 0;
      const safeThrottle = (typeof throttle === 'number' && Number.isFinite(throttle)) ? Math.max(0, Math.min(1, throttle)) : 0;
      const t = this.ctx.currentTime;
      if (!Number.isFinite(t)) return;

      try {
        // Bujji V6 Twin-Turbo Combustion Profile (8,200 RPM max)
        const baseIdle = 48; // Deep 120-degree V6 idle rumble
        const revRange = 320;
        const throttleBoost = 90;
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);

        // Primary 3-cylinder bank pulse
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
        // Opposing bank 6-cylinder pulse harmonic (1.50x)
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 1.50, t, 0.08);
        // Exhaust resonance chamber (2.25x)
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.25, t, 0.08);

        // Low-pass filter simulating armored engine bay acoustic dampening
        if (this.engineFilter) {
          const cutoff = 280 + (safeRatio * 1800) + (safeThrottle * 800);
          this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
        }

        // Twin-Turbo spool whine
        if (this.turboOsc && this.turboGain) {
          const turboFreq = 1600 + (safeRatio * 4200) + (safeThrottle * 1200);
          this.turboOsc.frequency.setTargetAtTime(turboFreq, t, 0.12);
          const turboVol = (safeRatio * 0.08) + (safeThrottle * 0.06);
          this.turboGain.gain.setTargetAtTime(turboVol, t, 0.1);
        }

        // Front Electric Stator Motor Whine (Pure hybrid electric vectoring)
        if (this.electricOsc && this.electricGain && this.electricFilter) {
          const electricFreq = 800 + (safeRatio * 3200);
          this.electricOsc.frequency.setTargetAtTime(electricFreq, t, 0.05);
          this.electricFilter.frequency.setTargetAtTime(electricFreq, t, 0.05);
          const electricVol = (safeThrottle > 0.1 ? (0.05 + safeRatio * 0.08) : 0.015);
          this.electricGain.gain.setTargetAtTime(electricVol, t, 0.06);
        }

        // Master engine volume envelope
        if (this.engineGain) {
          const engVol = 0.28 + (safeRatio * 0.45) + (safeThrottle * 0.25);
          this.engineGain.gain.setTargetAtTime(engVol, t, 0.08);
        }

        // Tire screech
        if (this.screechGain) {
          const screechVol = isDrifting ? Math.min(0.7, 0.15 + safeRatio * 0.55) : 0.0;
          this.screechGain.gain.setTargetAtTime(screechVol, t, 0.06);
        }

        // Nitro sound
        if (this.nitroGain) {
          const nitroVol = isNitroActive ? 0.85 : 0.0;
          this.nitroGain.gain.setTargetAtTime(nitroVol, t, 0.05);
        }

        this.lastThrottle = safeThrottle;
      } catch (err) {
        // Graceful fallback
      }
    };

    console.log('⚡ Bujji V6 Hybrid Audio Profile registered successfully!');
  }

  hookBujjiAudio();
})();
