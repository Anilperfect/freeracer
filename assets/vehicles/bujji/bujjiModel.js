/**
 * Turbo Rush - Bujji 3D Hero Car Model Generator & LOD Pipeline
 * Implements the original fictional armored performance hybrid hyper-GT "Bujji".
 * 
 * Strict Physical Invariant:
 * 150.0 km/h hard cap strictly respected.
 * Zero anti-gravity components. Four road wheels on standard road-racing physics.
 * 
 * Exact Dimensions:
 * - Length: 4.90m, Width: 2.10m, Height: 1.27m, Wheelbase: 2.93m
 * - Front Track: 1.76m, Rear Track: 1.80m, Ground Clearance: 0.110m
 * - Front Wheels: 21" (Radius: 0.36m, Width: 0.295m)
 * - Rear Wheels: 22" (Radius: 0.38m, Width: 0.355m)
 */

(function() {
  function initBujjiModel() {
    if (!window.CarModel || !window.CarModel.prototype) {
      setTimeout(initBujjiModel, 100);
      return;
    }

    // Hook CarModel.prototype.buildCar cleanly for carId === 'bujji'
    const originalBuildCar = window.CarModel.prototype.buildCar;

    window.CarModel.prototype.buildCar = function() {
      if (this.carId === 'bujji') {
        this.buildBujjiCar();
      } else {
        originalBuildCar.apply(this, arguments);
      }
    };

    /**
     * Master Assembly Method for Bujji
     */
    window.CarModel.prototype.buildBujjiCar = function() {
      // Clear existing children
      while (this.group.children.length > 0) {
        this.group.remove(this.group.children[0]);
      }

      this.brakeLights = [];
      this.reverseLights = [];
      this.headlights = [];
      this.exhaustFlames = [];
      this.shiftLights = [];
      this.activeFlaps = [];

      // Bujji Specific Materials
      this.armorMat = new THREE.MeshStandardMaterial({
        color: 0xc4ccd6, // Satin aerospace aluminum
        metalness: 0.90,
        roughness: 0.28
      });
      if (window.BujjiTextures && window.BujjiTextures.createBrushedArmorTexture) {
        this.armorMat.map = window.BujjiTextures.createBrushedArmorTexture();
      }

      this.orangeAccentMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff4400,
        emissiveIntensity: 1.8,
        roughness: 0.25,
        metalness: 0.70
      });

      this.heroDarkMat = new THREE.MeshStandardMaterial({
        color: 0x16181d,
        metalness: 0.85,
        roughness: 0.35
      });

      const carData = this.config;
      const dims = carData.dimensions;
      const length = dims.length; // 4.90
      const width = dims.width;   // 2.10
      const height = dims.height; // 1.27
      const halfLen = length * 0.5; // 2.45
      const halfWid = width * 0.5;  // 1.05
      const noseHeight = height * 0.44;

      const frontWheel = carData.wheels.front; // r: 0.36
      const rearWheel = carData.wheels.rear;   // r: 0.38
      const wheelBase = dims.wheelbase; // 2.93
      const halfBase = wheelBase * 0.5; // 1.465

      const carBody = new THREE.Group();
      carBody.position.y = frontWheel.radius;

      // ─────────────────────────────────────────────
      // 1. CARBON CHASSIS & AERODYNAMIC UNDERBODY
      // ─────────────────────────────────────────────
      const chassisGeom = new THREE.BoxGeometry(width * 0.92, 0.14, length * 0.96);
      const chassis = new THREE.Mesh(chassisGeom, this.carbonMat);
      chassis.position.set(0, 0.07, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      carBody.add(chassis);

      // Carbon Side Skirts with Longitudinal Vortex Edge Fins
      [-1, 1].forEach(side => {
        const skirtGeom = new THREE.BoxGeometry(0.14, 0.08, length * 0.62);
        const skirt = new THREE.Mesh(skirtGeom, this.carbonMat);
        skirt.position.set(side * (halfWid + 0.03), 0.06, 0.02);
        carBody.add(skirt);

        // Skirt Aero Winglet
        const wingletGeom = new THREE.BoxGeometry(0.04, 0.20, 0.35);
        const winglet = new THREE.Mesh(wingletGeom, this.carbonMat);
        winglet.position.set(side * (halfWid + 0.09), 0.14, -halfLen * 0.35);
        carBody.add(winglet);
      });

      // ─────────────────────────────────────────────
      // 2. BUJJI EXTERIOR BODYWORK & LAYERED ARMOR
      // ─────────────────────────────────────────────
      this.buildBujjiExterior(carBody, length, width, height, halfLen, halfWid, noseHeight);

      // ─────────────────────────────────────────────
      // 3. COCKPIT INTERIOR & DIGITAL DASHBOARD (LOD 0 & 1)
      // ─────────────────────────────────────────────
      if (this.lod <= 1) {
        this.buildBujjiCockpit(carBody, length, width, height, halfLen, noseHeight);
      }

      // ─────────────────────────────────────────────
      // 4. FUNCTIONAL LIGHTING
      // ─────────────────────────────────────────────
      this.buildBujjiLighting(carBody, halfLen, width, noseHeight);

      // ─────────────────────────────────────────────
      // 5. EXHAUSTS & NITRO THRUSTERS
      // ─────────────────────────────────────────────
      this.buildBujjiExhaustsAndNitro(carBody, halfLen);

      // ─────────────────────────────────────────────
      // 6. CONTACT SHADOW & GROUND UNDERGLOW
      // ─────────────────────────────────────────────
      this.buildContactShadowAndUnderglow(carBody, width, length, frontWheel.radius);

      this.group.add(carBody);

      // ─────────────────────────────────────────────
      // 7. 21" FRONT & 22" REAR TURBINE ALLOY WHEELS & ROTORS
      // ─────────────────────────────────────────────
      const frontTrackHalf = (carData.dimensions.frontTrackWidth || 1.76) * 0.5;
      const rearTrackHalf = (carData.dimensions.rearTrackWidth || 1.80) * 0.5;

      this.wheelFL = this.createBujjiWheel(-frontTrackHalf, frontWheel.radius, halfBase, frontWheel.radius, frontWheel.width, true, true);
      this.wheelFR = this.createBujjiWheel(frontTrackHalf, frontWheel.radius, halfBase, frontWheel.radius, frontWheel.width, false, true);
      this.wheelRL = this.createBujjiWheel(-rearTrackHalf, rearWheel.radius, -halfBase, rearWheel.radius, rearWheel.width, true, false);
      this.wheelRR = this.createBujjiWheel(rearTrackHalf, rearWheel.radius, -halfBase, rearWheel.radius, rearWheel.width, false, false);

      this.group.add(this.wheelFL.pivot);
      this.group.add(this.wheelFR.pivot);
      this.group.add(this.wheelRL.pivot);
      this.group.add(this.wheelRR.pivot);
    };

    /**
     * Exterior Sculpting: Low Wedge Nose, Layered Armor, Butterfly Doors, Active Aero
     */
    window.CarModel.prototype.buildBujjiExterior = function(carBody, length, width, height, halfLen, halfWid, noseHeight) {
      // A. Front Carbon Splitter with Dual Dive Planes & Central Aero Channel
      const splitterGeom = new THREE.BoxGeometry(width * 0.98, 0.05, 0.75);
      const splitter = new THREE.Mesh(splitterGeom, this.carbonMat);
      splitter.position.set(0, 0.025, halfLen - 0.32);
      carBody.add(splitter);

      // Active Front Aerodynamic Dive Flaps
      [-1, 1].forEach(side => {
        const flapPivot = new THREE.Group();
        flapPivot.position.set(side * (halfWid * 0.72), 0.06, halfLen - 0.40);
        const flapGeom = new THREE.BoxGeometry(0.35, 0.02, 0.18);
        const flap = new THREE.Mesh(flapGeom, this.carbonMat);
        flap.position.set(0, 0, 0);
        flapPivot.add(flap);
        carBody.add(flapPivot);
        this.activeFlaps.push(flapPivot);
      });

      // B. Sculpted Armor Nose & Hood with Twin Radiator Extraction Ducts
      const hoodLen = length * 0.34;
      const hoodGeom = new THREE.BoxGeometry(width * 0.86, noseHeight * 0.76, hoodLen);
      const hood = new THREE.Mesh(hoodGeom, this.bodyMat); // Gunmetal metallic base
      hood.position.set(0, noseHeight * 0.44, halfLen - hoodLen * 0.5 - 0.10);
      hood.rotation.x = 0.08;
      hood.castShadow = true;
      hood.receiveShadow = true;
      carBody.add(hood);

      // Satin Aluminum Layered Hood Armor Plates (Structural Ballistic Deflectors)
      [-1, 1].forEach(side => {
        const plateGeom = new THREE.BoxGeometry(width * 0.28, 0.04, hoodLen * 0.75);
        const plate = new THREE.Mesh(plateGeom, this.armorMat);
        plate.position.set(side * (width * 0.26), noseHeight * 0.85, halfLen - hoodLen * 0.52);
        plate.rotation.x = 0.09;
        plate.rotation.z = side * -0.06;
        plate.castShadow = true;
        carBody.add(plate);
      });

      // Center Twin Heat Extraction Ducts (Carbon Fins)
      const ductGeom = new THREE.BoxGeometry(width * 0.22, 0.03, hoodLen * 0.55);
      const duct = new THREE.Mesh(ductGeom, this.carbonMat);
      duct.position.set(0, noseHeight * 0.84, halfLen - hoodLen * 0.50);
      duct.rotation.x = 0.12;
      carBody.add(duct);

      // C. Front Muscular Wheel Arch Armor Flares
      [-1, 1].forEach(side => {
        const archGeom = new THREE.BoxGeometry(0.18, noseHeight * 0.95, length * 0.26);
        const arch = new THREE.Mesh(archGeom, this.armorMat);
        arch.position.set(side * (halfWid - 0.01), noseHeight * 0.52, halfLen * 0.60);
        arch.castShadow = true;
        carBody.add(arch);

        // Armor Bevel Inset
        const bevelGeom = new THREE.BoxGeometry(0.04, noseHeight * 0.70, length * 0.22);
        const bevel = new THREE.Mesh(bevelGeom, this.heroDarkMat);
        bevel.position.set(side * (halfWid + 0.08), noseHeight * 0.52, halfLen * 0.60);
        carBody.add(bevel);
      });

      // D. Mid Cabin Wraparound Tinted Canopy (Aero Capsule)
      const cabinLen = length * 0.46;
      const cabinWid = width * 0.74;
      const cabinH = height * 0.56;

      const canopyGeom = new THREE.BoxGeometry(cabinWid, cabinH, cabinLen);
      const canopy = new THREE.Mesh(canopyGeom, this.glassMat);
      canopy.position.set(0, noseHeight + cabinH * 0.44, 0.08);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      carBody.add(canopy);

      // Carbon Monocoque Roof Spine with Ram-Air Intake Tunnel
      const roofSpineGeom = new THREE.BoxGeometry(cabinWid * 0.32, 0.06, cabinLen * 0.94);
      const roofSpine = new THREE.Mesh(roofSpineGeom, this.carbonMat);
      roofSpine.position.set(0, noseHeight + cabinH * 0.94, 0.08);
      carBody.add(roofSpine);

      // Ram-Air Intake Scoop for Twin-Turbo V6
      const scoopGeom = new THREE.BoxGeometry(cabinWid * 0.24, 0.08, 0.45);
      const scoop = new THREE.Mesh(scoopGeom, this.armorMat);
      scoop.position.set(0, noseHeight + cabinH * 0.98, -cabinLen * 0.25);
      carBody.add(scoop);

      // E. Butterfly Doors with Articulated High-Pivot Cantilever Hinges
      [-1, 1].forEach(side => {
        const doorPivot = new THREE.Group();
        // Hinge location at upper A-pillar base
        doorPivot.position.set(side * (halfWid * 0.82), noseHeight * 0.65, 0.68);

        const doorMeshGroup = new THREE.Group();

        // 1. Exterior Satin Armor Door Skin
        const doorGeom = new THREE.BoxGeometry(0.12, height * 0.46, cabinLen * 0.60);
        const doorSkin = new THREE.Mesh(doorGeom, this.armorMat);
        doorSkin.position.set(side * 0.12, 0, -cabinLen * 0.28);
        doorSkin.castShadow = true;
        doorMeshGroup.add(doorSkin);

        // 2. Sculpted Flank Air Channel on Door
        const channelGeom = new THREE.BoxGeometry(0.08, height * 0.28, cabinLen * 0.55);
        const channel = new THREE.Mesh(channelGeom, this.bodyMat);
        channel.position.set(side * 0.08, -0.04, -cabinLen * 0.28);
        doorMeshGroup.add(channel);

        // 3. Carbon Door Mirror Camera Pod (High-tech compact aero mirror)
        const cameraPodGeom = new THREE.BoxGeometry(0.24, 0.06, 0.12);
        const cameraPod = new THREE.Mesh(cameraPodGeom, this.carbonMat);
        cameraPod.position.set(side * 0.26, height * 0.24, 0.05);
        doorMeshGroup.add(cameraPod);

        const lensGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12);
        lensGeom.rotateX(Math.PI * 0.5);
        const lens = new THREE.Mesh(lensGeom, this.orangeAccentMat);
        lens.position.set(side * 0.36, height * 0.24, 0.02);
        doorMeshGroup.add(lens);

        doorPivot.add(doorMeshGroup);
        carBody.add(doorPivot);

        if (side === -1) {
          this.doorLeft = { group: doorPivot, style: 'butterfly' };
        } else {
          this.doorRight = { group: doorPivot, style: 'butterfly' };
        }
      });

      // F. Deep Side Radiator Cooling Ducts & Floating Armor Blades
      [-1, 1].forEach(side => {
        const bladeGeom = new THREE.BoxGeometry(0.08, height * 0.42, 0.75);
        const blade = new THREE.Mesh(bladeGeom, this.armorMat);
        blade.position.set(side * (halfWid + 0.02), noseHeight * 0.72, -0.38);
        blade.rotation.y = side * -0.08;
        blade.castShadow = true;
        carBody.add(blade);

        // Inner Cooling Radiator Mesh
        const radGeom = new THREE.BoxGeometry(0.18, height * 0.32, 0.45);
        const rad = new THREE.Mesh(radGeom, this.heroDarkMat);
        rad.position.set(side * (halfWid - 0.12), noseHeight * 0.68, -0.38);
        carBody.add(rad);
      });

      // G. Rear Muscular Wheel Arches & Structural Armor Shoulders
      [-1, 1].forEach(side => {
        const rearArchGeom = new THREE.BoxGeometry(0.24, noseHeight * 1.05, length * 0.28);
        const rearArch = new THREE.Mesh(rearArchGeom, this.armorMat);
        rearArch.position.set(side * (halfWid + 0.02), noseHeight * 0.56, -halfLen * 0.58);
        rearArch.castShadow = true;
        carBody.add(rearArch);
      });

      // H. Rear Engine Deck & Twin-Turbo V6 Louvered Armor Cover
      const deckLen = length * 0.30;
      const deckGeom = new THREE.BoxGeometry(width * 0.82, noseHeight * 0.82, deckLen);
      const deck = new THREE.Mesh(deckGeom, this.bodyMat);
      deck.position.set(0, noseHeight * 0.52, -halfLen + deckLen * 0.5 + 0.14);
      deck.castShadow = true;
      carBody.add(deck);

      // Louvered Heat Vent Grilles
      for (let i = 0; i < 5; i++) {
        const louverGeom = new THREE.BoxGeometry(width * 0.48, 0.02, 0.06);
        const louver = new THREE.Mesh(louverGeom, this.carbonMat);
        louver.position.set(0, noseHeight * 0.95, -halfLen + 0.35 + (i * 0.14));
        louver.rotation.x = -0.35;
        carBody.add(louver);
      }

      // I. Rear Venturi Diffuser with Vertical Strakes
      const diffGeom = new THREE.BoxGeometry(width * 0.94, 0.16, 0.85);
      const diffuser = new THREE.Mesh(diffGeom, this.carbonMat);
      diffuser.position.set(0, 0.08, -halfLen + 0.35);
      diffuser.rotation.x = -0.15;
      carBody.add(diffuser);

      // 4 Vertical Diffuser Strakes
      [-0.65, -0.22, 0.22, 0.65].forEach(xOffset => {
        const strakeGeom = new THREE.BoxGeometry(0.04, 0.22, 0.70);
        const strake = new THREE.Mesh(strakeGeom, this.carbonMat);
        strake.position.set(xOffset, 0.08, -halfLen + 0.35);
        strake.rotation.x = -0.15;
        carBody.add(strake);
      });

      // J. Active Multi-Element Rear Aero Wing with Twin Hydraulic Actuators
      const wingGroup = new THREE.Group();
      wingGroup.position.set(0, noseHeight + 0.42, -halfLen + 0.32);

      // Dual Carbon Main Wing Plane
      const mainWingGeom = new THREE.BoxGeometry(width * 0.96, 0.04, 0.38);
      const mainWing = new THREE.Mesh(mainWingGeom, this.carbonMat);
      mainWing.castShadow = true;
      wingGroup.add(mainWing);

      // Endplate Stabilizing Fins
      [-1, 1].forEach(side => {
        const endplateGeom = new THREE.BoxGeometry(0.03, 0.22, 0.44);
        const endplate = new THREE.Mesh(endplateGeom, this.armorMat);
        endplate.position.set(side * (width * 0.48), 0.02, 0);
        wingGroup.add(endplate);
      });

      // Twin Hydraulic Struts
      [-0.42, 0.42].forEach(x => {
        const strutGeom = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 12);
        const strut = new THREE.Mesh(strutGeom, this.chromeMat);
        strut.position.set(x, -0.18, 0);
        wingGroup.add(strut);
      });

      carBody.add(wingGroup);
      this.activeWing = wingGroup;
    };

    /**
     * Highly Detailed Futuristic Technical Cockpit (LOD 0 & 1)
     */
    window.CarModel.prototype.buildBujjiCockpit = function(carBody, length, width, height, halfLen, noseHeight) {
      const cockpitGroup = new THREE.Group();
      cockpitGroup.position.set(0, noseHeight * 0.50, 0.15);

      // 1. Carbon Monocoque Cockpit Tub & Floor
      const tubGeom = new THREE.BoxGeometry(width * 0.68, 0.08, length * 0.32);
      const tub = new THREE.Mesh(tubGeom, this.carbonMat);
      tub.position.set(0, 0, 0);
      cockpitGroup.add(tub);

      // 2. Twin Armored Performance Bucket Seats
      [-0.35, 0.35].forEach(x => {
        const seatGroup = new THREE.Group();
        seatGroup.position.set(x, 0.06, -0.22);

        // Seat Base Cushion
        const baseGeom = new THREE.BoxGeometry(0.44, 0.12, 0.48);
        const base = new THREE.Mesh(baseGeom, this.heroDarkMat);
        seatGroup.add(base);

        // Seat Backrest (Alcantara)
        const backGeom = new THREE.BoxGeometry(0.42, 0.62, 0.12);
        const back = new THREE.Mesh(backGeom, this.heroDarkMat);
        back.position.set(0, 0.32, -0.22);
        back.rotation.x = -0.18;
        seatGroup.add(back);

        // Headrest with Carbon Shell
        const headGeom = new THREE.BoxGeometry(0.24, 0.20, 0.10);
        const head = new THREE.Mesh(headGeom, this.carbonMat);
        head.position.set(0, 0.68, -0.28);
        seatGroup.add(head);

        // 6-Point Orange Safety Harness Webbing
        [-0.08, 0.08].forEach(hx => {
          const harnessGeom = new THREE.BoxGeometry(0.045, 0.55, 0.02);
          const harness = new THREE.Mesh(harnessGeom, this.orangeAccentMat);
          harness.position.set(hx, 0.32, -0.15);
          harness.rotation.x = -0.18;
          seatGroup.add(harness);
        });

        cockpitGroup.add(seatGroup);
      });

      // 3. Central Carbon Structural Bridge with Tactical Controls
      const bridgeGeom = new THREE.BoxGeometry(0.18, 0.28, length * 0.30);
      const bridge = new THREE.Mesh(bridgeGeom, this.carbonMat);
      bridge.position.set(0, 0.18, -0.05);
      bridge.rotation.x = -0.15;
      cockpitGroup.add(bridge);

      // Engine Start/Stop Missile-Style Covered Switch
      const startSwitchGeom = new THREE.BoxGeometry(0.06, 0.04, 0.06);
      const startSwitch = new THREE.Mesh(startSwitchGeom, this.orangeAccentMat);
      startSwitch.position.set(0, 0.34, 0.05);
      cockpitGroup.add(startSwitch);

      // 4. Sculpted Dash & Panoramic Dual-Display OLED Telemetry Canvas
      const dashGeom = new THREE.BoxGeometry(width * 0.66, 0.22, 0.35);
      const dash = new THREE.Mesh(dashGeom, this.heroDarkMat);
      dash.position.set(0, 0.42, 0.34);
      cockpitGroup.add(dash);

      // Live OLED Display Screen
      if (window.BujjiTextures && window.BujjiTextures.createDashboardDisplayCanvas) {
        this.dashboardCanvas = window.BujjiTextures.createDashboardDisplayCanvas();
        window.BujjiTextures.updateDashboardCanvas(this.dashboardCanvas, 0, 1200, 1, 100, 100);

        const screenTex = new THREE.CanvasTexture(this.dashboardCanvas);
        this.dashboardTex = screenTex;

        const screenGeom = new THREE.PlaneGeometry(0.72, 0.18);
        const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, transparent: true });
        const screenMesh = new THREE.Mesh(screenGeom, screenMat);
        screenMesh.position.set(0, 0.48, 0.46);
        screenMesh.rotation.x = -0.28;
        cockpitGroup.add(screenMesh);
      }

      // 5. Aeronautics Yoke Steering Wheel with Rev LEDs & Buttons
      const steerYokeGroup = new THREE.Group();
      steerYokeGroup.position.set(-0.35, 0.44, 0.24);

      // Steering Column
      const colGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.22, 12);
      colGeom.rotateX(Math.PI * 0.5);
      const col = new THREE.Mesh(colGeom, this.chromeMat);
      col.position.set(0, 0, 0);
      steerYokeGroup.add(col);

      // Yoke Rectangular Grip Frame
      const yokeGeom = new THREE.TorusGeometry(0.14, 0.022, 8, 20, Math.PI * 1.6);
      yokeGeom.rotateZ(Math.PI * 0.2);
      const yoke = new THREE.Mesh(yokeGeom, this.heroDarkMat);
      yoke.position.set(0, 0, 0.10);
      steerYokeGroup.add(yoke);

      // Central Hub with Bujji Crest
      const hubGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16);
      hubGeom.rotateX(Math.PI * 0.5);
      const hub = new THREE.Mesh(hubGeom, this.carbonMat);
      hub.position.set(0, 0, 0.10);
      steerYokeGroup.add(hub);

      // Sequential LED Shift Lightbar across top of yoke
      for (let s = 0; s < 7; s++) {
        const ledGeom = new THREE.BoxGeometry(0.022, 0.012, 0.01);
        const ledMat = new THREE.MeshBasicMaterial({
          color: s < 4 ? 0x00ff88 : (s < 6 ? 0xffbb00 : 0xff0044),
          transparent: true,
          opacity: 0.25
        });
        const led = new THREE.Mesh(ledGeom, ledMat);
        led.position.set(-0.075 + (s * 0.025), 0.11, 0.10);
        steerYokeGroup.add(led);
        this.shiftLights.push(led);
      }

      cockpitGroup.add(steerYokeGroup);
      this.steeringWheel = steerYokeGroup;

      carBody.add(cockpitGroup);
    };

    /**
     * Functional Lighting: Quad LED Headlights, Segmented OLED Taillight, Orange DRLs
     */
    window.CarModel.prototype.buildBujjiLighting = function(carBody, halfLen, width, noseHeight) {
      // 1. Quad Horizontal LED Headlights (Warm White, High Lumen)
      [-1, 1].forEach(side => {
        for (let i = 0; i < 2; i++) {
          const hlGeom = new THREE.BoxGeometry(0.18, 0.045, 0.06);
          const hl = new THREE.Mesh(hlGeom, this.headlightMat);
          hl.position.set(side * (width * 0.35 + i * 0.09), noseHeight * 0.62, halfLen - 0.28);
          hl.rotation.y = side * 0.12;
          carBody.add(hl);
          this.headlights.push(hl);
        }

        // Orange Signature Daytime Running Light Blade (DRL)
        const drlGeom = new THREE.BoxGeometry(0.32, 0.02, 0.04);
        const drl = new THREE.Mesh(drlGeom, this.orangeAccentMat);
        drl.position.set(side * (width * 0.38), noseHeight * 0.54, halfLen - 0.26);
        drl.rotation.y = side * 0.15;
        carBody.add(drl);
      });

      // 2. Full-Width Segmented Red-Orange OLED Taillight Bar
      const segmentCount = 9;
      const segWidth = (width * 0.88) / segmentCount;
      for (let s = 0; s < segmentCount; s++) {
        const segGeom = new THREE.BoxGeometry(segWidth * 0.88, 0.045, 0.05);
        const seg = new THREE.Mesh(segGeom, this.brakeLightMat);
        const xPos = -(width * 0.44) + (s * segWidth) + (segWidth * 0.5);
        seg.position.set(xPos, noseHeight * 0.76, -halfLen + 0.18);
        carBody.add(seg);
        this.brakeLights.push(seg);
      }

      // 3. Central Orange Hybrid Battery Status Beacon
      const beaconGeom = new THREE.BoxGeometry(0.14, 0.04, 0.05);
      const beacon = new THREE.Mesh(beaconGeom, this.orangeAccentMat);
      beacon.position.set(0, noseHeight * 0.84, -halfLen + 0.18);
      carBody.add(beacon);

      // 4. White Reverse LED Lamps
      [-0.32, 0.32].forEach(x => {
        const revGeom = new THREE.BoxGeometry(0.12, 0.035, 0.04);
        const rev = new THREE.Mesh(revGeom, this.reverseLightMat);
        rev.position.set(x, noseHeight * 0.66, -halfLen + 0.19);
        carBody.add(rev);
        this.reverseLights.push(rev);
      });
    };

    /**
     * High-Mounted Dual Hexagonal Titanium Exhausts & Nitro Thrusters
     */
    window.CarModel.prototype.buildBujjiExhaustsAndNitro = function(carBody, halfLen) {
      [-0.18, 0.18].forEach(x => {
        // Hexagonal Exhaust Housing
        const exhGeom = new THREE.CylinderGeometry(0.085, 0.09, 0.22, 6);
        exhGeom.rotateX(Math.PI * 0.5);
        const exh = new THREE.Mesh(exhGeom, this.chromeMat);
        exh.position.set(x, 0.44, -halfLen + 0.16);
        carBody.add(exh);

        // Inner Titanium Blue-Purple Core
        const innerGeom = new THREE.CylinderGeometry(0.065, 0.07, 0.24, 6);
        innerGeom.rotateX(Math.PI * 0.5);
        const inner = new THREE.Mesh(innerGeom, this.heroDarkMat);
        inner.position.set(x, 0.44, -halfLen + 0.17);
        carBody.add(inner);

        // Animated Nitro Cone
        const flameGeom = new THREE.ConeGeometry(0.08, 0.55, 12);
        flameGeom.rotateX(-Math.PI * 0.5);
        const flame = new THREE.Mesh(flameGeom, this.flameMat);
        flame.position.set(x, 0.44, -halfLen + 0.45);
        carBody.add(flame);
        this.exhaustFlames.push(flame);
      });
    };

    /**
     * 21" Front & 22" Rear Turbine-Blade Aerodynamic Alloy Wheels & Rotors
     */
    window.CarModel.prototype.createBujjiWheel = function(x, y, z, radius, width, isLeft, isFront) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);

      const wheelMesh = new THREE.Group();
      const rimR = radius * 0.72;
      const thickness = width;

      // 1. High-Performance Treaded Rubber Tire
      const tireGeom = new THREE.CylinderGeometry(radius, radius, thickness, 24);
      tireGeom.rotateZ(Math.PI * 0.5);
      const tire = new THREE.Mesh(tireGeom, this.tireMat);
      tire.castShadow = true;
      wheelMesh.add(tire);

      // 2. Dark Graphite Rim Barrel
      const rimGeom = new THREE.CylinderGeometry(rimR, rimR, thickness * 0.94, 20);
      rimGeom.rotateZ(Math.PI * 0.5);
      const rim = new THREE.Mesh(rimGeom, this.rimMat);
      wheelMesh.add(rim);

      // 3. Directional Aero Turbine Blades (8 Twisted Fan Blades)
      const bladeCount = 8;
      for (let b = 0; b < bladeCount; b++) {
        const angle = (b / bladeCount) * Math.PI * 2;
        const bladeGeom = new THREE.BoxGeometry(thickness * 0.92, 0.032, rimR * 0.88);
        const blade = new THREE.Mesh(bladeGeom, this.rimMat);
        blade.rotation.x = angle;
        blade.rotation.y = (isLeft ? 0.25 : -0.25); // Directional pitch
        wheelMesh.add(blade);
      }

      // 4. Center Lock Wheel Nut in Hero Anodized Orange
      const nutGeom = new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.24, thickness * 0.98, 6);
      nutGeom.rotateZ(Math.PI * 0.5);
      const nut = new THREE.Mesh(nutGeom, this.orangeAccentMat);
      wheelMesh.add(nut);

      // 5. Cross-Drilled Carbon-Ceramic Brake Rotor (Rotates with wheel)
      if (this.lod <= 1) {
        const rotorGeom = new THREE.CylinderGeometry(rimR * 0.88, rimR * 0.88, 0.024, 20);
        rotorGeom.rotateZ(Math.PI * 0.5);
        const rotor = new THREE.Mesh(rotorGeom, this.rotorMat);
        rotor.position.set(isLeft ? thickness * 0.18 : -thickness * 0.18, 0, 0);
        wheelMesh.add(rotor);
      }

      pivot.add(wheelMesh);

      // 6. Stationary Anodized Orange Caliper (Mounted to Pivot, DOES NOT ROTATE)
      if (this.lod <= 1) {
        const caliperH = isFront ? rimR * 0.54 : rimR * 0.44; // 6-Piston front, 4-Piston rear
        const caliperGeom = new THREE.BoxGeometry(0.085, caliperH, 0.18);
        const caliper = new THREE.Mesh(caliperGeom, this.caliperMat);
        caliper.position.set(isLeft ? thickness * 0.20 : -thickness * 0.20, rimR * 0.44, 0);
        pivot.add(caliper);

        // Upper & Lower Suspension Wishbone Arms
        const wishboneGeom = new THREE.BoxGeometry(0.08, 0.04, 0.22);
        const wishbone = new THREE.Mesh(wishboneGeom, this.carbonMat);
        wishbone.position.set(isLeft ? 0.15 : -0.15, rimR * 0.25, 0);
        pivot.add(wishbone);
      }

      return { pivot, mesh: wheelMesh, radius, isFront };
    };

    console.log('🏎️ Bujji 3D Hero Car Model Generator initialized successfully!');
  }

  initBujjiModel();
})();
