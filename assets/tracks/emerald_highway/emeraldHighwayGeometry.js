/**
 * Turbo Rush - Emerald Highway Run Geometry System
 * 
 * Implements high-end procedural civil engineering highway elements:
 * - 4-lane highway with Left-Hand Traffic layout (2 Outbound, 2 Return)
 * - 8-12m Landscaped Grass Median with Controlled Crossover Openings
 * - 0.95m Continuous Concrete Jersey Barriers with Amber Reflectors
 * - Signature Rock-Cut Forest Tunnel with Concrete Portals & Sodium Lighting
 * - 270° Cloverleaf Turnaround Interchange Overpass Bridge
 * - 2 Route-Choice Zones housing Exactly Three Speed-Boost Pads
 * - Road-Arrow Navigational Signs (Asphalt Chevrons, Overhead Gantries, Warning Boards)
 */

(function() {
  class EmeraldHighwayGeometry {
    constructor(scene, trackManager) {
      this.scene = scene;
      this.track = trackManager;
      this.objects = [];

      this.init();
    }

    init() {
      if (!this.track || !this.track.splineSamples || this.track.splineSamples.length === 0) return;

      this.buildHighwayMarkings();
      this.buildCentralMedian();
      this.buildConcreteBarriers();
      this.buildRockCutTunnel();
      this.buildCloverleafOverpass();
      this.buildShortcutBranches();
      this.buildRoadSignage();
    }

    // ─────────────────────────────────────────────
    // 1. HIGHWAY MARKINGS & ROAD STUDS (CATS' EYES)
    // ─────────────────────────────────────────────
    buildHighwayMarkings() {
      const samples = this.track.splineSamples;
      const step = 2; // Sample resolution

      // Canvas texture for asphalt with lane striping
      const markMatWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: true });
      const markMatYellow = new THREE.MeshBasicMaterial({ color: 0xffcc00, depthWrite: true });
      const studMatAmber = new THREE.MeshStandardMaterial({
        color: 0xffa500,
        emissive: 0xff8800,
        emissiveIntensity: 1.5,
        roughness: 0.3
      });

      const dashGeom = new THREE.BufferGeometry();
      const dashVertices = [];
      const dashIndices = [];

      const yellowGeom = new THREE.BufferGeometry();
      const yellowVertices = [];
      const yellowIndices = [];

      // Dashed lane divider width
      const dashW = 0.20;
      // White dashed lane divider (Left-hand traffic standard: separating Lane 1 & Lane 2)
      // On 11.2m carriageway: Left lane center -2.4m, Right lane center +2.4m, divider at 0m
      for (let i = 0; i < samples.length - 1; i += step) {
        const s = samples[i];
        const sNext = samples[Math.min(samples.length - 1, i + step)];
        if (s.isGap || sNext.isGap) continue;

        // Dashed lines: 3m dash, 6m gap
        const isDash = Math.floor(i / 3) % 2 === 0;

        if (isDash) {
          // Lane divider at carriageway center
          const p0 = s.point.clone().addScaledVector(s.normal, 0.05);
          const p1 = sNext.point.clone().addScaledVector(sNext.normal, 0.05);

          const l0 = p0.clone().addScaledVector(s.binormal, -dashW * 0.5);
          const r0 = p0.clone().addScaledVector(s.binormal, dashW * 0.5);
          const l1 = p1.clone().addScaledVector(sNext.binormal, -dashW * 0.5);
          const r1 = p1.clone().addScaledVector(sNext.binormal, dashW * 0.5);

          const base = dashVertices.length / 3;
          dashVertices.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z, r1.x, r1.y, r1.z);
          dashIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }

        // Inner solid yellow edge lines (adjacent to central median at -halfWidth + 0.4m)
        const halfW = s.width * 0.5;
        const y0Left = s.point.clone().addScaledVector(s.binormal, -halfW + 0.45).addScaledVector(s.normal, 0.05);
        const y1Left = sNext.point.clone().addScaledVector(sNext.binormal, -sNext.width * 0.5 + 0.45).addScaledVector(sNext.normal, 0.05);
        const yBase = yellowVertices.length / 3;

        const yl0 = y0Left.clone().addScaledVector(s.binormal, -0.1);
        const yr0 = y0Left.clone().addScaledVector(s.binormal, 0.1);
        const yl1 = y1Left.clone().addScaledVector(sNext.binormal, -0.1);
        const yr1 = y1Left.clone().addScaledVector(sNext.binormal, 0.1);

        yellowVertices.push(yl0.x, yl0.y, yl0.z, yr0.x, yr0.y, yr0.z, yl1.x, yl1.y, yl1.z, yr1.x, yr1.y, yr1.z);
        yellowIndices.push(yBase, yBase + 1, yBase + 2, yBase + 1, yBase + 3, yBase + 2);

        // Reflective Cats' Eye Road Studs every 12 samples
        if (i % 8 === 0) {
          const studGeom = new THREE.BoxGeometry(0.18, 0.08, 0.28);
          const stud = new THREE.Mesh(studGeom, studMatAmber);
          stud.position.copy(s.point).addScaledVector(s.normal, 0.06);
          const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
          stud.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(stud);
          this.objects.push(stud);
        }
      }

      if (dashVertices.length > 0) {
        dashGeom.setAttribute('position', new THREE.Float32BufferAttribute(dashVertices, 3));
        dashGeom.setIndex(dashIndices);
        dashGeom.computeVertexNormals();
        const dashMesh = new THREE.Mesh(dashGeom, markMatWhite);
        this.scene.add(dashMesh);
        this.objects.push(dashMesh);
      }

      if (yellowVertices.length > 0) {
        yellowGeom.setAttribute('position', new THREE.Float32BufferAttribute(yellowVertices, 3));
        yellowGeom.setIndex(yellowIndices);
        yellowGeom.computeVertexNormals();
        const yellowMesh = new THREE.Mesh(yellowGeom, markMatYellow);
        this.scene.add(yellowMesh);
        this.objects.push(yellowMesh);
      }
    }

    // ─────────────────────────────────────────────
    // 2. 8-12m LANDSCAPED CENTRAL GRASS MEDIAN
    // ─────────────────────────────────────────────
    buildCentralMedian() {
      const samples = this.track.splineSamples;
      const medianGeom = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      const medianMat = new THREE.MeshStandardMaterial({
        color: 0x245228,     // Rich manicured turf green
        roughness: 0.92,
        metalness: 0.05
      });

      const curbMat = new THREE.MeshStandardMaterial({
        color: 0x6e7682,     // Granite bevel curb
        roughness: 0.85
      });

      // Crossover break zones where median has openings:
      // u around 0.00-0.03 (Start Gantry crossover), u=0.25-0.27 (Service approach), u=0.83-0.85 (Opposing lane shortcut)
      const crossoverZones = [
        { uMin: 0.00, uMax: 0.025 },
        { uMin: 0.255, uMax: 0.270 },
        { uMin: 0.830, uMax: 0.850 }
      ];

      const isCrossover = (u) => crossoverZones.some(z => u >= z.uMin && u <= z.uMax);

      const medianWidth = 10.0; // 10m median width
      const medianDepth = -0.35; // Gentle drainage depression

      for (let i = 0; i < samples.length - 1; i += 2) {
        const s = samples[i];
        const sNext = samples[Math.min(samples.length - 1, i + 2)];
        if (s.isGap || sNext.isGap) continue;

        if (isCrossover(s.u) || isCrossover(sNext.u)) {
          // Leave open for emergency & racing crossover maneuver
          continue;
        }

        // Median sits to the inner side (-binormal)
        const halfW = s.width * 0.5;
        const innerEdge0 = s.point.clone().addScaledVector(s.binormal, -halfW);
        const innerEdge1 = sNext.point.clone().addScaledVector(sNext.binormal, -sNext.width * 0.5);

        const swale0 = innerEdge0.clone().addScaledVector(s.binormal, -medianWidth * 0.5).addScaledVector(s.normal, medianDepth);
        const swale1 = innerEdge1.clone().addScaledVector(sNext.binormal, -medianWidth * 0.5).addScaledVector(sNext.normal, medianDepth);

        const farEdge0 = innerEdge0.clone().addScaledVector(s.binormal, -medianWidth);
        const farEdge1 = innerEdge1.clone().addScaledVector(sNext.binormal, -medianWidth);

        const base = vertices.length / 3;
        vertices.push(
          innerEdge0.x, innerEdge0.y, innerEdge0.z,
          swale0.x, swale0.y, swale0.z,
          farEdge0.x, farEdge0.y, farEdge0.z,
          innerEdge1.x, innerEdge1.y, innerEdge1.z,
          swale1.x, swale1.y, swale1.z,
          farEdge1.x, farEdge1.y, farEdge1.z
        );

        indices.push(
          base, base + 1, base + 3,
          base + 1, base + 4, base + 3,
          base + 1, base + 2, base + 4,
          base + 2, base + 5, base + 4
        );
      }

      if (vertices.length > 0) {
        medianGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        medianGeom.setIndex(indices);
        medianGeom.computeVertexNormals();
        const medianMesh = new THREE.Mesh(medianGeom, medianMat);
        medianMesh.receiveShadow = true;
        this.scene.add(medianMesh);
        this.objects.push(medianMesh);
      }
    }

    // ─────────────────────────────────────────────
    // 3. CONTINUOUS 0.95m CONCRETE JERSEY BARRIERS
    // ─────────────────────────────────────────────
    buildConcreteBarriers() {
      const samples = this.track.splineSamples;
      const barrierGeom = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      const barrierMat = new THREE.MeshStandardMaterial({
        color: 0x8a8e94,     // Weathered reinforced civil concrete
        roughness: 0.88,
        metalness: 0.12
      });

      const reflectorMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff7700,
        emissiveIntensity: 1.8,
        roughness: 0.2
      });

      const barrierH = 0.95; // 0.95m standard concrete Jersey barrier height
      const barrierT = 0.40; // 0.40m base thickness

      // Build continuous barriers along outer perimeter (+binormal side)
      for (let i = 0; i < samples.length - 1; i += 2) {
        const s = samples[i];
        const sNext = samples[Math.min(samples.length - 1, i + 2)];
        if (s.isGap || sNext.isGap) continue;

        // Outer shoulder placement
        const halfW0 = s.width * 0.5 + 0.2;
        const halfW1 = sNext.width * 0.5 + 0.2;

        const btm0 = s.point.clone().addScaledVector(s.binormal, halfW0);
        const top0 = btm0.clone().addScaledVector(s.normal, barrierH);
        const btm1 = sNext.point.clone().addScaledVector(sNext.binormal, halfW1);
        const top1 = btm1.clone().addScaledVector(sNext.normal, barrierH);

        const base = vertices.length / 3;
        vertices.push(
          btm0.x, btm0.y, btm0.z,
          top0.x, top0.y, top0.z,
          btm1.x, btm1.y, btm1.z,
          top1.x, top1.y, top1.z
        );

        indices.push(
          base, base + 1, base + 2,
          base + 1, base + 3, base + 2,
          // Backface
          base, base + 2, base + 1,
          base + 1, base + 2, base + 3
        );

        // Amber reflective studs every 10 samples on barrier top
        if (i % 10 === 0) {
          const refBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.25), reflectorMat);
          refBox.position.copy(top0).addScaledVector(s.normal, 0.09);
          const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
          refBox.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(refBox);
          this.objects.push(refBox);
        }
      }

      if (vertices.length > 0) {
        barrierGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        barrierGeom.setIndex(indices);
        barrierGeom.computeVertexNormals();
        const barrierMesh = new THREE.Mesh(barrierGeom, barrierMat);
        barrierMesh.castShadow = true;
        barrierMesh.receiveShadow = true;
        this.scene.add(barrierMesh);
        this.objects.push(barrierMesh);
      }
    }

    // ─────────────────────────────────────────────
    // 4. SIGNATURE BLACKWOOD ROCK-CUT FOREST TUNNEL
    // ─────────────────────────────────────────────
    buildRockCutTunnel() {
      // Tunnel spans Sector 4 from u = 0.36 to u = 0.43 (~340 meters)
      const uStart = 0.36;
      const uEnd = 0.43;

      const samples = this.track.splineSamples.filter(s => s.u >= uStart && s.u <= uEnd);
      if (samples.length < 4) return;

      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x222428,     // Dark blasting granite
        roughness: 0.95,
        metalness: 0.10
      });

      const portalMat = new THREE.MeshStandardMaterial({
        color: 0x4a4e54,     // Reinforced civil concrete portal
        roughness: 0.80,
        metalness: 0.20
      });

      const sodiumMat = new THREE.MeshStandardMaterial({
        color: 0xffbb44,
        emissive: 0xff9900,
        emissiveIntensity: 2.8,
        roughness: 0.2
      });

      // Tunnel Enclosure Mesh
      const tunnelGeom = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      const tunnelRadius = 7.5;
      const arcSegments = 8;

      for (let i = 0; i < samples.length - 1; i++) {
        const s0 = samples[i];
        const s1 = samples[i + 1];

        const base0 = vertices.length / 3;
        for (let a = 0; a <= arcSegments; a++) {
          const theta = Math.PI * (a / arcSegments); // 0 (left) to PI (right)
          const localX = -Math.cos(theta) * tunnelRadius;
          const localY = Math.sin(theta) * tunnelRadius;

          const pt0 = s0.point.clone().addScaledVector(s0.binormal, localX).addScaledVector(s0.normal, localY);
          vertices.push(pt0.x, pt0.y, pt0.z);
        }

        const base1 = vertices.length / 3;
        for (let a = 0; a <= arcSegments; a++) {
          const theta = Math.PI * (a / arcSegments);
          const localX = -Math.cos(theta) * tunnelRadius;
          const localY = Math.sin(theta) * tunnelRadius;

          const pt1 = s1.point.clone().addScaledVector(s1.binormal, localX).addScaledVector(s1.normal, localY);
          vertices.push(pt1.x, pt1.y, pt1.z);
        }

        for (let a = 0; a < arcSegments; a++) {
          const i0 = base0 + a;
          const i1 = base0 + a + 1;
          const j0 = base1 + a;
          const j1 = base1 + a + 1;

          // Inward facing faces
          indices.push(i0, j0, i1);
          indices.push(i1, j0, j1);
        }

        // Recessed overhead sodium lighting fixtures every 3 segments
        if (i % 3 === 0) {
          const ceilingPt = s0.point.clone().addScaledVector(s0.normal, tunnelRadius - 0.2);
          const lampGeom = new THREE.BoxGeometry(0.8, 0.25, 2.5);
          const lamp = new THREE.Mesh(lampGeom, sodiumMat);
          lamp.position.copy(ceilingPt);
          const rotMat = new THREE.Matrix4().makeBasis(s0.binormal, s0.normal, s0.tangent);
          lamp.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(lamp);
          this.objects.push(lamp);

          // Warm ambient sodium point light
          const pLight = new THREE.PointLight(0xff9922, 1.4, 28);
          pLight.position.copy(ceilingPt).addScaledVector(s0.normal, -0.6);
          this.scene.add(pLight);
          this.objects.push(pLight);
        }
      }

      if (vertices.length > 0) {
        tunnelGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        tunnelGeom.setIndex(indices);
        tunnelGeom.computeVertexNormals();
        const tunnelMesh = new THREE.Mesh(tunnelGeom, rockMat);
        this.scene.add(tunnelMesh);
        this.objects.push(tunnelMesh);
      }

      // Concrete Portals at Entrance and Exit
      [samples[0], samples[samples.length - 1]].forEach((s, idx) => {
        const portal = new THREE.Group();
        const archW = tunnelRadius * 2 + 3.0;
        const archH = tunnelRadius + 2.5;

        // Left & Right Portal Pylons
        const pylonGeom = new THREE.BoxGeometry(2.2, archH, 3.5);
        const leftPylon = new THREE.Mesh(pylonGeom, portalMat);
        leftPylon.position.set(-tunnelRadius - 1.1, archH * 0.5, 0);
        portal.add(leftPylon);

        const rightPylon = new THREE.Mesh(pylonGeom, portalMat);
        rightPylon.position.set(tunnelRadius + 1.1, archH * 0.5, 0);
        portal.add(rightPylon);

        // Header Arch
        const headerGeom = new THREE.BoxGeometry(archW, 2.2, 3.8);
        const header = new THREE.Mesh(headerGeom, portalMat);
        header.position.set(0, archH, 0);
        portal.add(header);

        // Signboard
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 512;
        signCanvas.height = 128;
        const ctx = signCanvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 504, 120);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(idx === 0 ? 'BLACKWOOD PASS — WEST PORTAL' : 'BLACKWOOD PASS — EAST PORTAL', 256, 75);

        const signTex = new THREE.CanvasTexture(signCanvas);
        const signMat = new THREE.MeshBasicMaterial({ map: signTex });
        const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 1.8), signMat);
        signMesh.position.set(0, archH, 2.0);
        if (idx === 1) signMesh.rotation.y = Math.PI;
        portal.add(signMesh);

        portal.position.copy(s.point);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        portal.quaternion.setFromRotationMatrix(rotMat);

        this.scene.add(portal);
        this.objects.push(portal);
      });
    }

    // ─────────────────────────────────────────────
    // 5. 270° CLOVERLEAF INTERCHANGE OVERPASS BRIDGE
    // ─────────────────────────────────────────────
    buildCloverleafOverpass() {
      // Bridge overpass crosses at Sector 5 (u ~ 0.53 - 0.56)
      const sOver = this.track.getSampleAt(0.545);
      const sUnder = this.track.getSampleAt(0.515);
      if (!sOver || !sUnder) return;

      const bridgeMat = new THREE.MeshStandardMaterial({
        color: 0x3e444c,
        roughness: 0.85,
        metalness: 0.25
      });

      const pierMat = new THREE.MeshStandardMaterial({
        color: 0x5a606a,
        roughness: 0.90
      });

      const bridgeGroup = new THREE.Group();

      // Elevated Overpass Deck Box Girder
      const deckW = 14.0;
      const deckL = 36.0;
      const deckH = 1.8;
      const deckGeom = new THREE.BoxGeometry(deckW, deckH, deckL);
      const deck = new THREE.Mesh(deckGeom, bridgeMat);
      deck.position.set(0, -0.9, 0);
      bridgeGroup.add(deck);

      // Parapet Crash Barriers
      const parapetGeom = new THREE.BoxGeometry(0.5, 1.1, deckL);
      const leftParapet = new THREE.Mesh(parapetGeom, pierMat);
      leftParapet.position.set(-deckW * 0.5 + 0.25, 0.55, 0);
      bridgeGroup.add(leftParapet);

      const rightParapet = new THREE.Mesh(parapetGeom, pierMat);
      rightParapet.position.set(deckW * 0.5 - 0.25, 0.55, 0);
      bridgeGroup.add(rightParapet);

      // Supporting Cylindrical Piers beneath deck
      const pierGeom = new THREE.CylinderGeometry(0.9, 1.1, 14.0, 16);
      const p1 = new THREE.Mesh(pierGeom, pierMat);
      p1.position.set(-deckW * 0.35, -7.9, -deckL * 0.25);
      bridgeGroup.add(p1);

      const p2 = new THREE.Mesh(pierGeom, pierMat);
      p2.position.set(deckW * 0.35, -7.9, -deckL * 0.25);
      bridgeGroup.add(p2);

      const p3 = new THREE.Mesh(pierGeom, pierMat);
      p3.position.set(-deckW * 0.35, -7.9, deckL * 0.25);
      bridgeGroup.add(p3);

      const p4 = new THREE.Mesh(pierGeom, pierMat);
      p4.position.set(deckW * 0.35, -7.9, deckL * 0.25);
      bridgeGroup.add(p4);

      bridgeGroup.position.copy(sOver.point);
      const rotMat = new THREE.Matrix4().makeBasis(sOver.binormal, sOver.normal, sOver.tangent);
      bridgeGroup.quaternion.setFromRotationMatrix(rotMat);

      this.scene.add(bridgeGroup);
      this.objects.push(bridgeGroup);
    }

    // ─────────────────────────────────────────────
    // 6. STRATEGIC SHORTCUT BRANCHES & 3 SPEED BOOST PADS
    // ─────────────────────────────────────────────
    buildShortcutBranches() {
      // 1. Sector 3 Service-Road Shortcut (u = 0.275) - Houses Booster #1
      // 2. Sector 7 Ridge-Maintenance Bypass (u = 0.735) - Houses Booster #2
      // 3. Sector 7 Opposing-Lane Crossover (u = 0.845) - Houses Booster #3

      const shortcutMat = new THREE.MeshStandardMaterial({
        color: 0x161a20,     // Coarse gravel-asphalt service texture
        roughness: 0.95
      });

      const boostGlowMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00d8ff,
        emissiveIntensity: 2.6,
        roughness: 0.15
      });

      const chevronYellowMat = new THREE.MeshBasicMaterial({ color: 0xffbb00 });

      // Shortcut 1: Valley Agricultural Service Road at u=0.275
      const s1 = this.track.getSampleAt(0.275);
      if (s1) {
        const roadBox = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 38.0), shortcutMat);
        roadBox.position.copy(s1.point).addScaledVector(s1.binormal, 6.5);
        const rotMat = new THREE.Matrix4().makeBasis(s1.binormal, s1.normal, s1.tangent);
        roadBox.quaternion.setFromRotationMatrix(rotMat);
        this.scene.add(roadBox);
        this.objects.push(roadBox);

        // Booster 1 Neon Pad
        const pad = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 6.0), boostGlowMat);
        pad.position.copy(s1.point).addScaledVector(s1.binormal, 6.5).addScaledVector(s1.normal, 0.08);
        pad.quaternion.copy(roadBox.quaternion);
        this.scene.add(pad);
        this.objects.push(pad);
      }

      // Shortcut 2: Ridge Maintenance Bypass at u=0.735
      const s2 = this.track.getSampleAt(0.735);
      if (s2) {
        const roadBox = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 36.0), shortcutMat);
        roadBox.position.copy(s2.point).addScaledVector(s2.binormal, -7.0);
        const rotMat = new THREE.Matrix4().makeBasis(s2.binormal, s2.normal, s2.tangent);
        roadBox.quaternion.setFromRotationMatrix(rotMat);
        this.scene.add(roadBox);
        this.objects.push(roadBox);

        // Booster 2 Neon Pad
        const pad = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 6.0), boostGlowMat);
        pad.position.copy(s2.point).addScaledVector(s2.binormal, -7.0).addScaledVector(s2.normal, 0.08);
        pad.quaternion.copy(roadBox.quaternion);
        this.scene.add(pad);
        this.objects.push(pad);
      }

      // Shortcut 3: Controlled Opposing-Lane Crossover at u=0.845
      const s3 = this.track.getSampleAt(0.845);
      if (s3) {
        // Crossover diagonal lane stripe across the median
        const crossBox = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.06, 28.0), shortcutMat);
        crossBox.position.copy(s3.point).addScaledVector(s3.binormal, -5.5);
        const rotMat = new THREE.Matrix4().makeBasis(s3.binormal, s3.normal, s3.tangent);
        crossBox.quaternion.setFromRotationMatrix(rotMat);
        this.scene.add(crossBox);
        this.objects.push(crossBox);

        // Booster 3 Neon Pad
        const pad = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.08, 6.0), boostGlowMat);
        pad.position.copy(s3.point).addScaledVector(s3.binormal, -5.5).addScaledVector(s3.normal, 0.08);
        pad.quaternion.copy(crossBox.quaternion);
        this.scene.add(pad);
        this.objects.push(pad);
      }
    }

    // ─────────────────────────────────────────────
    // 7. ROAD-ARROW NAVIGATION & HIGHWAY GANTRIES
    // ─────────────────────────────────────────────
    buildRoadSignage() {
      // 1. Overhead Directional Highway Gantries (Green Background, White Lettering)
      const gantryPositions = [
        { u: 0.12, text: 'WILLOW CREEK VALLEY — 800 M' },
        { u: 0.32, text: 'BLACKWOOD ROCK TUNNEL — KEEP LEFT' },
        { u: 0.48, text: 'CLOVERLEAF INTERCHANGE — 500 M' },
        { u: 0.68, text: 'RETURN CARRIAGEWAY — HOME STRAIGHT' }
      ];

      const frameMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.85, roughness: 0.25 });

      gantryPositions.forEach(g => {
        const s = this.track.getSampleAt(g.u);
        if (!s) return;

        const gantry = new THREE.Group();
        const spanW = s.width + 4.0;
        const postH = 6.8;

        // Left & Right Uprights
        const postGeom = new THREE.CylinderGeometry(0.25, 0.32, postH, 12);
        const lp = new THREE.Mesh(postGeom, frameMat);
        lp.position.set(-spanW * 0.5, postH * 0.5, 0);
        gantry.add(lp);

        const rp = new THREE.Mesh(postGeom, frameMat);
        rp.position.set(spanW * 0.5, postH * 0.5, 0);
        gantry.add(rp);

        // Overhead Truss
        const trussGeom = new THREE.BoxGeometry(spanW + 0.6, 0.5, 0.6);
        const truss = new THREE.Mesh(trussGeom, frameMat);
        truss.position.set(0, postH, 0);
        gantry.add(truss);

        // Green Highway Directional Signboard
        const signCanvas = document.createElement('canvas');
        signCanvas.width = 512;
        signCanvas.height = 128;
        const sctx = signCanvas.getContext('2d');
        sctx.fillStyle = '#065f46'; // Standard highway green
        sctx.fillRect(0, 0, 512, 128);
        sctx.strokeStyle = '#ffffff';
        sctx.lineWidth = 6;
        sctx.strokeRect(6, 6, 500, 116);
        sctx.fillStyle = '#ffffff';
        sctx.font = 'bold 28px sans-serif';
        sctx.textAlign = 'center';
        sctx.fillText(g.text, 256, 72);

        const signTex = new THREE.CanvasTexture(signCanvas);
        const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(spanW * 0.85, 1.8), new THREE.MeshBasicMaterial({ map: signTex }));
        signMesh.position.set(0, postH - 1.0, 0.35);
        gantry.add(signMesh);

        gantry.position.copy(s.point);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        gantry.quaternion.setFromRotationMatrix(rotMat);

        this.scene.add(gantry);
        this.objects.push(gantry);
      });

      // 2. High-Visibility Chevron Warning Boards on Sharp Curves
      const curvePositions = [0.49, 0.51, 0.53, 0.55, 0.76, 0.88];
      const chevronCanvas = document.createElement('canvas');
      chevronCanvas.width = 256;
      chevronCanvas.height = 128;
      const cctx = chevronCanvas.getContext('2d');
      cctx.fillStyle = '#1e293b';
      cctx.fillRect(0, 0, 256, 128);
      // Yellow chevron arrows >>>
      cctx.fillStyle = '#facc15';
      for (let x = 30; x < 240; x += 70) {
        cctx.beginPath();
        cctx.moveTo(x, 20);
        cctx.lineTo(x + 35, 64);
        cctx.lineTo(x, 108);
        cctx.lineTo(x + 20, 108);
        cctx.lineTo(x + 55, 64);
        cctx.lineTo(x + 20, 20);
        cctx.closePath();
        cctx.fill();
      }
      const chevronTex = new THREE.CanvasTexture(chevronCanvas);
      const chevronMat = new THREE.MeshBasicMaterial({ map: chevronTex });

      curvePositions.forEach(u => {
        const s = this.track.getSampleAt(u);
        if (!s) return;

        const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), chevronMat);
        const halfW = s.width * 0.5 + 1.2;
        board.position.copy(s.point).addScaledVector(s.binormal, halfW).addScaledVector(s.normal, 1.6);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        board.quaternion.setFromRotationMatrix(rotMat);

        // Stanchion post
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8),
          new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        post.position.copy(board.position).addScaledVector(s.normal, -0.8);
        post.quaternion.copy(board.quaternion);

        this.scene.add(board);
        this.scene.add(post);
        this.objects.push(board);
        this.objects.push(post);
      });

      // 3. Painted Asphalt Road Chevrons for High-Speed Turn Guidance
      const arrowCanvas = document.createElement('canvas');
      arrowCanvas.width = 128;
      arrowCanvas.height = 256;
      const actx = arrowCanvas.getContext('2d');
      actx.fillStyle = 'rgba(0,0,0,0)';
      actx.clearRect(0, 0, 128, 256);
      actx.fillStyle = '#ffffff';
      // Forward arrow
      actx.beginPath();
      actx.moveTo(64, 20);
      actx.lineTo(110, 120);
      actx.lineTo(84, 120);
      actx.lineTo(84, 230);
      actx.lineTo(44, 230);
      actx.lineTo(44, 120);
      actx.lineTo(18, 120);
      actx.closePath();
      actx.fill();

      const arrowTex = new THREE.CanvasTexture(arrowCanvas);
      const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, opacity: 0.85 });

      for (let u = 0.05; u < 0.98; u += 0.06) {
        const s = this.track.getSampleAt(u);
        if (!s || s.isGap) continue;

        // Lane 1 arrow (Left lane: -2.4m)
        const arrow1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), arrowMat);
        arrow1.position.copy(s.point).addScaledVector(s.binormal, -2.4).addScaledVector(s.normal, 0.06);
        const rotMat1 = new THREE.Matrix4().makeBasis(s.binormal, s.tangent, s.normal);
        arrow1.quaternion.setFromRotationMatrix(rotMat1);
        this.scene.add(arrow1);
        this.objects.push(arrow1);

        // Lane 2 arrow (Right lane: +2.4m)
        const arrow2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), arrowMat);
        arrow2.position.copy(s.point).addScaledVector(s.binormal, 2.4).addScaledVector(s.normal, 0.06);
        arrow2.quaternion.setFromRotationMatrix(rotMat1);
        this.scene.add(arrow2);
        this.objects.push(arrow2);
      }
    }

    destroy() {
      this.objects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this.objects = [];
    }
  }

  window.EmeraldHighwayGeometry = EmeraldHighwayGeometry;
})();
