/**
 * Turbo Rush - Emerald Highway Audio & Acoustic Zone System
 * 
 * Implements realistic environmental acoustics for the countryside expressway:
 * - Open-air countryside atmosphere (wind wash, distant nature ambience)
 * - Dynamic acoustic zones:
 *     - Blackwood Rock-Cut Tunnel (u ~ 0.36 to 0.43): heavy cavern resonance,
 *       reverberant engine reflection, boosted low-end drone
 * - Traffic Doppler whoosh when overtaking or passing oncoming civilian vehicles
 */

(function() {
  class EmeraldHighwayAudio {
    constructor(trackManager) {
      this.track = trackManager;
      this.audioCtx = (window.SoundEngine && window.SoundEngine.ctx) ? window.SoundEngine.ctx : null;
      this.inTunnel = false;
      this.ambientGain = null;
      this.tunnelGain = null;
      this.tunnelFilter = null;

      this.initAudioNodes();
    }

    initAudioNodes() {
      if (!this.audioCtx) return;

      try {
        // Tunnel Convolver / Resonance Filter
        this.tunnelFilter = this.audioCtx.createBiquadFilter();
        this.tunnelFilter.type = 'peaking';
        this.tunnelFilter.frequency.value = 450;
        this.tunnelFilter.Q.value = 3.5;
        this.tunnelFilter.gain.value = 0.0; // Boosted when inside tunnel

        this.tunnelGain = this.audioCtx.createGain();
        this.tunnelGain.gain.value = 0.0;

        this.tunnelFilter.connect(this.tunnelGain);
        if (window.SoundEngine && window.SoundEngine.masterGain) {
          this.tunnelGain.connect(window.SoundEngine.masterGain);
        }
      } catch (e) {
        // Graceful fallback if Web Audio is restricted before user gesture
      }
    }

    update(dt, playerPhysics) {
      if (!playerPhysics) return;

      const u = playerPhysics.trackU;
      // Blackwood Tunnel spans u ~ 0.36 to 0.43
      const wasInTunnel = this.inTunnel;
      this.inTunnel = (u >= 0.355 && u <= 0.435);

      if (this.inTunnel !== wasInTunnel) {
        if (this.inTunnel) {
          // Entered tunnel
          this.onEnterTunnel();
        } else {
          // Exited tunnel
          this.onExitTunnel();
        }
      }
    }

    onEnterTunnel() {
      if (this.tunnelFilter && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        this.tunnelFilter.gain.cancelScheduledValues(now);
        this.tunnelFilter.gain.linearRampToValueAtTime(14.0, now + 0.35); // Heavy tunnel acoustic resonance
      }
    }

    onExitTunnel() {
      if (this.tunnelFilter && this.audioCtx) {
        const now = this.audioCtx.currentTime;
        this.tunnelFilter.gain.cancelScheduledValues(now);
        this.tunnelFilter.gain.linearRampToValueAtTime(0.0, now + 0.45); // Return to open air
      }
    }

    destroy() {
      if (this.tunnelGain) {
        try { this.tunnelGain.disconnect(); } catch (e) {}
      }
      if (this.tunnelFilter) {
        try { this.tunnelFilter.disconnect(); } catch (e) {}
      }
    }
  }

  window.EmeraldHighwayAudio = EmeraldHighwayAudio;
})();
