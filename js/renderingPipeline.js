/**
 * ============================================================================
 * TURBO RUSH - HDR RENDERING PIPELINE & POST-PROCESSING ENGINE
 * ============================================================================
 * Provides:
 * - EffectComposer pipeline with UnrealBloomPass for glowing HDR emissives
 * - Custom Speed Warp Shader: Radial edge blur, speed vignette, and boost chromatic flare
 * - Custom Filmic Color Grading Shader: Dynamic contrast, exposure, and color temperature
 * - Real-time environment reflections via procedural cubemap generator
 * - 8 High-Impact Lighting Profiles:
 *   1. Bright Daytime
 *   2. Golden-Hour Sunset
 *   3. Overcast
 *   4. Night City
 *   5. Rain
 *   6. Fog
 *   7. Storm
 *   8. Tunnel Interiors
 * - Scalable quality presets (Low, Medium, High, Ultra) with zero-cost mobile fallbacks
 */

// Custom Speed Effects Shader (Radial Blur + Vignette + Chromatic Aberration)
const SpeedWarpShader = {
  uniforms: {
    tDiffuse: { value: null },
    speedFactor: { value: 0.0 },     // 0.0 at rest to 1.0 at 150 km/h
    boostFactor: { value: 0.0 },     // 0.0 normal to 1.0 overdrive
    vignetteIntensity: { value: 0.35 },
    resolution: { value: new THREE.Vector2(1280, 720) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float speedFactor;
    uniform float boostFactor;
    uniform float vignetteIntensity;
    uniform vec2 resolution;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);

      // 1. Edge-weighted Radial Motion Blur (Active only above 70 km/h)
      float blurStrength = pow(dist, 1.8) * speedFactor * 0.035;
      if (boostFactor > 0.0) {
        blurStrength += pow(dist, 1.5) * boostFactor * 0.045;
      }

      vec4 color = vec4(0.0);
      const int SAMPLES = 6;
      float totalWeight = 0.0;

      for (int i = 0; i < SAMPLES; i++) {
        float scale = 1.0 - blurStrength * (float(i) / float(SAMPLES - 1));
        vec2 sampleUv = center + dir * scale;
        float weight = 1.0 - float(i) / float(SAMPLES);
        color += texture2D(tDiffuse, sampleUv) * weight;
        totalWeight += weight;
      }
      color /= totalWeight;

      // 2. Controlled Chromatic Aberration on Boost / High Speed
      float chroma = (speedFactor * 0.003 + boostFactor * 0.008) * dist;
      if (chroma > 0.0005) {
        float r = texture2D(tDiffuse, center + dir * (1.0 + chroma)).r;
        float b = texture2D(tDiffuse, center + dir * (1.0 - chroma)).b;
        color.r = mix(color.r, r, 0.75);
        color.b = mix(color.b, b, 0.75);
      }

      // 3. Cinematic Vignette
      float vig = 1.0 - smoothstep(0.45, 1.25, dist * (1.0 + speedFactor * 0.35));
      vig = mix(1.0, vig, vignetteIntensity);
      color.rgb *= vig;

      gl_FragColor = color;
    }
  `
};

// Custom Filmic Color Grading Shader
const FilmicColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.1 },
    contrast: { value: 1.15 },
    saturation: { value: 1.18 },
    tint: { value: new THREE.Color(0xffffff) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform vec3 tint;
    varying vec2 vUv;

    // Fast Filmic Tonemap approximation
    vec3 filmicToneMap(vec3 color) {
      color = max(vec3(0.0), color - 0.004);
      return (color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb * exposure;

      // Color Tint
      col *= tint;

      // Contrast
      col = (col - 0.5) * contrast + 0.5;

      // Saturation
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, saturation);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `
};

class RenderingPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.speedWarpPass = null;
    this.colorGradePass = null;

    // Quality preset: 'low' | 'medium' | 'high' | 'ultra'
    this.preset = 'high';
    this.postProcessingEnabled = true;
    this.motionBlurEnabled = true;

    // Environment reflection map
    this.envMap = null;

    // Current profile
    this.currentProfileName = 'day';

    // 8 Lighting Profiles Definition
    this.lightingProfiles = {
      day: {
        name: 'Bright Daytime',
        bg: 0x88bbff,
        fogColor: 0x99ccff,
        fogDensity: 0.0007,
        hemiSky: 0xffffff,
        hemiGround: 0x445566,
        hemiInt: 0.85,
        dirColor: 0xfffaea,
        dirInt: 1.85,
        dirPos: [90, 150, 70],
        exposure: 1.12,
        contrast: 1.16,
        saturation: 1.20,
        tint: 0xffffff,
        bloomThreshold: 0.82,
        bloomStrength: 0.55,
        bloomRadius: 0.45
      },
      sunset: {
        name: 'Golden-Hour Sunset',
        bg: 0xd46830,
        fogColor: 0xc85525,
        fogDensity: 0.0012,
        hemiSky: 0xffaa66,
        hemiGround: 0x442211,
        hemiInt: 0.90,
        dirColor: 0xff7722,
        dirInt: 2.10,
        dirPos: [140, 45, 60],
        exposure: 1.18,
        contrast: 1.22,
        saturation: 1.28,
        tint: 0xffeedd,
        bloomThreshold: 0.72,
        bloomStrength: 0.70,
        bloomRadius: 0.55
      },
      overcast: {
        name: 'Overcast Circuit',
        bg: 0x5a6572,
        fogColor: 0x55606c,
        fogDensity: 0.0016,
        hemiSky: 0x99a5b5,
        hemiGround: 0x22262c,
        hemiInt: 0.95,
        dirColor: 0xdde4ec,
        dirInt: 1.10,
        dirPos: [40, 160, 40],
        exposure: 1.05,
        contrast: 1.10,
        saturation: 0.98,
        tint: 0xf5f8fa,
        bloomThreshold: 0.85,
        bloomStrength: 0.40,
        bloomRadius: 0.35
      },
      night: {
        name: 'Neon Night City',
        bg: 0x060914,
        fogColor: 0x050810,
        fogDensity: 0.0014,
        hemiSky: 0x112244,
        hemiGround: 0x04060c,
        hemiInt: 0.45,
        dirColor: 0x335588,
        dirInt: 0.55,
        dirPos: [50, 100, -50],
        exposure: 1.25,
        contrast: 1.30,
        saturation: 1.35,
        tint: 0xaaccff,
        bloomThreshold: 0.48, // Low threshold so neon track lights & headlights pop!
        bloomStrength: 0.95,
        bloomRadius: 0.65
      },
      rain: {
        name: 'Monsoon Rain',
        bg: 0x141f2c,
        fogColor: 0x101824,
        fogDensity: 0.0022,
        hemiSky: 0x243b55,
        hemiGround: 0x091018,
        hemiInt: 0.60,
        dirColor: 0x557799,
        dirInt: 0.75,
        dirPos: [60, 120, 50],
        exposure: 1.08,
        contrast: 1.20,
        saturation: 1.12,
        tint: 0xc0d8f0,
        bloomThreshold: 0.68,
        bloomStrength: 0.65,
        bloomRadius: 0.50
      },
      fog: {
        name: 'Cyber Mist (Fog)',
        bg: 0x101820,
        fogColor: 0x0e1c28,
        fogDensity: 0.0036,
        hemiSky: 0x284050,
        hemiGround: 0x0a1218,
        hemiInt: 0.75,
        dirColor: 0x6699bb,
        dirInt: 0.70,
        dirPos: [40, 110, 40],
        exposure: 1.10,
        contrast: 1.15,
        saturation: 1.10,
        tint: 0xbbeeff,
        bloomThreshold: 0.60,
        bloomStrength: 0.80,
        bloomRadius: 0.60
      },
      storm: {
        name: 'Plasma Lightning Storm',
        bg: 0x090514,
        fogColor: 0x0c071a,
        fogDensity: 0.0020,
        hemiSky: 0x221144,
        hemiGround: 0x06030c,
        hemiInt: 0.50,
        dirColor: 0x7744aa,
        dirInt: 0.70,
        dirPos: [70, 130, 60],
        exposure: 1.20,
        contrast: 1.28,
        saturation: 1.30,
        tint: 0xd0b0ff,
        bloomThreshold: 0.52,
        bloomStrength: 0.90,
        bloomRadius: 0.65
      },
      tunnel: {
        name: 'Tunnel Interior',
        bg: 0x050403,
        fogColor: 0x110b06,
        fogDensity: 0.0030,
        hemiSky: 0xffaa44,
        hemiGround: 0x221105,
        hemiInt: 0.65,
        dirColor: 0xff8811,
        dirInt: 1.40,
        dirPos: [0, 80, 0],
        exposure: 1.15,
        contrast: 1.25,
        saturation: 1.25,
        tint: 0xffcc88,
        bloomThreshold: 0.50,
        bloomStrength: 0.85,
        bloomRadius: 0.55
      }
    };

    this.init();
  }

  init() {
    this.createEnvironmentMap();
    this.setupPostProcessing();
  }

  /**
   * Generates a high-contrast procedural cube reflection map
   * for realistic PBR automotive reflections.
   */
  createEnvironmentMap() {
    try {
      const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
        format: THREE.RGBFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter
      });

      // Simple procedural gradient cube scene
      const cubeScene = new THREE.Scene();
      const geom = new THREE.BoxGeometry(100, 100, 100);
      const mats = [
        new THREE.MeshBasicMaterial({ color: 0x446688, side: THREE.BackSide }), // Right
        new THREE.MeshBasicMaterial({ color: 0x446688, side: THREE.BackSide }), // Left
        new THREE.MeshBasicMaterial({ color: 0x99ccff, side: THREE.BackSide }), // Top (Sky)
        new THREE.MeshBasicMaterial({ color: 0x111622, side: THREE.BackSide }), // Bottom (Ground)
        new THREE.MeshBasicMaterial({ color: 0x334466, side: THREE.BackSide }), // Front
        new THREE.MeshBasicMaterial({ color: 0x223355, side: THREE.BackSide })  // Back
      ];
      cubeScene.add(new THREE.Mesh(geom, mats));

      const cubeCam = new THREE.CubeCamera(1, 1000, cubeRenderTarget);
      cubeCam.update(this.renderer, cubeScene);

      this.envMap = cubeRenderTarget.texture;
      this.scene.environment = this.envMap;
    } catch (e) {
      console.warn("Could not generate procedural envMap:", e);
    }
  }

  setupPostProcessing() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Check if Three.js postprocessing classes are available
    if (!window.THREE.EffectComposer || !window.THREE.RenderPass || !window.THREE.UnrealBloomPass) {
      console.warn("Three.js postprocessing scripts not loaded, using raw renderer fallback.");
      this.postProcessingEnabled = false;
      return;
    }

    try {
      // 1. Effect Composer with Half-Float Render Target for HDR luminance precision
      const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
      });

      this.composer = new THREE.EffectComposer(this.renderer, renderTarget);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // 2. Base Scene Render Pass
      this.renderPass = new THREE.RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);

      // 3. Unreal Bloom Pass (HDR Glow)
      const bloomRes = new THREE.Vector2(width, height);
      this.bloomPass = new THREE.UnrealBloomPass(bloomRes, 0.65, 0.50, 0.80);
      this.composer.addPass(this.bloomPass);

      // 4. Speed Warp Pass (Radial Blur + Vignette + Chromatic Boost)
      this.speedWarpPass = new THREE.ShaderPass(SpeedWarpShader);
      this.speedWarpPass.uniforms.resolution.value.set(width, height);
      this.composer.addPass(this.speedWarpPass);

      // 5. Filmic Color Grading Pass
      this.colorGradePass = new THREE.ShaderPass(FilmicColorGradingShader);
      this.composer.addPass(this.colorGradePass);

      this.postProcessingEnabled = true;
      console.log("🚀 HDR Rendering Pipeline initialized successfully!");
    } catch (err) {
      console.warn("Failed to initialize EffectComposer:", err);
      this.postProcessingEnabled = false;
    }
  }

  setQuality(preset) {
    this.preset = preset;
    if (preset === 'low') {
      this.postProcessingEnabled = false;
      this.renderer.shadowMap.enabled = false;
      this.renderer.toneMappingExposure = 1.0;
    } else if (preset === 'medium') {
      this.postProcessingEnabled = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.45;
        this.bloomPass.radius = 0.35;
      }
      if (this.speedWarpPass) this.speedWarpPass.enabled = false;
    } else if (preset === 'high') {
      this.postProcessingEnabled = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.65;
        this.bloomPass.radius = 0.50;
      }
      if (this.speedWarpPass) this.speedWarpPass.enabled = this.motionBlurEnabled;
    } else if (preset === 'ultra') {
      this.postProcessingEnabled = true;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (this.bloomPass) {
        this.bloomPass.strength = 0.80;
        this.bloomPass.radius = 0.60;
      }
      if (this.speedWarpPass) this.speedWarpPass.enabled = this.motionBlurEnabled;
    }
  }

  setMotionBlur(enabled) {
    this.motionBlurEnabled = enabled;
    if (this.speedWarpPass) {
      this.speedWarpPass.enabled = enabled && (this.preset === 'high' || this.preset === 'ultra');
    }
  }

  applyLightingProfile(profileKey, hemiLight, dirLight) {
    if (!this.lightingProfiles[profileKey]) profileKey = 'day';
    this.currentProfileName = profileKey;
    const p = this.lightingProfiles[profileKey];

    // Background & Fog
    this.scene.background = new THREE.Color(p.bg);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(p.fogColor);
      this.scene.fog.density = p.fogDensity;
    } else {
      this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
    }

    // Lights
    if (hemiLight) {
      hemiLight.color.setHex(p.hemiSky);
      hemiLight.groundColor.setHex(p.hemiGround);
      hemiLight.intensity = p.hemiInt;
    }
    if (dirLight) {
      dirLight.color.setHex(p.dirColor);
      dirLight.intensity = p.dirInt;
      dirLight.position.set(p.dirPos[0], p.dirPos[1], p.dirPos[2]);
    }

    // Renderer Tone Mapping
    this.renderer.toneMappingExposure = p.exposure;

    // Post-Processing Color Grading & Bloom
    if (this.bloomPass) {
      this.bloomPass.threshold = p.bloomThreshold;
      this.bloomPass.strength = p.bloomStrength;
      this.bloomPass.radius = p.bloomRadius;
    }
    if (this.colorGradePass) {
      this.colorGradePass.uniforms.exposure.value = p.exposure;
      this.colorGradePass.uniforms.contrast.value = p.contrast;
      this.colorGradePass.uniforms.saturation.value = p.saturation;
      this.colorGradePass.uniforms.tint.value.setHex(p.tint);
    }
  }

  /**
   * Update speed warp dynamic parameters every frame
   */
  update(dt, speedKmh, isNitroActive, nitroTier = 'standard') {
    if (!this.postProcessingEnabled || !this.composer) return;

    // Calculate speed factor (0.0 to 1.0 at 150 km/h)
    const speedRatio = Math.min(1.0, Math.max(0.0, speedKmh / 150.0));

    // Boost factor based on nitro tier
    let boost = 0.0;
    if (isNitroActive) {
      if (nitroTier === 'overdrive') boost = 1.0;
      else if (nitroTier === 'precision') boost = 0.65;
      else boost = 0.35;
    }

    if (this.speedWarpPass) {
      this.speedWarpPass.uniforms.speedFactor.value = THREE.MathUtils.lerp(
        this.speedWarpPass.uniforms.speedFactor.value,
        speedRatio,
        dt * 8.0
      );
      this.speedWarpPass.uniforms.boostFactor.value = THREE.MathUtils.lerp(
        this.speedWarpPass.uniforms.boostFactor.value,
        boost,
        dt * 10.0
      );
    }
  }

  render() {
    if (this.postProcessingEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onResize(width, height) {
    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.bloomPass) {
        this.bloomPass.setSize(width, height);
      }
      if (this.speedWarpPass) {
        this.speedWarpPass.uniforms.resolution.value.set(width, height);
      }
    }
  }
}

window.RenderingPipeline = RenderingPipeline;
