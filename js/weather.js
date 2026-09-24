// ============================================================================
// TURBO RUSH - 3D DYNAMIC WEATHER SYSTEM (VISUAL ONLY)
// ============================================================================
// Provides visual atmospheres: Clear, Rain, Fog, Lightning Storm, Energy Storm, Night.
// STRICT REQUIREMENT: Absolutely NO modification to vehicle grip, speed, or handling.

class WeatherManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.currentWeather = 'clear';
    this.weatherGroup = new THREE.Group();
    this.weatherGroup.name = 'WeatherSystem';
    this.scene.add(this.weatherGroup);

    // Weather settings presets
    this.presets = {
      clear: {
        name: 'Neon Twilight (Clear)',
        fogDensity: 0.0006,
        fogColor: 0x0a0c18,
        ambientColor: 0x222644,
        ambientIntensity: 0.9,
        dirLightColor: 0x88bbff,
        dirLightIntensity: 1.2,
        particles: 'none',
        skyTint: 0x050814
      },
      rain: {
        name: 'Acid Rainstorm',
        fogDensity: 0.0018,
        fogColor: 0x060b14,
        ambientColor: 0x141e30,
        ambientIntensity: 0.6,
        dirLightColor: 0x4477aa,
        dirLightIntensity: 0.7,
        particles: 'rain',
        particleCount: 1800,
        skyTint: 0x040810
      },
      fog: {
        name: 'Cyber Mist (Volumetric Fog)',
        fogDensity: 0.0035,
        fogColor: 0x081220,
        ambientColor: 0x1a2638,
        ambientIntensity: 0.75,
        dirLightColor: 0x5588cc,
        dirLightIntensity: 0.6,
        particles: 'mist',
        particleCount: 800,
        skyTint: 0x06101c
      },
      storm: {
        name: 'Plasma Lightning Storm',
        fogDensity: 0.0022,
        fogColor: 0x050711,
        ambientColor: 0x12172b,
        ambientIntensity: 0.55,
        dirLightColor: 0x6655cc,
        dirLightIntensity: 0.8,
        particles: 'storm',
        particleCount: 2200,
        lightning: true,
        skyTint: 0x04050d
      },
      energy: {
        name: 'Quantum Energy Surge',
        fogDensity: 0.0015,
        fogColor: 0x0a0518,
        ambientColor: 0x241238,
        ambientIntensity: 0.85,
        dirLightColor: 0xcc44ff,
        dirLightIntensity: 1.1,
        particles: 'energy',
        particleCount: 1200,
        skyTint: 0x0d041a
      },
      night: {
        name: 'Midnight Eclipse',
        fogDensity: 0.0012,
        fogColor: 0x020306,
        ambientColor: 0x0d1120,
        ambientIntensity: 0.45,
        dirLightColor: 0x334466,
        dirLightIntensity: 0.5,
        particles: 'stars',
        particleCount: 1500,
        skyTint: 0x010204
      }
    };

    // Quality multiplier for particle counts (from SettingsManager / graphics preset)
    this.qualityMultiplier = 1.0;

    // Particle systems container
    this.particleSystem = null;
    this.particlePositions = null;
    this.particleVelocities = null;

    // Lightning flash light
    this.lightningLight = new THREE.PointLight(0xaaccff, 0, 1500, 1.8);
    this.lightningLight.position.set(0, 400, 0);
    this.weatherGroup.add(this.lightningLight);
    this.lightningCooldown = 4.0;
    this.lightningDuration = 0;

    // References to primary scene lights for dynamic adjustment
    this.ambientLight = null;
    this.directionalLight = null;
  }

  // Bind references to main scene lights
  bindLights(ambientLight, directionalLight) {
    this.ambientLight = ambientLight;
    this.directionalLight = directionalLight;
  }

  setQuality(preset) {
    if (preset === 'low') this.qualityMultiplier = 0.3;
    else if (preset === 'medium') this.qualityMultiplier = 0.6;
    else if (preset === 'high') this.qualityMultiplier = 1.0;
    else if (preset === 'ultra') this.qualityMultiplier = 1.5;

    // Rebuild particles with new count
    this.applyWeather(this.currentWeather);
  }

  applyWeather(weatherKey) {
    if (!this.presets[weatherKey]) weatherKey = 'clear';
    this.currentWeather = weatherKey;
    const cfg = this.presets[weatherKey];

    // 1. Atmosphere / Fog
    if (this.scene.fog) {
      this.scene.fog.color.setHex(cfg.fogColor);
      this.scene.fog.density = cfg.fogDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    }

    if (this.renderer) {
      this.renderer.setClearColor(cfg.skyTint);
    }

    // 2. Adjust Lighting with HDR Profile
    if (window.Game && window.Game.pipeline) {
      window.Game.pipeline.applyLightingProfile(weatherKey, this.ambientLight, this.directionalLight);
    } else {
      if (this.ambientLight) {
        this.ambientLight.color.setHex(cfg.ambientColor);
        this.ambientLight.intensity = cfg.ambientIntensity;
      }
      if (this.directionalLight) {
        this.directionalLight.color.setHex(cfg.dirLightColor);
        this.directionalLight.intensity = cfg.dirLightIntensity;
      }
    }

    // 3. Cleanup old particles
    if (this.particleSystem) {
      this.weatherGroup.remove(this.particleSystem);
      if (this.particleSystem.geometry) this.particleSystem.geometry.dispose();
      if (this.particleSystem.material) this.particleSystem.material.dispose();
      this.particleSystem = null;
      this.particlePositions = null;
      this.particleVelocities = null;
    }

    // 4. Build new particle system
    if (cfg.particles !== 'none' && cfg.particleCount > 0) {
      this._createWeatherParticles(cfg.particles, Math.floor(cfg.particleCount * this.qualityMultiplier));
    }
  }

  /**
   * District-friendly weather for free roam: particles + fog only, never
   * touches the district lighting profile (unlike applyWeather, which is
   * tuned for circuit mode and would reset the dusk look).
   * @param {'clear'|'rain'|'fog'} kind
   * @param {{color:number, density:number}|null} fogBase district fog to restore
   */
  applyAmbientWeather(kind, fogBase) {
    if (kind !== 'rain' && kind !== 'fog') kind = 'clear';
    this.currentWeather = kind;
    // Cleanup old particles
    if (this.particleSystem) {
      this.weatherGroup.remove(this.particleSystem);
      if (this.particleSystem.geometry) this.particleSystem.geometry.dispose();
      if (this.particleSystem.material) this.particleSystem.material.dispose();
      this.particleSystem = null;
      this.particlePositions = null;
      this.particleVelocities = null;
    }
    if (kind === 'rain') this._createWeatherParticles('rain', Math.floor(1800 * this.qualityMultiplier));
    else if (kind === 'fog') this._createWeatherParticles('mist', Math.floor(800 * this.qualityMultiplier));
    if (this.scene.fog && fogBase) {
      if (kind === 'fog') {
        this.scene.fog.color.setHex(0x3a3f5c);
        this.scene.fog.density = fogBase.density * 2.2;
      } else if (kind === 'rain') {
        this.scene.fog.color.setHex(fogBase.color);
        this.scene.fog.density = fogBase.density * 1.35;
      } else {
        this.scene.fog.color.setHex(fogBase.color);
        this.scene.fog.density = fogBase.density;
      }
    }
  }

  _createWeatherParticles(type, count) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    const spreadX = 400;
    const spreadY = 250;
    const spreadZ = 400;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * spreadX;
      positions[idx + 1] = Math.random() * spreadY;
      positions[idx + 2] = (Math.random() - 0.5) * spreadZ;

      if (type === 'rain' || type === 'storm') {
        velocities[idx] = (Math.random() - 0.5) * 10;
        velocities[idx + 1] = -180 - Math.random() * 120; // Fast downward rain
        velocities[idx + 2] = (Math.random() - 0.5) * 10;
      } else if (type === 'mist') {
        velocities[idx] = (Math.random() - 0.5) * 4;
        velocities[idx + 1] = (Math.random() - 0.5) * 2;
        velocities[idx + 2] = (Math.random() - 0.5) * 4;
      } else if (type === 'energy') {
        velocities[idx] = (Math.random() - 0.5) * 15;
        velocities[idx + 1] = 20 + Math.random() * 40; // Floating upward energy sparks
        velocities[idx + 2] = (Math.random() - 0.5) * 15;
      } else if (type === 'stars') {
        velocities[idx] = 0;
        velocities[idx + 1] = (Math.random() - 0.5) * 1;
        velocities[idx + 2] = 0;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    let matColor = 0x88ccff;
    let size = 1.2;
    let opacity = 0.65;

    if (type === 'rain') {
      matColor = 0x77bbee;
      size = 1.4;
      opacity = 0.55;
    } else if (type === 'storm') {
      matColor = 0x99aaff;
      size = 1.8;
      opacity = 0.7;
    } else if (type === 'mist') {
      matColor = 0x5588aa;
      size = 4.5;
      opacity = 0.25;
    } else if (type === 'energy') {
      matColor = 0xff44dd;
      size = 2.2;
      opacity = 0.8;
    } else if (type === 'stars') {
      matColor = 0xddeeff;
      size = 1.0;
      opacity = 0.9;
    }

    const mat = new THREE.PointsMaterial({
      color: matColor,
      size: size,
      transparent: true,
      opacity: opacity,
      blending: type === 'energy' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });

    this.particleSystem = new THREE.Points(geo, mat);
    this.weatherGroup.add(this.particleSystem);
    this.particlePositions = positions;
    this.particleVelocities = velocities;
  }

  update(dt, cameraPosition) {
    // 1. Follow camera center so particles exist around the player vehicle
    if (cameraPosition && this.particleSystem) {
      this.weatherGroup.position.copy(cameraPosition);

      // Animate particles relative to the camera box
      const count = this.particlePositions.length / 3;
      const boxW = 400;
      const boxH = 250;
      const boxD = 400;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        this.particlePositions[idx] += this.particleVelocities[idx] * dt;
        this.particlePositions[idx + 1] += this.particleVelocities[idx + 1] * dt;
        this.particlePositions[idx + 2] += this.particleVelocities[idx + 2] * dt;

        // Wrap around boundaries
        if (this.particlePositions[idx + 1] < -20) {
          this.particlePositions[idx + 1] = boxH;
          this.particlePositions[idx] = (Math.random() - 0.5) * boxW;
          this.particlePositions[idx + 2] = (Math.random() - 0.5) * boxD;
        } else if (this.particlePositions[idx + 1] > boxH + 10) {
          this.particlePositions[idx + 1] = -10;
        }

        if (Math.abs(this.particlePositions[idx]) > boxW / 2) {
          this.particlePositions[idx] = -Math.sign(this.particlePositions[idx]) * (boxW / 2 - 2);
        }
        if (Math.abs(this.particlePositions[idx + 2]) > boxD / 2) {
          this.particlePositions[idx + 2] = -Math.sign(this.particlePositions[idx + 2]) * (boxD / 2 - 2);
        }
      }

      this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    // 2. Lightning flash updates for storm mode
    const cfg = this.presets[this.currentWeather];
    if (cfg && cfg.lightning) {
      if (this.lightningDuration > 0) {
        this.lightningDuration -= dt;
        if (this.lightningDuration <= 0) {
          this.lightningLight.intensity = 0;
          if (this.ambientLight) this.ambientLight.intensity = cfg.ambientIntensity;
        }
      } else {
        this.lightningCooldown -= dt;
        if (this.lightningCooldown <= 0) {
          // Trigger lightning flash
          this.lightningDuration = 0.12 + Math.random() * 0.15;
          this.lightningCooldown = 3.5 + Math.random() * 6.0;
          const flashIntensity = 5.0 + Math.random() * 4.0;
          this.lightningLight.intensity = flashIntensity;
          this.lightningLight.position.set(
            (Math.random() - 0.5) * 500,
            200 + Math.random() * 200,
            (Math.random() - 0.5) * 500
          );
          if (this.ambientLight) {
            this.ambientLight.intensity = cfg.ambientIntensity * 2.8;
          }
        }
      }
    } else {
      if (this.lightningLight.intensity > 0) {
        this.lightningLight.intensity = 0;
      }
    }
  }

  dispose() {
    if (this.particleSystem) {
      this.weatherGroup.remove(this.particleSystem);
      if (this.particleSystem.geometry) this.particleSystem.geometry.dispose();
      if (this.particleSystem.material) this.particleSystem.material.dispose();
    }
    this.scene.remove(this.weatherGroup);
  }
}

window.WeatherManager = WeatherManager;
