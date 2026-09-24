/**
 * Turbo Rush - High-Performance Supercar Model Generator
 * Implements three original fictional petrol-powered supercars under "Veloce Performance":
 *   1. Veloce V10 Corsa    - Mid-Engine Track Specialist (Butterfly doors, active wing, central exhaust)
 *   2. Veloce V8 GT        - Front-Engine Twin-Turbo GT (Conventional doors, muscular hood, quad exhausts)
 *   3. Veloce V12 Stradale - Rear-Mid-Engine Flagship (Dihedral doors, sculpted aero, high exhausts)
 * 
 * Strict Physical Invariant:
 * Maximum speed across all models is capped at 150.0 km/h (41.67 m/s).
 * Visual components include automotive PBR physical materials, modeled cockpits, functional dashboards,
 * rotating wheels, stationary brake calipers, animated doors, active aerodynamics, and 3 LOD tiers.
 */

class CarModel {
  constructor(colorHex = 0xe61a2b, isPlayer = false, carId = 'veloce_v10_corsa', lod = 0) {
    this.colorHex = typeof colorHex === 'number' ? colorHex : parseInt(String(colorHex).replace('#', '0x'));
    this.isPlayer = isPlayer;
    this.carId = carId || 'veloce_v10_corsa';
    this.lod = lod; // 0 = High (Player/Garage/Cockpit), 1 = Medium (AI Opponents), 2 = Low (Distant/Mobile)
    this.group = new THREE.Group();

    // Wheel bindings
    this.wheelFL = null;
    this.wheelFR = null;
    this.wheelRL = null;
    this.wheelRR = null;

    // Lighting & Effect meshes
    this.brakeLights = [];
    this.reverseLights = [];
    this.headlights = [];
    this.exhaustFlames = [];
    this.underglowMesh = null;
    this.steeringWheel = null;
    this.tachometerMesh = null;
    this.shiftLights = [];

    // Door & Active Aero groups for showroom & gameplay animations
    this.doorLeft = null;
    this.doorRight = null;
    this.doorOpenProgress = 0.0;
    this.activeWing = null;
    this.activeFlaps = [];
    this.activeAeroProgress = 0.0;

    // Load car data definition
    this.config = window.getCarById(this.carId);

    // Customization state
    this.customPaint = {
      color: this.colorHex || this.config.colorHex,
      finish: 'metallic', // 'metallic', 'gloss', 'matte', 'chrome'
      secondaryColor: 0x111317,
      decal: 'none'
    };
    this.customWheels = {
      finish: 'silver_chrome',
      caliperColor: 0xff1e38
    };
    this.customLighting = {
      headlightColor: 0xe6f4ff,
      taillightColor: 0xff002e,
      underglowColor: 0x00f0ff,
      nitroFlameColor: 0x00f0ff
    };

    this.initMaterials();
    this.buildCar();
  }

  initMaterials() {
    // 1. Primary Automotive Lacquer Paint (PBR MeshPhysicalMaterial)
    let metalness = 0.86;
    let roughness = 0.14;
    let clearcoat = 1.0;
    let clearcoatRoughness = 0.05;

    if (this.customPaint.finish === 'matte') {
      metalness = 0.12;
      roughness = 0.64;
      clearcoat = 0.0;
    } else if (this.customPaint.finish === 'chrome') {
      metalness = 0.98;
      roughness = 0.03;
      clearcoat = 1.0;
    } else if (this.customPaint.finish === 'gloss') {
      metalness = 0.32;
      roughness = 0.10;
      clearcoat = 0.95;
    }

    this.bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.customPaint.color),
      metalness,
      roughness,
      clearcoat,
      clearcoatRoughness,
      reflectivity: 0.96
    });

    // 2. Weave Carbon Fiber (Splitters, diffusers, side skirts, mirrors, wing)
    this.carbonMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.customPaint.secondaryColor),
      roughness: 0.36,
      metalness: 0.68
    });

    // 3. Tinted Automotive Curved Glass (Cockpit visible from exterior)
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a121c,
      metalness: 0.12,
      roughness: 0.03,
      transparent: true,
      opacity: this.lod === 0 ? 0.62 : 0.82,
      reflectivity: 0.94
    });

    // 4. Polished Chrome / Titanium (Exhaust tips, rotor surfaces, badges)
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      metalness: 0.96,
      roughness: 0.08
    });

    // 5. Tire Tread Rubber (Dark realistic compound)
    this.tireMat = new THREE.MeshStandardMaterial({
      color: 0x16171a,
      roughness: 0.88,
      metalness: 0.02
    });

    // 6. Alloy Wheel Rim Finish
    this.rimMat = this.createRimMaterial(this.customWheels.finish);

    // 7. High-Performance Brake Caliper
    this.caliperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.customWheels.caliperColor),
      metalness: 0.76,
      roughness: 0.20
    });

    // 7b. Carbon-Ceramic Drilled Brake Rotor with Dynamic Thermal Heat Glow
    this.rotorMat = new THREE.MeshStandardMaterial({
      color: 0x9aa2ac,
      metalness: 0.92,
      roughness: 0.25,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0
    });
    this.rotorHeat = 0.0;

    // 8. Functional Lighting Materials
    this.headlightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.customLighting.headlightColor),
      emissive: new THREE.Color(this.customLighting.headlightColor),
      emissiveIntensity: 3.6,
      roughness: 0.1
    });

    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0x440006,
      emissive: new THREE.Color(this.customLighting.taillightColor),
      emissiveIntensity: 0.9,
      roughness: 0.15
    });

    this.reverseLightMat = new THREE.MeshStandardMaterial({
      color: 0x222226,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      roughness: 0.1
    });

    // 9. Multi-Stage Nitro Flame Material
    this.flameMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.customLighting.nitroFlameColor),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending
    });

    // 10. Neon Ground Underglow
    this.underglowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.customLighting.underglowColor),
      transparent: true,
      opacity: 0.40,
      blending: THREE.AdditiveBlending
    });
  }

  createRimMaterial(finish) {
    switch (finish) {
      case 'gloss_black':
        return new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.90, roughness: 0.10 });
      case 'satin_bronze':
        return new THREE.MeshStandardMaterial({ color: 0xb27738, metalness: 0.84, roughness: 0.30 });
      case 'forged_gold':
        return new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.92, roughness: 0.18 });
      case 'gunmetal':
        return new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.92, roughness: 0.22 });
      case 'silver_chrome':
      default:
        return new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 0.96, roughness: 0.08 });
    }
  }

  buildCar() {
    // Clear old children if rebuilding
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.brakeLights = [];
    this.reverseLights = [];
    this.headlights = [];
    this.exhaustFlames = [];
    this.shiftLights = [];
    this.activeFlaps = [];

    const carData = this.config;
    const dims = carData.dimensions;
    const length = dims.length;
    const width = dims.width;
    const height = dims.height;
    const halfLen = length * 0.5;
    const halfWid = width * 0.5;
    const noseHeight = height * 0.44;

    const frontWheel = carData.wheels.front;
    const rearWheel = carData.wheels.rear;
    const wheelBase = carData.dimensions.wheelbase;
    const halfBase = wheelBase * 0.5;

    const carBody = new THREE.Group();
    // Rest directly on front wheel radius
    carBody.position.y = frontWheel.radius;

    // ─────────────────────────────────────────────
    // 1. AERODYNAMIC CARBON CHASSIS & UNDERBODY
    // ─────────────────────────────────────────────
    const chassisGeom = new THREE.BoxGeometry(width * 0.94, 0.12, length * 0.95);
    const chassis = new THREE.Mesh(chassisGeom, this.carbonMat);
    chassis.position.set(0, 0.06, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    carBody.add(chassis);

    // Aerodynamic Side Skirts with Longitudinal Vortex Generators
    [-1, 1].forEach(side => {
      const skirtGeom = new THREE.BoxGeometry(0.12, 0.07, length * 0.65);
      const skirt = new THREE.Mesh(skirtGeom, this.carbonMat);
      skirt.position.set(side * (halfWid + 0.02), 0.05, 0);
      carBody.add(skirt);
    });

    // ─────────────────────────────────────────────
    // 2. MODEL-SPECIFIC EXTERIOR GEOMETRY
    // ─────────────────────────────────────────────
    // Exterior builder is chosen by data (`bodyStyle`), falling back to the legacy id mapping
    const style = carData.bodyStyle || ({ v01_kairo_pulse_s: 'hatch', veloce_v8_gt: 'gt', veloce_v12_stradale: 'hyper' }[this.carId]) || 'track';
    if (style === 'hatch') {
      this.buildKairoPulseSExterior(carBody, length, width, height, halfLen, halfWid, noseHeight);
    } else if (style === 'gt') {
      this.buildV8GTExterior(carBody, length, width, height, halfLen, halfWid, noseHeight);
    } else if (style === 'hyper') {
      this.buildV12StradaleExterior(carBody, length, width, height, halfLen, halfWid, noseHeight);
    } else {
      // 'track': Veloce V10 Corsa silhouette
      this.buildV10CorsaExterior(carBody, length, width, height, halfLen, halfWid, noseHeight);
    }

    // ─────────────────────────────────────────────
    // 3. COCKPIT INTERIOR (LOD 0 & LOD 1)
    // ─────────────────────────────────────────────
    if (this.lod <= 1) {
      this.buildCockpitInterior(carBody, length, width, height, halfLen, noseHeight);
    }

    // ─────────────────────────────────────────────
    // 4. FUNCTIONAL LIGHTS & ROAD ILLUMINATION
    // ─────────────────────────────────────────────
    this.buildFunctionalLighting(carBody, carData, halfLen, width, noseHeight);

    // ─────────────────────────────────────────────
    // 5. EXHAUSTS & MULTI-STAGE NITRO
    // ─────────────────────────────────────────────
    this.buildExhaustsAndNitro(carBody, carData);

    // ─────────────────────────────────────────────
    // 6. CONTACT SHADOW & GROUND UNDERGLOW
    // ─────────────────────────────────────────────
    this.buildContactShadowAndUnderglow(carBody, width, length, frontWheel.radius);

    this.group.add(carBody);

    // ─────────────────────────────────────────────
    // 7. ALLOY WHEELS & STATIONARY BRAKE CALIPERS
    // ─────────────────────────────────────────────
    const halfTrack = width * 0.48;
    this.wheelFL = this.createWheel(-halfTrack, frontWheel.radius, halfBase, frontWheel.radius, frontWheel.width, true, true);
    this.wheelFR = this.createWheel(halfTrack, frontWheel.radius, halfBase, frontWheel.radius, frontWheel.width, false, true);
    this.wheelRL = this.createWheel(-halfTrack, rearWheel.radius, -halfBase, rearWheel.radius, rearWheel.width, true, false);
    this.wheelRR = this.createWheel(halfTrack, rearWheel.radius, -halfBase, rearWheel.radius, rearWheel.width, false, false);

    this.group.add(this.wheelFL.pivot);
    this.group.add(this.wheelFR.pivot);
    this.group.add(this.wheelRL.pivot);
    this.group.add(this.wheelRR.pivot);
  }

  // ==========================================================================
  // CAR 0: V01 KAIRO PULSE S (ACCESSIBLE FWD HOT HATCH)
  // ==========================================================================
  buildKairoPulseSExterior(carBody, length, width, height, halfLen, halfWid, noseHeight) {
    // 1. Sloped Compact Hood with Functional Induction Scoop
    const hoodLen = length * 0.28;
    const hoodGeom = new THREE.BoxGeometry(width * 0.86, noseHeight * 0.95, hoodLen);
    const hood = new THREE.Mesh(hoodGeom, this.bodyMat);
    hood.position.set(0, noseHeight * 0.52, halfLen - hoodLen * 0.5 - 0.05);
    hood.rotation.x = 0.12;
    hood.castShadow = true;
    hood.receiveShadow = true;
    carBody.add(hood);

    // Aggressive Front Bumper with Sharp Lower Trapezoidal Intake
    const bumperGeom = new THREE.BoxGeometry(width * 0.92, noseHeight * 0.70, 0.45);
    const bumper = new THREE.Mesh(bumperGeom, this.carbonMat);
    bumper.position.set(0, noseHeight * 0.35, halfLen - 0.22);
    bumper.castShadow = true;
    carBody.add(bumper);

    // Front Lower Splitter Blade
    const splitterGeom = new THREE.BoxGeometry(width * 0.96, 0.04, 0.42);
    const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
    splitter.position.set(0, 0.03, halfLen - 0.20);
    splitter.castShadow = true;
    carBody.add(splitter);

    // Split Dual Horizontal Headlight Optic Guide Blades (Original Light Motif)
    [-1, 1].forEach(side => {
      // Upper Optic Blade
      const blade1Geom = new THREE.BoxGeometry(width * 0.18, 0.025, 0.08);
      const blade1 = new THREE.Mesh(blade1Geom, new THREE.MeshBasicMaterial({ color: 0xc8f0ff }));
      blade1.position.set(side * (halfWid * 0.76), noseHeight * 0.78, halfLen - 0.04);
      carBody.add(blade1);

      // Lower Optic Blade (Staggered offset)
      const blade2Geom = new THREE.BoxGeometry(width * 0.14, 0.02, 0.08);
      const blade2 = new THREE.Mesh(blade2Geom, new THREE.MeshBasicMaterial({ color: 0x64d2ff }));
      blade2.position.set(side * (halfWid * 0.72), noseHeight * 0.68, halfLen - 0.03);
      carBody.add(blade2);
    });

    // 2. Muscular Flared Box Wheel Arches (Hot Hatch Stance)
    [-1, 1].forEach(side => {
      // Front Fender Flare
      const ffGeom = new THREE.CylinderGeometry(0.38, 0.38, width * 0.11, 18, 1, false, 0, Math.PI);
      ffGeom.rotateZ(Math.PI * 0.5);
      const ff = new THREE.Mesh(ffGeom, this.bodyMat);
      ff.position.set(side * (halfWid - 0.01), 0.10, length * 0.28);
      ff.castShadow = true;
      carBody.add(ff);

      // Rear Fender Flare
      const rfGeom = new THREE.CylinderGeometry(0.39, 0.39, width * 0.12, 18, 1, false, 0, Math.PI);
      rfGeom.rotateZ(Math.PI * 0.5);
      const rf = new THREE.Mesh(rfGeom, this.bodyMat);
      rf.position.set(side * (halfWid - 0.01), 0.11, -length * 0.28);
      rf.castShadow = true;
      carBody.add(rf);

      // Contrast Aerodynamic Side Mirror
      const mirrorGeom = new THREE.BoxGeometry(0.15, 0.08, 0.10);
      const mirror = new THREE.Mesh(mirrorGeom, this.carbonMat);
      mirror.position.set(side * (halfWid * 0.92), noseHeight + 0.36, length * 0.10);
      carBody.add(mirror);
    });

    // 3. Compact Mono-Volume Cabin Shell with Floating Black Roof
    const cabinLen = length * 0.54;
    const cabinWidth = width * 0.78;
    const cabinHeight = height - noseHeight;

    // Body Color Lower Cabin Beltline
    const cabinLowerGeom = new THREE.BoxGeometry(cabinWidth, cabinHeight * 0.45, cabinLen);
    const cabinLower = new THREE.Mesh(cabinLowerGeom, this.bodyMat);
    cabinLower.position.set(0, noseHeight + cabinHeight * 0.22, -0.05);
    cabinLower.castShadow = true;
    carBody.add(cabinLower);

    // Contrasting Floating Roof Panel (Gloss Black / Carbon)
    const roofGeom = new THREE.BoxGeometry(cabinWidth * 0.90, 0.045, cabinLen * 0.86);
    const roof = new THREE.Mesh(roofGeom, this.carbonMat);
    roof.position.set(0, height - 0.02, -0.08);
    roof.castShadow = true;
    carBody.add(roof);

    // Front Raked Windshield (High-Gloss Automotive Glass)
    const windshieldGeom = new THREE.PlaneGeometry(cabinWidth * 0.86, cabinHeight * 0.78);
    const windshield = new THREE.Mesh(windshieldGeom, this.glassMat);
    windshield.position.set(0, noseHeight + cabinHeight * 0.62, cabinLen * 0.38 - 0.05);
    windshield.rotation.x = -Math.PI * 0.32;
    carBody.add(windshield);

    // Rear Hatch Window (Steep Hot-Hatch Angle)
    const rearGlassGeom = new THREE.PlaneGeometry(cabinWidth * 0.82, cabinHeight * 0.75);
    const rearGlass = new THREE.Mesh(rearGlassGeom, this.glassMat);
    rearGlass.position.set(0, noseHeight + cabinHeight * 0.62, -cabinLen * 0.42 - 0.05);
    rearGlass.rotation.x = Math.PI * 0.36;
    rearGlass.rotation.y = Math.PI;
    carBody.add(rearGlass);

    // Side Windows and Gloss Black Pillars
    [-1, 1].forEach(side => {
      // Side Tinted Glass
      const sideGlassGeom = new THREE.PlaneGeometry(cabinLen * 0.72, cabinHeight * 0.50);
      const sideGlass = new THREE.Mesh(sideGlassGeom, this.glassMat);
      sideGlass.position.set(side * (cabinWidth * 0.44), noseHeight + cabinHeight * 0.60, -0.07);
      sideGlass.rotation.y = side * Math.PI * 0.5;
      carBody.add(sideGlass);

      // Gloss Black A-Pillar (Structural Slant)
      const aPillarGeom = new THREE.BoxGeometry(0.04, cabinHeight * 0.72, 0.04);
      const aPillar = new THREE.Mesh(aPillarGeom, this.carbonMat);
      aPillar.position.set(side * (cabinWidth * 0.43), noseHeight + cabinHeight * 0.62, cabinLen * 0.32 - 0.05);
      aPillar.rotation.x = -Math.PI * 0.32;
      carBody.add(aPillar);

      // Gloss Black C-Pillar (Floating Roof Break)
      const cPillarGeom = new THREE.BoxGeometry(0.05, cabinHeight * 0.68, 0.08);
      const cPillar = new THREE.Mesh(cPillarGeom, this.carbonMat);
      cPillar.position.set(side * (cabinWidth * 0.43), noseHeight + cabinHeight * 0.58, -cabinLen * 0.36);
      cPillar.rotation.x = Math.PI * 0.28;
      carBody.add(cPillar);
    });

    // Standard Hinged Doors
    this.buildDoors(carBody, width, length, noseHeight, 'standard');

    // 4. Short Rear Deck & Hatch Tailgate
    const hatchGeom = new THREE.BoxGeometry(width * 0.82, noseHeight * 0.92, length * 0.22);
    const hatch = new THREE.Mesh(hatchGeom, this.bodyMat);
    hatch.position.set(0, noseHeight * 0.50, -halfLen + length * 0.11);
    hatch.castShadow = true;
    carBody.add(hatch);

    // Rear Hatch Lower Diffuser
    const rearDiffuserGeom = new THREE.BoxGeometry(width * 0.86, 0.18, 0.40);
    const rearDiffuser = new THREE.Mesh(rearDiffuserGeom, this.carbonMat);
    rearDiffuser.position.set(0, 0.08, -halfLen + 0.16);
    rearDiffuser.rotation.x = -0.12;
    carBody.add(rearDiffuser);

    // Twin Round Exhaust Tips
    [-0.38, 0.38].forEach(x => {
      const tipGeom = new THREE.CylinderGeometry(0.055, 0.055, 0.18, 16);
      tipGeom.rotateX(Math.PI * 0.5);
      const tip = new THREE.Mesh(tipGeom, this.chromeMat);
      tip.position.set(x, 0.09, -halfLen + 0.06);
      carBody.add(tip);
    });

    // 5. Fixed Hot-Hatch Roof Spoiler with Dual Aero Fins
    this.activeWing = new THREE.Group();
    this.activeWing.position.set(0, height - 0.01, -halfLen + length * 0.18);

    const spoilerBladeGeom = new THREE.BoxGeometry(cabinWidth * 1.02, 0.03, 0.30);
    const spoilerBlade = new THREE.Mesh(spoilerBladeGeom, this.carbonMat);
    spoilerBlade.rotation.x = 0.08;
    spoilerBlade.castShadow = true;
    this.activeWing.add(spoilerBlade);

    // Integrated Spoiler Upright Brackets connecting to roof
    [-cabinWidth * 0.38, cabinWidth * 0.38].forEach(x => {
      const bracketGeom = new THREE.BoxGeometry(0.03, 0.08, 0.22);
      const bracket = new THREE.Mesh(bracketGeom, this.carbonMat);
      bracket.position.set(x, -0.03, -0.02);
      this.activeWing.add(bracket);
    });

    // Dual Aero Strakes / Fins
    [-cabinWidth * 0.42, cabinWidth * 0.42].forEach(x => {
      const strakeGeom = new THREE.BoxGeometry(0.025, 0.10, 0.32);
      const strake = new THREE.Mesh(strakeGeom, this.carbonMat);
      strake.position.set(x, 0.03, 0);
      this.activeWing.add(strake);
    });

    carBody.add(this.activeWing);
  }

  // ==========================================================================
  // CAR 1: VELOCE V10 CORSA (MID-ENGINE TRACK CAR)
  // ==========================================================================
  buildV10CorsaExterior(carBody, length, width, height, halfLen, halfWid, noseHeight) {
    // 1. Front Low Wedge Hood with Center Radiator Duct
    const hoodLen = length * 0.32;
    const hoodGeom = new THREE.BoxGeometry(width * 0.88, noseHeight * 0.88, hoodLen);
    const hood = new THREE.Mesh(hoodGeom, this.bodyMat);
    hood.position.set(0, noseHeight * 0.46, halfLen - hoodLen * 0.5 - 0.06);
    hood.rotation.x = 0.08;
    hood.castShadow = true;
    hood.receiveShadow = true;
    carBody.add(hood);

    // Front Carbon Splitter with Dual Dive Planes (Canards)
    const splitterGeom = new THREE.BoxGeometry(width * 1.04, 0.04, 0.58);
    const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
    splitter.position.set(0, 0.03, halfLen - 0.28);
    splitter.castShadow = true;
    carBody.add(splitter);

    // 2. Sculpted Wheel Arches with Aerodynamic Arch Louvers
    [-1, 1].forEach(side => {
      // Front Fender Flare
      const ffGeom = new THREE.CylinderGeometry(0.42, 0.42, width * 0.13, 18, 1, false, 0, Math.PI);
      ffGeom.rotateZ(Math.PI * 0.5);
      const ff = new THREE.Mesh(ffGeom, this.bodyMat);
      ff.position.set(side * (halfWid - 0.01), 0.12, length * 0.27);
      ff.castShadow = true;
      carBody.add(ff);

      // Fender Top Louvers (Air Extraction)
      const louverGeom = new THREE.BoxGeometry(0.18, 0.03, 0.28);
      const louver = new THREE.Mesh(louverGeom, this.carbonMat);
      louver.position.set(side * (halfWid * 0.84), noseHeight + 0.08, length * 0.26);
      carBody.add(louver);

      // Rear Fender Flare
      const rfGeom = new THREE.CylinderGeometry(0.44, 0.44, width * 0.16, 18, 1, false, 0, Math.PI);
      rfGeom.rotateZ(Math.PI * 0.5);
      const rf = new THREE.Mesh(rfGeom, this.bodyMat);
      rf.position.set(side * (halfWid + 0.02), 0.14, -length * 0.26);
      rf.castShadow = true;
      carBody.add(rf);

      // Deep Scalloped Side Radiator Intake Scoops
      const scoopGeom = new THREE.BoxGeometry(0.14, noseHeight * 0.70, length * 0.26);
      const scoop = new THREE.Mesh(scoopGeom, this.carbonMat);
      scoop.position.set(side * (halfWid + 0.01), noseHeight * 0.46, -length * 0.08);
      carBody.add(scoop);

      // Carbon Mirror Housing on A-Pillar
      const mirrorGeom = new THREE.BoxGeometry(0.17, 0.09, 0.11);
      const mirror = new THREE.Mesh(mirrorGeom, this.carbonMat);
      mirror.position.set(side * (halfWid * 0.94), noseHeight + 0.30, length * 0.12);
      carBody.add(mirror);
    });

    // 3. Butterfly Doors (Pivoted for Showroom Animation)
    this.buildDoors(carBody, width, length, noseHeight, 'butterfly');

    // 4. Rear Mid-Engine Decklid with Louvers
    const rearDeckGeom = new THREE.BoxGeometry(width * 0.86, noseHeight * 0.90, length * 0.30);
    const rearDeck = new THREE.Mesh(rearDeckGeom, this.bodyMat);
    rearDeck.position.set(0, noseHeight * 0.48, -halfLen + length * 0.16);
    rearDeck.castShadow = true;
    carBody.add(rearDeck);

    // Deep Venturi Diffuser Tunnels
    const diffuserGeom = new THREE.BoxGeometry(width * 0.88, 0.22, 0.56);
    const diffuser = new THREE.Mesh(diffuserGeom, this.carbonMat);
    diffuser.position.set(0, 0.09, -halfLen + 0.20);
    diffuser.rotation.x = -0.16;
    carBody.add(diffuser);

    // 5. Active Rear Wing (Raises with speed & tilts on braking)
    const wingWidth = width * 1.05;
    this.activeWing = new THREE.Group();
    this.activeWing.position.set(0, noseHeight + 0.36, -halfLen + 0.16);

    const wingBladeGeom = new THREE.BoxGeometry(wingWidth, 0.035, 0.36);
    const wingBlade = new THREE.Mesh(wingBladeGeom, this.carbonMat);
    wingBlade.castShadow = true;
    this.activeWing.add(wingBlade);

    // Swan-Neck Dual Carbon Stanchions
    [-wingWidth * 0.25, wingWidth * 0.25].forEach(x => {
      const stanchionGeom = new THREE.BoxGeometry(0.03, 0.36, 0.14);
      const stanchion = new THREE.Mesh(stanchionGeom, this.carbonMat);
      stanchion.position.set(x, -0.16, 0);
      this.activeWing.add(stanchion);
    });

    // Aerodynamic Carbon Endplates
    [-1, 1].forEach(side => {
      const plateGeom = new THREE.BoxGeometry(0.025, 0.20, 0.42);
      const plate = new THREE.Mesh(plateGeom, this.bodyMat);
      plate.position.set(side * (wingWidth * 0.5), 0, 0);
      this.activeWing.add(plate);
    });

    carBody.add(this.activeWing);

    // 6. Canopy Glass & Roof
    this.buildCanopyGlass(carBody, width * 0.74, height * 0.58, length * 0.42, noseHeight, -0.06 * length);
  }

  // ==========================================================================
  // CAR 2: VELOCE V8 GT (FRONT-ENGINE TWIN-TURBO GRAND TOURER)
  // ==========================================================================
  buildV8GTExterior(carBody, length, width, height, halfLen, halfWid, noseHeight) {
    // 1. Long Muscular Sculpted Hood
    const hoodLen = length * 0.40;
    const hoodGeom = new THREE.BoxGeometry(width * 0.86, noseHeight * 0.94, hoodLen);
    const hood = new THREE.Mesh(hoodGeom, this.bodyMat);
    hood.position.set(0, noseHeight * 0.50, halfLen - hoodLen * 0.5 - 0.08);
    hood.rotation.x = 0.04;
    hood.castShadow = true;
    hood.receiveShadow = true;
    carBody.add(hood);

    // Distinct Trapezoidal Front Mesh Grille
    const grilleGeom = new THREE.BoxGeometry(width * 0.72, noseHeight * 0.65, 0.25);
    const grille = new THREE.Mesh(grilleGeom, this.carbonMat);
    grille.position.set(0, noseHeight * 0.36, halfLen - 0.12);
    carBody.add(grille);

    // Dual Hood Heat Extractor Vents (Twin Turbo Cooling)
    [-0.30, 0.30].forEach(x => {
      const ventGeom = new THREE.BoxGeometry(0.22, 0.04, 0.45);
      const vent = new THREE.Mesh(ventGeom, this.carbonMat);
      vent.position.set(x, noseHeight + 0.04, halfLen - hoodLen * 0.65);
      carBody.add(vent);
    });

    // Front Extended Carbon Splitter
    const splitterGeom = new THREE.BoxGeometry(width * 1.02, 0.04, 0.52);
    const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
    splitter.position.set(0, 0.03, halfLen - 0.25);
    splitter.castShadow = true;
    carBody.add(splitter);

    // 2. Wide Muscular Haunches & Front Fender Air Exits
    [-1, 1].forEach(side => {
      // Front Fender Flare
      const ffGeom = new THREE.CylinderGeometry(0.43, 0.43, width * 0.14, 18, 1, false, 0, Math.PI);
      ffGeom.rotateZ(Math.PI * 0.5);
      const ff = new THREE.Mesh(ffGeom, this.bodyMat);
      ff.position.set(side * (halfWid - 0.01), 0.12, length * 0.28);
      ff.castShadow = true;
      carBody.add(ff);

      // Fender Air Slat / Extractor
      const slatGeom = new THREE.BoxGeometry(0.08, 0.22, 0.20);
      const slat = new THREE.Mesh(slatGeom, this.carbonMat);
      slat.position.set(side * (halfWid * 0.92), noseHeight * 0.55, length * 0.18);
      carBody.add(slat);

      // Muscular Wide Rear Haunches
      const rfGeom = new THREE.CylinderGeometry(0.45, 0.45, width * 0.17, 18, 1, false, 0, Math.PI);
      rfGeom.rotateZ(Math.PI * 0.5);
      const rf = new THREE.Mesh(rfGeom, this.bodyMat);
      rf.position.set(side * (halfWid + 0.03), 0.15, -length * 0.25);
      rf.castShadow = true;
      carBody.add(rf);

      // GT Wing Side Mirrors
      const mirrorGeom = new THREE.BoxGeometry(0.18, 0.10, 0.12);
      const mirror = new THREE.Mesh(mirrorGeom, this.carbonMat);
      mirror.position.set(side * (halfWid * 0.90), noseHeight + 0.32, length * 0.08);
      carBody.add(mirror);
    });

    // 3. Conventional Doors (Pivoted for Showroom Animation)
    this.buildDoors(carBody, width, length, noseHeight, 'conventional');

    // 4. Short Muscular Fastback Rear Deck
    const rearDeckGeom = new THREE.BoxGeometry(width * 0.88, noseHeight * 0.94, length * 0.25);
    const rearDeck = new THREE.Mesh(rearDeckGeom, this.bodyMat);
    rearDeck.position.set(0, noseHeight * 0.50, -halfLen + length * 0.13);
    rearDeck.castShadow = true;
    carBody.add(rearDeck);

    // Wide Diffuser
    const diffuserGeom = new THREE.BoxGeometry(width * 0.90, 0.20, 0.50);
    const diffuser = new THREE.Mesh(diffuserGeom, this.carbonMat);
    diffuser.position.set(0, 0.09, -halfLen + 0.18);
    diffuser.rotation.x = -0.12;
    carBody.add(diffuser);

    // 5. Large Fixed Racing GT Wing
    const wingWidth = width * 1.02;
    this.activeWing = new THREE.Group();
    this.activeWing.position.set(0, noseHeight + 0.42, -halfLen + 0.14);

    const wingBladeGeom = new THREE.BoxGeometry(wingWidth, 0.04, 0.38);
    const wingBlade = new THREE.Mesh(wingBladeGeom, this.carbonMat);
    wingBlade.castShadow = true;
    this.activeWing.add(wingBlade);

    // Upright Dual Stanchions
    [-wingWidth * 0.30, wingWidth * 0.30].forEach(x => {
      const stanchionGeom = new THREE.BoxGeometry(0.035, 0.42, 0.16);
      const stanchion = new THREE.Mesh(stanchionGeom, this.carbonMat);
      stanchion.position.set(x, -0.20, 0);
      this.activeWing.add(stanchion);
    });

    carBody.add(this.activeWing);

    // 6. Set-back Cabin Canopy Glass
    this.buildCanopyGlass(carBody, width * 0.74, height * 0.58, length * 0.40, noseHeight, -0.12 * length);
  }

  // ==========================================================================
  // CAR 3: VELOCE V12 STRADALE (REAR-MID-ENGINE FLAGSHIP HYPERCAR)
  // ==========================================================================
  buildV12StradaleExterior(carBody, length, width, height, halfLen, halfWid, noseHeight) {
    // 1. Ultra-Low Flow-Through Aerodynamic Nose
    const hoodLen = length * 0.30;
    const hoodGeom = new THREE.BoxGeometry(width * 0.88, noseHeight * 0.84, hoodLen);
    const hood = new THREE.Mesh(hoodGeom, this.bodyMat);
    hood.position.set(0, noseHeight * 0.44, halfLen - hoodLen * 0.5 - 0.06);
    hood.rotation.x = 0.09;
    hood.castShadow = true;
    hood.receiveShadow = true;
    carBody.add(hood);

    // Flow-through Aero Channels
    [-0.38, 0.38].forEach(x => {
      const channelGeom = new THREE.BoxGeometry(0.24, 0.06, hoodLen * 0.80);
      const channel = new THREE.Mesh(channelGeom, this.carbonMat);
      channel.position.set(x, noseHeight * 0.82, halfLen - hoodLen * 0.5);
      carBody.add(channel);
    });

    // Front Extended Carbon Splitter with Active Aero Flaps
    const splitterGeom = new THREE.BoxGeometry(width * 1.05, 0.04, 0.62);
    const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
    splitter.position.set(0, 0.03, halfLen - 0.30);
    splitter.castShadow = true;
    carBody.add(splitter);

    // Active Underbody Front Aero Flaps
    [-0.45, 0.45].forEach(x => {
      const flapGeom = new THREE.BoxGeometry(0.32, 0.02, 0.18);
      const flap = new THREE.Mesh(flapGeom, this.carbonMat);
      flap.position.set(x, 0.04, halfLen - 0.22);
      carBody.add(flap);
      this.activeFlaps.push(flap);
    });

    // 2. Sculpted Wheel Arches & Deep Side NACA Ducts
    [-1, 1].forEach(side => {
      // Front Fender
      const ffGeom = new THREE.CylinderGeometry(0.42, 0.42, width * 0.14, 18, 1, false, 0, Math.PI);
      ffGeom.rotateZ(Math.PI * 0.5);
      const ff = new THREE.Mesh(ffGeom, this.bodyMat);
      ff.position.set(side * (halfWid - 0.01), 0.12, length * 0.26);
      ff.castShadow = true;
      carBody.add(ff);

      // Rear Muscle Fender
      const rfGeom = new THREE.CylinderGeometry(0.45, 0.45, width * 0.17, 18, 1, false, 0, Math.PI);
      rfGeom.rotateZ(Math.PI * 0.5);
      const rf = new THREE.Mesh(rfGeom, this.bodyMat);
      rf.position.set(side * (halfWid + 0.03), 0.14, -length * 0.26);
      rf.castShadow = true;
      carBody.add(rf);

      // Deep Dual Side NACA Air Ducts (Cooling V12 Intercoolers)
      const nacaGeom = new THREE.BoxGeometry(0.16, noseHeight * 0.65, length * 0.28);
      const naca = new THREE.Mesh(nacaGeom, this.carbonMat);
      naca.position.set(side * (halfWid + 0.02), noseHeight * 0.45, -length * 0.06);
      carBody.add(naca);

      // Sculpted Camera-Mirror Stalk
      const mirrorGeom = new THREE.BoxGeometry(0.16, 0.07, 0.10);
      const mirror = new THREE.Mesh(mirrorGeom, this.carbonMat);
      mirror.position.set(side * (halfWid * 0.92), noseHeight + 0.28, length * 0.12);
      carBody.add(mirror);
    });

    // 3. Dihedral Doors (Pivoted for Showroom Animation)
    this.buildDoors(carBody, width, length, noseHeight, 'dihedral');

    // 4. Rear Engine Cover with Louvers revealing V12 Plenum
    const rearDeckGeom = new THREE.BoxGeometry(width * 0.88, noseHeight * 0.88, length * 0.32);
    const rearDeck = new THREE.Mesh(rearDeckGeom, this.bodyMat);
    rearDeck.position.set(0, noseHeight * 0.46, -halfLen + length * 0.17);
    rearDeck.castShadow = true;
    carBody.add(rearDeck);

    // Transparent Louvered V12 Engine Glass
    const engineGlassGeom = new THREE.BoxGeometry(width * 0.46, 0.03, length * 0.22);
    const engineGlass = new THREE.Mesh(engineGlassGeom, this.glassMat);
    engineGlass.position.set(0, noseHeight * 0.90, -halfLen + length * 0.18);
    carBody.add(engineGlass);

    // Visible V12 Chrome Intake Plenum below glass
    const plenumGeom = new THREE.BoxGeometry(width * 0.32, 0.10, length * 0.16);
    const plenum = new THREE.Mesh(plenumGeom, this.chromeMat);
    plenum.position.set(0, noseHeight * 0.80, -halfLen + length * 0.18);
    carBody.add(plenum);

    // Aggressive Venturi Tunnel Diffuser
    const diffuserGeom = new THREE.BoxGeometry(width * 0.92, 0.24, 0.60);
    const diffuser = new THREE.Mesh(diffuserGeom, this.carbonMat);
    diffuser.position.set(0, 0.09, -halfLen + 0.22);
    diffuser.rotation.x = -0.18;
    carBody.add(diffuser);

    // 5. Multi-Stage Active Rear Wing
    const wingWidth = width * 1.06;
    this.activeWing = new THREE.Group();
    this.activeWing.position.set(0, noseHeight + 0.32, -halfLen + 0.16);

    const wingBladeGeom = new THREE.BoxGeometry(wingWidth, 0.035, 0.38);
    const wingBlade = new THREE.Mesh(wingBladeGeom, this.carbonMat);
    wingBlade.castShadow = true;
    this.activeWing.add(wingBlade);

    // Hydraulic Center Actuator Pylons
    [-wingWidth * 0.22, wingWidth * 0.22].forEach(x => {
      const pylonGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12);
      const pylon = new THREE.Mesh(pylonGeom, this.chromeMat);
      pylon.position.set(x, -0.16, 0);
      this.activeWing.add(pylon);
    });

    carBody.add(this.activeWing);

    // 6. Canopy Glass & Roof-Mounted Ram-Air Scoop
    this.buildCanopyGlass(carBody, width * 0.74, height * 0.58, length * 0.42, noseHeight, -0.05 * length);

    // Roof-Mounted Ram-Air Snorkel Intake
    const roofScoopGeom = new THREE.BoxGeometry(0.26, 0.08, 0.42);
    const roofScoop = new THREE.Mesh(roofScoopGeom, this.carbonMat);
    roofScoop.position.set(0, noseHeight + height * 0.58 + 0.04, -0.05 * length);
    carBody.add(roofScoop);
  }

  // ==========================================================================
  // SHARED CANOPY, ROOF & CURVED GLASS
  // ==========================================================================
  buildCanopyGlass(carBody, cabinWidth, cabinHeight, cabinLen, noseHeight, cabinZ) {
    // 1. Aerodynamic Roof
    const roofGeom = new THREE.BoxGeometry(cabinWidth * 0.88, 0.05, cabinLen * 0.68);
    const roof = new THREE.Mesh(roofGeom, this.bodyMat);
    roof.position.set(0, noseHeight + cabinHeight * 0.96, cabinZ);
    roof.castShadow = true;
    carBody.add(roof);

    // 2. Front Raked Windshield
    const windshieldGeom = new THREE.PlaneGeometry(cabinWidth * 0.92, cabinHeight * 1.18);
    const windshield = new THREE.Mesh(windshieldGeom, this.glassMat);
    windshield.position.set(0, noseHeight + cabinHeight * 0.55, cabinZ + cabinLen * 0.46);
    windshield.rotation.x = -Math.PI * 0.34;
    carBody.add(windshield);

    // 3. Rear Fastback Window
    const rearWinGeom = new THREE.PlaneGeometry(cabinWidth * 0.90, cabinHeight * 1.15);
    const rearWin = new THREE.Mesh(rearWinGeom, this.glassMat);
    rearWin.position.set(0, noseHeight + cabinHeight * 0.52, cabinZ - cabinLen * 0.46);
    rearWin.rotation.x = Math.PI * 0.32;
    rearWin.rotation.y = Math.PI;
    carBody.add(rearWin);

    // 4. Side Windows
    [-1, 1].forEach(side => {
      const sideWinGeom = new THREE.PlaneGeometry(cabinLen * 0.78, cabinHeight * 0.68);
      const sideWin = new THREE.Mesh(sideWinGeom, this.glassMat);
      sideWin.position.set(side * cabinWidth * 0.49, noseHeight + cabinHeight * 0.46, cabinZ);
      sideWin.rotation.y = side * Math.PI * 0.5;
      carBody.add(sideWin);
    });
  }

  // ==========================================================================
  // FUNCTIONAL DOORS WITH PROPER SHOWROOM PIVOTS
  // ==========================================================================
  buildDoors(carBody, width, length, noseHeight, doorStyle) {
    const doorLen = length * 0.34;
    const doorWidth = width * 0.42;

    [-1, 1].forEach(side => {
      const doorPivotGroup = new THREE.Group();
      
      // Hinge pivot placement based on door style
      if (doorStyle === 'butterfly') {
        // Rotates forward and upward around A-pillar base
        doorPivotGroup.position.set(side * (width * 0.42), noseHeight * 0.55, length * 0.15);
      } else if (doorStyle === 'dihedral') {
        // Synchro-helix: sweeps outward and rotates vertically 90 degrees
        doorPivotGroup.position.set(side * (width * 0.44), noseHeight * 0.60, length * 0.14);
      } else {
        // Conventional: swings outward 65 degrees from front pillar
        doorPivotGroup.position.set(side * (width * 0.42), noseHeight * 0.50, length * 0.16);
      }

      // Door panel mesh relative to pivot
      const doorMeshGeom = new THREE.BoxGeometry(0.12, noseHeight * 0.85, doorLen);
      const doorMesh = new THREE.Mesh(doorMeshGeom, this.bodyMat);
      doorMesh.position.set(side * 0.05, 0, -doorLen * 0.45);
      doorMesh.castShadow = true;
      doorPivotGroup.add(doorMesh);

      // Interior Door Card / Handle (LOD 0)
      if (this.lod === 0) {
        const cardGeom = new THREE.BoxGeometry(0.04, noseHeight * 0.65, doorLen * 0.85);
        const card = new THREE.Mesh(cardGeom, this.carbonMat);
        card.position.set(-side * 0.02, 0, -doorLen * 0.45);
        doorPivotGroup.add(card);
      }

      carBody.add(doorPivotGroup);

      if (side === -1) this.doorLeft = { group: doorPivotGroup, style: doorStyle };
      else this.doorRight = { group: doorPivotGroup, style: doorStyle };
    });
  }

  // ==========================================================================
  // MODELED COCKPIT INTERIOR (LOD 0 & LOD 1)
  // ==========================================================================
  buildCockpitInterior(carBody, length, width, height, halfLen, noseHeight) {
    const interiorMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.82 });
    const carDef = (window.getCarById && window.getCarById(this.carId)) || {};
    const accentColor = carDef.accentColor !== undefined ? carDef.accentColor : (this.carId === 'veloce_v8_gt' ? 0x00d8ff : (this.carId === 'veloce_v12_stradale' ? 0xffaa00 : 0xff1e38));
    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.50 });

    const cabinZ = -0.06 * length;
    const cabinWidth = width * 0.74;
    const cabinLen = length * 0.42;

    // 1. Sculpted Carbon Dashboard with Center Console
    const dashGeom = new THREE.BoxGeometry(cabinWidth * 0.88, 0.28, 0.38);
    const dash = new THREE.Mesh(dashGeom, interiorMat);
    dash.position.set(0, noseHeight + 0.16, cabinZ + cabinLen * 0.30);
    carBody.add(dash);

    // Center Transmission Console with Aluminum Rockers
    const consoleGeom = new THREE.BoxGeometry(0.18, 0.20, cabinLen * 0.65);
    const consoleMesh = new THREE.Mesh(consoleGeom, this.carbonMat);
    consoleMesh.position.set(0, noseHeight + 0.08, cabinZ);
    carBody.add(consoleMesh);

    // 2. High-Tech Digital Instrument Cluster (HUD Screen)
    const hudCanvas = document.createElement('canvas');
    hudCanvas.width = 256;
    hudCanvas.height = 128;
    const hctx = hudCanvas.getContext('2d');
    hctx.fillStyle = '#0a0f18';
    hctx.fillRect(0, 0, 256, 128);
    hctx.fillStyle = '#00f0ff';
    hctx.font = 'bold 24px monospace';
    hctx.fillText('VELOCE DIGITAL', 20, 35);
    hctx.fillStyle = '#ffffff';
    hctx.font = 'bold 36px monospace';
    hctx.fillText('0 KM/H', 20, 80);
    hctx.fillStyle = '#ffaa00';
    hctx.font = '16px monospace';
    hctx.fillText('MAX 150 KM/H', 20, 110);

    const hudTex = new THREE.CanvasTexture(hudCanvas);
    const gaugeGeom = new THREE.PlaneGeometry(0.34, 0.16);
    const gaugeMat = new THREE.MeshBasicMaterial({ map: hudTex });
    this.tachometerMesh = new THREE.Mesh(gaugeGeom, gaugeMat);
    this.tachometerMesh.position.set(-cabinWidth * 0.24, noseHeight + 0.26, cabinZ + cabinLen * 0.28);
    this.tachometerMesh.rotation.x = -0.22;
    carBody.add(this.tachometerMesh);

    // Sequential Shift Lightbar above Cluster (Green -> Yellow -> Red -> Blue)
    const shiftColors = [0x00ff66, 0x00ff66, 0xffcc00, 0xffcc00, 0xff0033, 0x00f0ff];
    shiftColors.forEach((col, idx) => {
      const ledGeom = new THREE.BoxGeometry(0.035, 0.015, 0.012);
      const ledMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35 });
      const led = new THREE.Mesh(ledGeom, ledMat);
      led.position.set(-cabinWidth * 0.24 + (idx - 2.5) * 0.045, noseHeight + 0.35, cabinZ + cabinLen * 0.27);
      carBody.add(led);
      this.shiftLights.push(led);
    });

    // 3. Ergonomic Sports Steering Wheel (Rotates dynamically with steer inputs)
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(-cabinWidth * 0.24, noseHeight + 0.25, cabinZ + cabinLen * 0.15);
    wheelGroup.rotation.x = -0.34;

    const rimTorus = new THREE.TorusGeometry(0.135, 0.020, 8, 20);
    const wheelRim = new THREE.Mesh(rimTorus, this.carbonMat);
    wheelGroup.add(wheelRim);

    // 12-o'Clock Centering Stripe
    const stripeGeom = new THREE.BoxGeometry(0.022, 0.035, 0.025);
    const stripe = new THREE.Mesh(stripeGeom, accentMat);
    stripe.position.set(0, 0.135, 0);
    wheelGroup.add(stripe);

    // Center Hub & 3-Spoke Design
    const hubGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12);
    hubGeom.rotateX(Math.PI * 0.5);
    const hub = new THREE.Mesh(hubGeom, this.chromeMat);
    wheelGroup.add(hub);

    [-Math.PI * 0.5, 0, Math.PI * 0.5].forEach(ang => {
      const spokeGeom = new THREE.BoxGeometry(0.024, 0.10, 0.012);
      const spoke = new THREE.Mesh(spokeGeom, this.carbonMat);
      spoke.position.set(Math.cos(ang) * 0.06, Math.sin(ang) * 0.06, 0);
      spoke.rotation.z = ang;
      wheelGroup.add(spoke);
    });

    this.steeringWheel = wheelGroup;
    carBody.add(this.steeringWheel);

    // 4. Dual Racing Bucket Seats with 6-Point Harness Webbing
    [-1, 1].forEach(side => {
      const seatGroup = new THREE.Group();
      seatGroup.position.set(side * cabinWidth * 0.24, noseHeight + 0.04, cabinZ - 0.06);

      // Ultra-low carbon racing bucket seat (fits perfectly inside low supercar cabin)
      const baseGeom = new THREE.BoxGeometry(0.38, 0.06, 0.42);
      const seatBase = new THREE.Mesh(baseGeom, interiorMat);
      seatGroup.add(seatBase);

      // Reclined Racing Backrest
      const backGeom = new THREE.BoxGeometry(0.36, 0.38, 0.08);
      const seatBack = new THREE.Mesh(backGeom, accentMat);
      seatBack.position.set(0, 0.20, -0.16);
      seatBack.rotation.x = 0.12; // Reclined backwards into cabin
      seatGroup.add(seatBack);

      // Ergonomic Headrest
      const headGeom = new THREE.BoxGeometry(0.20, 0.10, 0.08);
      const headrest = new THREE.Mesh(headGeom, interiorMat);
      headrest.position.set(0, 0.42, -0.19);
      seatGroup.add(headrest);

      // 6-Point Harness Straps (LOD 0)
      if (this.lod === 0) {
        [-0.07, 0.07].forEach(hx => {
          const strapGeom = new THREE.BoxGeometry(0.035, 0.32, 0.01);
          const strap = new THREE.Mesh(strapGeom, accentMat);
          strap.position.set(hx, 0.20, -0.11);
          strap.rotation.x = 0.12;
          seatGroup.add(strap);
        });
      }

      carBody.add(seatGroup);
    });
  }

  // ==========================================================================
  // FUNCTIONAL LIGHTING & ROAD ILLUMINATION
  // ==========================================================================
  buildFunctionalLighting(carBody, carData, halfLen, width, noseHeight) {
    // 1. Hex-Blade Tri-Beam Projector Headlights
    const hlW = width * 0.24;
    [-1, 1].forEach(side => {
      const hlHousingGeom = new THREE.BoxGeometry(hlW, 0.08, 0.18);
      const hlMesh = new THREE.Mesh(hlHousingGeom, this.headlightMat);
      hlMesh.position.set(side * width * 0.32, noseHeight * 0.74, halfLen - 0.10);
      hlMesh.rotation.y = side * 0.22;
      carBody.add(hlMesh);
      this.headlights.push(hlMesh);

      // Real forward illumination for player car
      if (this.isPlayer) {
        const spot = new THREE.SpotLight(0xffffff, 2.8, 55, Math.PI * 0.22, 0.35);
        spot.position.set(side * 0.65, noseHeight + 0.2, halfLen);
        spot.target.position.set(side * 0.65, 0, halfLen + 25);
        carBody.add(spot);
        carBody.add(spot.target);
      }
    });

    // 2. Full-Width Horizon Blade Rear Lightbar
    const barWidth = carData.anchors.brakeLights[0].width || (width * 0.88);
    const barGeom = new THREE.BoxGeometry(barWidth, 0.06, 0.08);
    const brakeBar = new THREE.Mesh(barGeom, this.brakeLightMat);
    brakeBar.position.set(0, carData.anchors.brakeLights[0].y || (noseHeight * 0.74), -halfLen + 0.04);
    carBody.add(brakeBar);
    this.brakeLights.push(brakeBar);

    // 3. Dual Functional Reverse Lights
    [-0.34, 0.34].forEach(x => {
      const revGeom = new THREE.BoxGeometry(0.16, 0.04, 0.06);
      const revMesh = new THREE.Mesh(revGeom, this.reverseLightMat);
      revMesh.position.set(x, noseHeight * 0.58, -halfLen + 0.05);
      carBody.add(revMesh);
      this.reverseLights.push(revMesh);
    });
  }

  // ==========================================================================
  // EXHAUSTS & NITRO PRESENTATION
  // ==========================================================================
  buildExhaustsAndNitro(carBody, carData) {
    const exhausts = carData.anchors.exhausts || [];

    exhausts.forEach(ex => {
      // Chrome / Titanium Exhaust Tip
      const pipeGeom = new THREE.CylinderGeometry(ex.radius || 0.065, ex.radius || 0.065, 0.22, 16);
      pipeGeom.rotateX(Math.PI * 0.5);
      const pipe = new THREE.Mesh(pipeGeom, this.chromeMat);
      pipe.position.set(ex.x, ex.y, ex.z);
      carBody.add(pipe);

      // Nitro Flame Cone Thruster
      const flameGeom = new THREE.ConeGeometry((ex.radius || 0.065) * 1.8, 0.95, 14);
      flameGeom.rotateX(-Math.PI * 0.5);
      const flame = new THREE.Mesh(flameGeom, this.flameMat);
      flame.position.set(ex.x, ex.y, ex.z - 0.48);
      carBody.add(flame);
      this.exhaustFlames.push(flame);
    });
  }

  // ==========================================================================
  // CONTACT SHADOW & GROUND UNDERGLOW
  // ==========================================================================
  buildContactShadowAndUnderglow(carBody, width, length, wheelRadius) {
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    const grad = sctx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.74)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.68,
      depthWrite: false
    });
    const shadowGeom = new THREE.PlaneGeometry(width * 1.15, length * 1.10);
    const contactShadow = new THREE.Mesh(shadowGeom, shadowMat);
    contactShadow.rotation.x = -Math.PI * 0.5;
    contactShadow.position.set(0, -wheelRadius + 0.02, 0);
    carBody.add(contactShadow);

    // Ground Neon Underglow
    const underglowGeom = new THREE.PlaneGeometry(width * 0.95, length * 0.85);
    this.underglowMesh = new THREE.Mesh(underglowGeom, this.underglowMat);
    this.underglowMesh.rotation.x = Math.PI * 0.5;
    this.underglowMesh.position.set(0, -wheelRadius + 0.04, 0);
    carBody.add(this.underglowMesh);
  }

  // ==========================================================================
  // WHEELS & STATIONARY BRAKE CALIPERS
  // ==========================================================================
  createWheel(x, y, z, radius, thickness, isLeft, isFront) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);

    // Rotating Assembly (Tire + Rim + Drilled Rotor)
    const wheelMesh = new THREE.Group();

    // 1. Rubber Compound Tire
    const tireGeom = new THREE.CylinderGeometry(radius, radius, thickness, this.lod === 0 ? 28 : (this.lod === 1 ? 18 : 12));
    tireGeom.rotateZ(Math.PI * 0.5);
    const tire = new THREE.Mesh(tireGeom, this.tireMat);
    tire.castShadow = true;
    wheelMesh.add(tire);

    // 2. Alloy Rim Barrel & Lip
    const rimR = radius * 0.70;
    const rimGeom = new THREE.CylinderGeometry(rimR, rimR, thickness * 0.94, this.lod === 0 ? 24 : 14);
    rimGeom.rotateZ(Math.PI * 0.5);
    const rim = new THREE.Mesh(rimGeom, this.rimMat);
    wheelMesh.add(rim);

    // 3. Multi-Spoke Alloy Design
    const carDefW = (window.getCarById && window.getCarById(this.carId)) || {};
    const spokeCount = carDefW.spokeCount || (this.carId === 'veloce_v12_stradale' ? 5 : (this.carId === 'veloce_v10_corsa' ? 6 : 8));
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const spokeGeom = new THREE.BoxGeometry(thickness * 0.96, 0.038, rimR * 0.94);
      const spoke = new THREE.Mesh(spokeGeom, this.rimMat);
      spoke.rotation.x = angle;
      wheelMesh.add(spoke);
    }

    // 4. Center Cap / Hex Nut
    const capGeom = new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, thickness * 0.98, 8);
    capGeom.rotateZ(Math.PI * 0.5);
    const cap = new THREE.Mesh(capGeom, this.chromeMat);
    wheelMesh.add(cap);

    // 5. Drilled Brake Rotor (Rotates WITH the wheel, glows under heavy braking)
    if (this.lod <= 1) {
      const rotorGeom = new THREE.CylinderGeometry(rimR * 0.84, rimR * 0.84, 0.022, 18);
      rotorGeom.rotateZ(Math.PI * 0.5);
      const rotor = new THREE.Mesh(rotorGeom, this.rotorMat);
      rotor.position.set(isLeft ? thickness * 0.20 : -thickness * 0.20, 0, 0);
      wheelMesh.add(rotor);
    }

    pivot.add(wheelMesh);

    // 6. High-Performance Brake Caliper (Stationary on Pivot - DOES NOT ROTATE WITH WHEEL)
    if (this.lod <= 1) {
      const caliperGeom = new THREE.BoxGeometry(0.075, rimR * 0.44, 0.16);
      const caliper = new THREE.Mesh(caliperGeom, this.caliperMat);
      caliper.position.set(isLeft ? thickness * 0.22 : -thickness * 0.22, rimR * 0.46, 0);
      pivot.add(caliper);
    }

    return { pivot, mesh: wheelMesh, radius, isFront };
  }

  // ==========================================================================
  // SHOWROOM ANIMATIONS (DOORS & ACTIVE AERO)
  // ==========================================================================
  setDoorOpenProgress(progress) {
    // progress: 0.0 = fully closed, 1.0 = fully open
    this.doorOpenProgress = THREE.MathUtils.clamp(progress, 0, 1);

    if (this.doorLeft && this.doorLeft.group) {
      const style = this.doorLeft.style;
      if (style === 'butterfly') {
        this.doorLeft.group.rotation.x = -0.35 * this.doorOpenProgress;
        this.doorLeft.group.rotation.y = -0.45 * this.doorOpenProgress;
        this.doorLeft.group.rotation.z = -0.75 * this.doorOpenProgress;
      } else if (style === 'dihedral') {
        this.doorLeft.group.rotation.y = -0.30 * this.doorOpenProgress;
        this.doorLeft.group.rotation.z = -1.45 * this.doorOpenProgress;
      } else {
        // conventional
        this.doorLeft.group.rotation.y = -1.15 * this.doorOpenProgress;
      }
    }

    if (this.doorRight && this.doorRight.group) {
      const style = this.doorRight.style;
      if (style === 'butterfly') {
        this.doorRight.group.rotation.x = -0.35 * this.doorOpenProgress;
        this.doorRight.group.rotation.y = 0.45 * this.doorOpenProgress;
        this.doorRight.group.rotation.z = 0.75 * this.doorOpenProgress;
      } else if (style === 'dihedral') {
        this.doorRight.group.rotation.y = 0.30 * this.doorOpenProgress;
        this.doorRight.group.rotation.z = 1.45 * this.doorOpenProgress;
      } else {
        // conventional
        this.doorRight.group.rotation.y = 1.15 * this.doorOpenProgress;
      }
    }
  }

  setActiveAeroProgress(progress) {
    this.activeAeroProgress = THREE.MathUtils.clamp(progress, 0, 1);

    if (this.activeWing) {
      const carData = this.config;
      const aeroConfig = carData.bodyConfig ? carData.bodyConfig.activeAero : null;
      const restY = (aeroConfig && aeroConfig.restY) || 0.36;
      const deployY = (aeroConfig && aeroConfig.deployY) || 0.52;
      const airbrakePitch = (aeroConfig && aeroConfig.airbrakePitch) || 0.35;

      this.activeWing.position.y = (carData.dimensions.height * 0.44) + THREE.MathUtils.lerp(restY, deployY, this.activeAeroProgress);
      this.activeWing.rotation.x = -airbrakePitch * this.activeAeroProgress;
    }

    // Active front flaps
    this.activeFlaps.forEach(flap => {
      flap.rotation.x = -0.30 * this.activeAeroProgress;
    });
  }

  // ==========================================================================
  // REAL-TIME VISUAL STATE UPDATES (GAMEPLAY)
  // ==========================================================================
  updateVisuals(speed, steerAngle, isBraking, isNitro, isReversing = false, dt = 0.016, nitroTier = 'standard') {
    // 1. Wheel Rotation based on actual travel distance (omega = v / r)
    const frontR = (this.wheelFL && this.wheelFL.radius) || 0.35;
    const rearR = (this.wheelRL && this.wheelRL.radius) || 0.37;

    const frontRoll = (speed * dt) / frontR;
    const rearRoll = (speed * dt) / rearR;

    if (this.wheelFL && this.wheelFL.mesh) this.wheelFL.mesh.rotation.x += frontRoll;
    if (this.wheelFR && this.wheelFR.mesh) this.wheelFR.mesh.rotation.x += frontRoll;
    if (this.wheelRL && this.wheelRL.mesh) this.wheelRL.mesh.rotation.x += rearRoll;
    if (this.wheelRR && this.wheelRR.mesh) this.wheelRR.mesh.rotation.x += rearRoll;

    // 2. Steer Front Wheels Smoothly on Pivot
    if (this.wheelFL && this.wheelFL.pivot) this.wheelFL.pivot.rotation.y = steerAngle;
    if (this.wheelFR && this.wheelFR.pivot) this.wheelFR.pivot.rotation.y = steerAngle;

    // 3. Steer Cockpit Sports Steering Wheel
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -steerAngle * 2.2;
    }

    // 4. Dynamic Brake Flare Intensity & Brake Disc Heat Glow
    this.brakeLights.forEach(light => {
      if (light && light.material) {
        light.material.emissiveIntensity = isBraking ? 4.2 : 0.9;
      }
    });

    if (isBraking && speed > 5.0) {
      this.rotorHeat = Math.min(1.0, (this.rotorHeat || 0) + dt * 1.8);
    } else {
      this.rotorHeat = Math.max(0.0, (this.rotorHeat || 0) - dt * 0.45);
    }
    if (this.rotorMat) {
      this.rotorMat.emissive.setRGB(this.rotorHeat * 1.0, this.rotorHeat * 0.22, 0.0);
      this.rotorMat.emissiveIntensity = this.rotorHeat * 3.6;
    }

    // 5. Functional Reverse Lights
    this.reverseLights.forEach(light => {
      if (light && light.material) {
        light.material.emissiveIntensity = isReversing ? 2.8 : 0.0;
      }
    });

    // 6. Active Aerodynamics reacting to speed & braking
    const speedRatio = Math.min(1.0, Math.max(0, speed) / 41.67);
    let targetAero = 0.0;
    if (isBraking && speed > 10.0) {
      targetAero = 1.0; // Airbrake deployment under hard braking
    } else if (speedRatio > 0.45) {
      targetAero = (speedRatio - 0.45) / 0.55; // High downforce position at speed
    }
    this.activeAeroProgress = THREE.MathUtils.damp(this.activeAeroProgress, targetAero, 8.0, dt);
    this.setActiveAeroProgress(this.activeAeroProgress);

    // 7. Sequential Shift Lightbar & RPM simulation
    if (this.shiftLights.length > 0) {
      const rpmRatio = (speedRatio * 0.85) + (isNitro ? 0.15 : 0);
      const activeCount = Math.floor(rpmRatio * this.shiftLights.length);
      this.shiftLights.forEach((led, idx) => {
        led.material.opacity = idx <= activeCount ? 0.95 : 0.15;
      });
    }

    // 8. Multi-Stage Animated Nitro Exhaust Thrusters
    let flameColor = 0xff9900;
    let baseScaleZ = 1.1;
    let baseScaleXY = 1.0;

    if (nitroTier === 'overdrive') {
      flameColor = 0xe024c3; // Electric Violet-Magenta
      baseScaleZ = 2.1;
      baseScaleXY = 1.45;
    } else if (nitroTier === 'precision') {
      flameColor = 0x00f0ff; // Cool Cyan-Turquoise
      baseScaleZ = 1.55;
      baseScaleXY = 1.20;
    }

    if (this.flameMat) {
      this.flameMat.color.setHex(flameColor);
    }

    this.exhaustFlames.forEach(flame => {
      if (isNitro) {
        flame.material.opacity = 0.92 + Math.random() * 0.08;
        const scaleZ = baseScaleZ + Math.random() * 0.55;
        const scaleXY = baseScaleXY + Math.random() * 0.22;
        flame.scale.set(scaleXY, scaleXY, scaleZ);
      } else {
        flame.material.opacity = 0.0;
      }
    });

    // 9. Ground Neon Underglow Pulse
    if (this.underglowMesh) {
      const pulse = 0.38 + Math.sin(Date.now() * 0.005) * 0.10;
      this.underglowMesh.material.opacity = pulse + (isNitro ? 0.35 : 0);
    }
  }

  setCustomization(options = {}) {
    if (options.color !== undefined) {
      this.customPaint.color = typeof options.color === 'number' ? options.color : parseInt(String(options.color).replace('#', '0x'));
      this.bodyMat.color.set(this.customPaint.color);
    }
    if (options.finish !== undefined) {
      this.customPaint.finish = options.finish;
      if (options.finish === 'matte') {
        this.bodyMat.metalness = 0.12;
        this.bodyMat.roughness = 0.64;
        this.bodyMat.clearcoat = 0.0;
      } else if (options.finish === 'chrome') {
        this.bodyMat.metalness = 0.98;
        this.bodyMat.roughness = 0.03;
        this.bodyMat.clearcoat = 1.0;
      } else if (options.finish === 'gloss') {
        this.bodyMat.metalness = 0.32;
        this.bodyMat.roughness = 0.10;
        this.bodyMat.clearcoat = 0.95;
      } else {
        this.bodyMat.metalness = 0.86;
        this.bodyMat.roughness = 0.14;
        this.bodyMat.clearcoat = 1.0;
      }
    }
    if (options.rimFinish !== undefined) {
      this.customWheels.finish = options.rimFinish;
      const newRimMat = this.createRimMaterial(options.rimFinish);
      this.rimMat.color.copy(newRimMat.color);
      this.rimMat.metalness = newRimMat.metalness;
      this.rimMat.roughness = newRimMat.roughness;
    }
    if (options.underglowColor !== undefined) {
      this.customLighting.underglowColor = options.underglowColor;
      this.underglowMat.color.set(options.underglowColor);
    }
    // The garage/save store this as `nitroFlameColor`; accept both spellings.
    const flame = options.nitroFlameColor !== undefined ? options.nitroFlameColor : options.nitroColor;
    if (flame !== undefined) {
      this.customLighting.nitroFlameColor = flame;
      if (this.flameMat) this.flameMat.color.set(flame);
    }
  }

  applyUpgrades(upgrades) {
    // Upgrades handled authoritatively in ArcadeCarPhysics
  }

  /**
   * External GLTF / GLB Loader Integration
   * Loads production 3D assets while preserving node hierarchy and animations.
   */
  static loadGLTF(url, onLoad, onError) {
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('THREE.GLTFLoader not available; using procedural car model.');
      if (onError) onError(new Error('GLTFLoader not loaded'));
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        console.log('✅ Loaded external vehicle GLTF model:', url);
        if (onLoad) onLoad(gltf);
      },
      undefined,
      (err) => {
        console.warn('Failed to load GLTF asset at ' + url + ':', err);
        if (onError) onError(err);
      }
    );
  }

  attachGLTFModel(gltfScene) {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.externalModel = gltfScene;
    this.group.add(gltfScene);

    // Auto-discover wheel and lighting nodes if named in GLTF
    gltfScene.traverse(child => {
      const name = (child.name || '').toLowerCase();
      if (name.includes('wheel_fl') || name.includes('wheel_front_left')) {
        this.wheelFL = { pivot: child.parent || child, mesh: child, radius: 0.35, isFront: true };
      } else if (name.includes('wheel_fr') || name.includes('wheel_front_right')) {
        this.wheelFR = { pivot: child.parent || child, mesh: child, radius: 0.35, isFront: true };
      } else if (name.includes('wheel_rl') || name.includes('wheel_rear_left')) {
        this.wheelRL = { pivot: child.parent || child, mesh: child, radius: 0.37, isFront: false };
      } else if (name.includes('wheel_rr') || name.includes('wheel_rear_right')) {
        this.wheelRR = { pivot: child.parent || child, mesh: child, radius: 0.37, isFront: false };
      } else if (name.includes('steering_wheel')) {
        this.steeringWheel = child;
      } else if (name.includes('brake_light') && child.isMesh) {
        this.brakeLights.push(child);
      } else if (name.includes('headlight') && child.isMesh) {
        this.headlights.push(child);
      }
    });
  }
}

window.CarModel = CarModel;
