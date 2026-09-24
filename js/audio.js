// ============================================================================
// TURBO RUSH - PROCEDURAL AUDIO SYNTHESIZER & ADAPTIVE AUDIO ENGINE
// ============================================================================
// Generates engine revs, tire screeches, nitro whooshes, collisions, 3D spatial
// audio, multi-layer adaptive music, and an AI cyber race announcer. Zero audio asset files!

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Master volume controls
    this.masterVolume = 1.0;
    this.musicVolume = 0.65;
    this.sfxVolume = 0.85;
    this.voiceVolume = 0.9;

    // Bus Gain Nodes
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.voiceGain = null;

    // Player Engine sound nodes
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineOsc3 = null;
    this.turboOsc = null;
    this.turboGain = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.currentCarId = 'veloce_v10_corsa';
    this.audioProfile = 'v10_na';
    this.lastThrottle = 0.0;

    // Tire screech nodes
    this.screechSource = null;
    this.screechFilter = null;
    this.screechGain = null;

    // Nitro sound nodes
    this.nitroGain = null;
    this.nitroFilter = null;

    // Adaptive Music Sequencer
    this.musicIsPlaying = false;
    this.musicStep = 0;
    this.musicTimer = null;
    this.musicBpm = 132;
    this.currentMusicIntensity = 'cruising'; // 'idle', 'cruising', 'rush', 'finallap'

    // Bass & Lead Synths for Music
    this.bassNotes = [36.71, 41.20, 43.65, 48.99]; // D1, E1, F1, G1
    this.leadNotes = [293.66, 329.63, 349.23, 392.00, 440.00, 523.25]; // D4, E4, F4, G4, A4, C5

    // Announcer settings
    this.synthVoice = null;
    this.hasSpeech = 'speechSynthesis' in window;
    this._initSpeech();
  }

  _initSpeech() {
    if (this.hasSpeech) {
      window.speechSynthesis.onvoiceschanged = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer an English robotic/futuristic or crisp voice
        this.synthVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('David'))) || voices[0];
      };
    }
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Bus Routing: SubGains -> MasterGain -> Destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.setValueAtTime(this.voiceVolume, this.ctx.currentTime);
      this.voiceGain.connect(this.masterGain);

      this.setupEngineSound();
      this.setupScreechSound();
      this.setupNitroSound();
      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported or blocked", e);
    }
  }

  ensureContext() {
    if (!this.isInitialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVehicleProfile(carId) {
    this.currentCarId = carId || 'veloce_v10_corsa';
    const carData = window.getCarById ? window.getCarById(this.currentCarId) : null;
    this.audioProfile = (carData && carData.engine && carData.engine.audioProfile) || 'v10_na';
    console.log(`🔊 SoundEngine profile set to: ${this.audioProfile} (${this.currentCarId})`);
  }

  setupEngineSound() {
    // Primary Cylinder Fire Oscillator
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(55, this.ctx.currentTime);

    // Sub Harmonic / Low Rumble Oscillator
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.setValueAtTime(110, this.ctx.currentTime);

    // High Overtone / Intake Resonance Oscillator (V10 / V12 Screaming Harmonics)
    this.engineOsc3 = this.ctx.createOscillator();
    this.engineOsc3.type = 'sawtooth';
    this.engineOsc3.frequency.setValueAtTime(165, this.ctx.currentTime);

    // Turbocharger Spool Oscillator (Dedicated to V8 Twin-Turbo)
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.setValueAtTime(800, this.ctx.currentTime);

    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.sfxGain);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.09, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineOsc3.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineOsc3.start();
    this.turboOsc.start();
  }

  setupScreechSound() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.screechSource = this.ctx.createBufferSource();
    this.screechSource.buffer = noiseBuffer;
    this.screechSource.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    this.screechFilter.Q.setValueAtTime(5.0, this.ctx.currentTime);

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.screechSource.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.sfxGain);

    this.screechSource.start();
  }

  setupNitroSound() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const nitroNoise = this.ctx.createBufferSource();
    nitroNoise.buffer = noiseBuffer;
    nitroNoise.loop = true;

    this.nitroFilter = this.ctx.createBiquadFilter();
    this.nitroFilter.type = 'lowpass';
    this.nitroFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.setValueAtTime(0, this.ctx.currentTime);

    nitroNoise.connect(this.nitroFilter);
    this.nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.sfxGain);

    nitroNoise.start();
  }

  /**
   * Update real-time engine revs, turbo spool, tire squeal, and nitro sound
   * Customized per vehicle profile (V10, V8 Turbo, V12).
   */
  updateCarAudio(speedRatio, isDrifting, isNitroActive, throttle, wheelsOrScrub = null, wetness = 0.0) {
    if (!this.isInitialized || this.isMuted || !this.engineOsc1 || !this.ctx) return;
    const safeRatio = (typeof speedRatio === 'number' && Number.isFinite(speedRatio)) ? Math.max(0, Math.min(1, speedRatio)) : 0;
    const safeThrottle = (typeof throttle === 'number' && Number.isFinite(throttle)) ? Math.max(0, Math.min(1, throttle)) : 0;
    const t = this.ctx.currentTime;
    if (!Number.isFinite(t)) return;

    try {
      let baseIdle = 55;
      let revRange = 320;
      let throttleBoost = 80;
      let cutoffBase = 320;
      let cutoffMax = 2200;

      if (this.audioProfile === 'v10_na') {
        // High-pitched 9,000 RPM screaming character
        baseIdle = 68;
        revRange = 460;
        throttleBoost = 120;
        cutoffBase = 420;
        cutoffMax = 3600;
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.07);
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 1.66, t, 0.07);
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.50, t, 0.07); // Screaming 10th harmonic
        if (this.turboGain) this.turboGain.gain.setTargetAtTime(0, t, 0.1);

      } else if (this.audioProfile === 'v8_turbo') {
        // Deep throaty low-end V8 rumble + turbo whistle
        baseIdle = 48;
        revRange = 290;
        throttleBoost = 70;
        cutoffBase = 280;
        cutoffMax = 1800;
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 0.75, t, 0.08); // Sub-bass octave
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.00, t, 0.08);

        // Turbo spool gain with throttle + speed
        if (this.turboGain && this.turboOsc) {
          const spool = Math.min(1.0, safeRatio * 0.6 + safeThrottle * 0.5);
          this.turboGain.gain.setTargetAtTime(spool * 0.18, t, 0.12);
          this.turboOsc.frequency.setTargetAtTime(1400 + spool * 1600, t, 0.15);
        }

        if (this.lastThrottle > 0.75 && safeThrottle < 0.20 && speedRatio > 0.25) {
          this.playWastegateSound();
        }

      } else if (this.audioProfile === 'i4_turbo') {
        // Punchy 7,200 RPM turbocharged inline-4 (V01 Kairo Pulse S)
        baseIdle = 56;
        revRange = 360;
        throttleBoost = 95;
        cutoffBase = 320;
        cutoffMax = 2800;
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.07);
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 1.25, t, 0.07);
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.00, t, 0.07);

        // Turbo spool & blowoff
        if (this.turboGain && this.turboOsc) {
          const spool = Math.min(1.0, safeRatio * 0.7 + safeThrottle * 0.6);
          this.turboGain.gain.setTargetAtTime(spool * 0.22, t, 0.10);
          this.turboOsc.frequency.setTargetAtTime(1600 + spool * 1800, t, 0.12);
        }
        if (this.lastThrottle > 0.70 && safeThrottle < 0.20 && speedRatio > 0.20) {
          this.playWastegateSound();
        }

      } else if (this.audioProfile === 'v6_hybrid') {
        // Twin-turbo V6 with electric motor assist whine
        baseIdle = 54;
        revRange = 400;
        throttleBoost = 100;
        cutoffBase = 350;
        cutoffMax = 3200;
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.06);
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 1.50, t, 0.06);
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.66, t, 0.06);

        if (this.turboGain && this.turboOsc) {
          const spool = Math.min(1.0, safeRatio * 0.5 + safeThrottle * 0.5);
          this.turboGain.gain.setTargetAtTime(spool * 0.15, t, 0.10);
          this.turboOsc.frequency.setTargetAtTime(2200 + spool * 2400, t, 0.10);
        }
      } else {
        // Universal robust fallback for any vehicle profile
        const freq = baseIdle + (safeRatio * revRange) + (safeThrottle * throttleBoost);
        this.engineOsc1.frequency.setTargetAtTime(freq, t, 0.08);
        if (this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(freq * 1.50, t, 0.08);
        if (this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(freq * 2.00, t, 0.08);
      }

      this.lastThrottle = safeThrottle;

      // Dynamic Filter opening with throttle
      if (this.engineFilter) {
        const cutoff = Math.max(120, Math.min(8000, cutoffBase + (safeRatio * cutoffMax) + (safeThrottle * 1400)));
        this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
      }

      // Tire Screech driven by physical dissipated slip power (Section 3.2: W = |Fx|*ΔVx + |Fy|*ΔVy)
      if (this.screechGain) {
        let scrubNorm = 0.0;
        if (wheelsOrScrub && typeof wheelsOrScrub === 'object') {
          if (wheelsOrScrub.fl && wheelsOrScrub.fr) {
            const corners = [wheelsOrScrub.fl, wheelsOrScrub.fr, wheelsOrScrub.rl, wheelsOrScrub.rr];
            corners.forEach(w => {
              if (w && w.tireForce && typeof w.tireForce.scrubNorm === 'number') {
                scrubNorm = Math.max(scrubNorm, w.tireForce.scrubNorm);
              }
            });
          }
        } else if (typeof wheelsOrScrub === 'number') {
          scrubNorm = wheelsOrScrub;
        }

        let targetScreech = 0.0;
        if (scrubNorm > 0.01) {
          // Continuous scrub power scaling (250 W to 4000 W)
          targetScreech = THREE.MathUtils.clamp(scrubNorm * 0.28, 0.0, 0.35);
          if (this.screechFilter) {
            const screechFreq = 1000.0 + (scrubNorm * 1200.0);
            this.screechFilter.frequency.setTargetAtTime(screechFreq, t, 0.05);
          }
        } else {
          targetScreech = isDrifting ? 0.24 : 0.0;
        }
        this.screechGain.gain.setTargetAtTime(targetScreech, t, 0.05);
      }

      // Nitro whoosh
      if (this.nitroGain) {
        const targetNitro = isNitroActive ? 0.30 : 0;
        this.nitroGain.gain.setTargetAtTime(targetNitro, t, 0.08);
      }
      if (isNitroActive && this.nitroFilter) {
        this.nitroFilter.frequency.setTargetAtTime(1500, t, 0.1);
      }
    } catch (e) {
      // Ignore transient audio clock errors
    }
  }

  /**
   * Silence all continuous gameplay audio loops (engine revs, tire screeches, nitro, turbo)
   * Used when exiting race to garage/main menu.
   */
  silenceGameplayAudio() {
    if (!this.isInitialized || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.screechGain) this.screechGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.nitroGain) this.nitroGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.turboGain) this.turboGain.gain.setTargetAtTime(0, t, 0.05);
    } catch (e) {}
  }

  /**
   * Wastegate Blow-off Valve Sound
   */
  playWastegateSound() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.35);
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, this.ctx.currentTime);
      filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.20, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.32);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      whiteNoise.start();
    } catch (e) {}
  }

  /**
   * Precision Drive Sweet-Spot Activation Chime (Bright Harmonic Pulse)
   */
  playPrecisionChime() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.36);
    } catch (e) {}
  }

  /**
   * Overdrive Burst Activation (Sub-bass Shockwave Boom)
   */
  playOverdriveBoom() {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.55, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.50);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.52);
    } catch (e) {}
  }

  /**
   * Interactive Showroom Engine Rev Preview
   * Simulates engine ignition and a smooth rev sweep to redline.
   */
  previewEngineRev(carId) {
    this.ensureContext();
    this.setVehicleProfile(carId);

    if (!this.engineOsc1 || !this.ctx) return;
    const t = this.ctx.currentTime;

    // Simulated throttle curve: idle -> rev to peak -> second blip -> idle
    const originalGain = this.engineGain.gain.value;
    this.engineGain.gain.setValueAtTime(0.14, t);

    // Quick starter crank pitch flutter
    this.engineOsc1.frequency.setValueAtTime(35, t);
    this.engineOsc1.frequency.linearRampToValueAtTime(80, t + 0.2);

    // First rev sweep
    const peakFreq = this.audioProfile === 'v12_na' ? 580 : (this.audioProfile === 'v10_na' ? 520 : 360);
    this.engineOsc1.frequency.exponentialRampToValueAtTime(peakFreq, t + 0.85);
    if (this.engineOsc2) this.engineOsc2.frequency.exponentialRampToValueAtTime(peakFreq * 1.5, t + 0.85);
    if (this.engineOsc3) this.engineOsc3.frequency.exponentialRampToValueAtTime(peakFreq * 2.2, t + 0.85);

    // Return to idle
    this.engineOsc1.frequency.exponentialRampToValueAtTime(65, t + 1.8);
    if (this.engineOsc2) this.engineOsc2.frequency.exponentialRampToValueAtTime(110, t + 1.8);
    if (this.engineOsc3) this.engineOsc3.frequency.exponentialRampToValueAtTime(160, t + 1.8);

    if (this.audioProfile === 'v8_turbo') {
      setTimeout(() => this.playWastegateSound(), 900);
    }

    setTimeout(() => {
      if (this.engineGain) this.engineGain.gain.setValueAtTime(originalGain, this.ctx.currentTime);
    }, 2000);
  }

  // ==========================================================================
  // 3D SPATIAL AUDIO
  // ==========================================================================
  playSpatialSound(type, worldPos, listenerPos, listenerForward, options = {}) {
    if (!this.isInitialized || this.isMuted) return;

    // Calculate distance and pan angle relative to listener
    const dx = worldPos.x - listenerPos.x;
    const dy = worldPos.y - listenerPos.y;
    const dz = worldPos.z - listenerPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const maxDist = options.maxDist || 180;
    if (dist > maxDist) return;

    // Distance attenuation
    const vol = Math.max(0, 1 - (dist / maxDist)) * (options.volume || 1.0);

    // Calculate stereo pan (-1.0 to +1.0)
    // Relative vector in X-Z
    const toSound = new THREE.Vector3(dx, dy, dz).normalize();
    const right = new THREE.Vector3().crossVectors(listenerForward, new THREE.Vector3(0, 1, 0)).normalize();
    const pan = THREE.MathUtils.clamp(toSound.dot(right), -1.0, 1.0);

    const t = this.ctx.currentTime;
    let panner;
    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, t);
    }

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(vol * 0.35, t);

    if (panner) {
      gainNode.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      gainNode.connect(this.sfxGain);
    }

    if (type === 'boost') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gainNode);
      osc.start(t);
      osc.stop(t + 0.4);
    } else if (type === 'rival_engine') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140 + Math.random() * 80, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gainNode);
      osc.start(t);
      osc.stop(t + 0.6);
    } else if (type === 'impact') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gainNode);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  // ==========================================================================
  // ADAPTIVE MULTI-LAYER MUSIC
  // ==========================================================================
  startMusic(intensity = 'cruising') {
    this.ensureContext();
    if (!this.ctx || this.musicIsPlaying) return;

    this.musicIsPlaying = true;
    this.currentMusicIntensity = intensity;
    this.musicStep = 0;
    this._scheduleMusicBeat();
  }

  setMusicIntensity(intensity) {
    this.currentMusicIntensity = intensity;
    if (intensity === 'finallap') {
      this.musicBpm = 144;
    } else if (intensity === 'rush') {
      this.musicBpm = 138;
    } else {
      this.musicBpm = 130;
    }
  }

  stopMusic() {
    this.musicIsPlaying = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  _scheduleMusicBeat() {
    if (!this.musicIsPlaying || !this.ctx) return;

    const stepIntervalMs = (60 / this.musicBpm / 4) * 1000; // 16th notes
    const t = this.ctx.currentTime;

    // 1. Synth Kick on every 4th 16th note (quarters)
    if (this.musicStep % 4 === 0) {
      this._playKick(t);
    }

    // 2. Off-beat Synth Hi-Hat on 8th notes
    if (this.musicStep % 2 === 1) {
      this._playHiHat(t, this.currentMusicIntensity === 'finallap' ? 0.04 : 0.02);
    }

    // 3. Cyber Bassline
    if (this.musicStep % 2 === 0) {
      const noteIdx = Math.floor((this.musicStep / 8) % this.bassNotes.length);
      const freq = this.bassNotes[noteIdx];
      this._playSynthBass(t, freq, stepIntervalMs * 1.8 / 1000);
    }

    // 4. Arpeggiator Lead (cruising, rush, finallap)
    if (this.currentMusicIntensity !== 'idle') {
      const leadIdx = (this.musicStep * 3) % this.leadNotes.length;
      const freq = this.leadNotes[leadIdx] * (this.currentMusicIntensity === 'finallap' ? 1.5 : 1.0);
      this._playLeadArp(t, freq);
    }

    this.musicStep = (this.musicStep + 1) % 64;

    this.musicTimer = setTimeout(() => {
      this._scheduleMusicBeat();
    }, stepIntervalMs);
  }

  _playKick(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  _playHiHat(t, vol = 0.03) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
  }

  _playSynthBass(t, freq, duration) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, t);
    filter.Q.setValueAtTime(4.0, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  _playLeadArp(t, freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // ==========================================================================
  // CYBER RACE ANNOUNCER
  // ==========================================================================
  announce(text, isUrgent = false) {
    // On-screen caption (shown even when muted — accessibility subtitles).
    if (window.Accessibility) window.Accessibility.subtitle(text);
    if (this.isMuted) return;

    if (this.hasSpeech && 'SpeechSynthesisUtterance' in window) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.volume = this.voiceVolume * this.masterVolume;
        u.rate = 1.15; // Crisp, fast race announcer
        u.pitch = isUrgent ? 1.25 : 1.05;
        if (this.synthVoice) u.voice = this.synthVoice;
        window.speechSynthesis.cancel(); // Don't queue up old voice calls
        window.speechSynthesis.speak(u);
        return;
      } catch (e) {
        // Fallback to synth chime
      }
    }

    // Fallback synth announcer chime if speech synthesis unavailable
    this.playBeep(isUrgent);
  }

  // ==========================================================================
  // VOLUME SETTERS
  // ==========================================================================
  setMasterVolume(val) {
    this.masterVolume = THREE.MathUtils.clamp(val, 0, 1);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  setMusicVolume(val) {
    this.musicVolume = THREE.MathUtils.clamp(val, 0, 1);
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
  }

  setSFXVolume(val) {
    this.sfxVolume = THREE.MathUtils.clamp(val, 0, 1);
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  setVoiceVolume(val) {
    this.voiceVolume = THREE.MathUtils.clamp(val, 0, 1);
    if (this.voiceGain && this.ctx) {
      this.voiceGain.gain.setValueAtTime(this.voiceVolume, this.ctx.currentTime);
    }
  }

  playImpact(strength = 1.0) {
    if (!this.isInitialized || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);

    gain.gain.setValueAtTime(Math.min(0.5 * strength, 0.6), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  playBeep(isHigh = false) {
    if (!this.isInitialized || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHigh ? 900 : 440, t);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isHigh ? 0.6 : 0.25));

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + (isHigh ? 0.6 : 0.25));
  }

  playVictory() {
    if (!this.isInitialized || this.isMuted) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.5);
      }, idx * 160);
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

window.SoundEngine = new SoundEngine();
