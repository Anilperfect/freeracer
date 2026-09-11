/**
 * 3D Procedural Circuit Generator for Turbo Rush.
 * Generates track geometry, environment, landmarks, and weather
 * based on the selected map configuration.
 */
class TrackManager {
  constructor(scene, mapConfig) {
    this.scene = scene;
    this.mapConfig = mapConfig || null;
    this.curve = null;
    this.roadWidth = mapConfig ? mapConfig.roadWidth : 14;
    this.checkpoints = [];
    this.trackLength = 0;
    this.sampleCount = 300;
    this.splineSamples = [];
    this.particles = [];
    this.environmentObjects = [];

    this.init();
  }

  init() {
    this.createSpline();
    this.sampleSpline();
    this.buildRoadMesh();
    this.buildFinishGantry();
    this.buildEnvironment();
    this.setupCheckpoints();

    if (this.mapConfig) {
      this.buildMapLandmarks();
      this.buildWeatherSystem();
    }

    if (this.mapConfig && this.mapConfig.id === 'emerald_highway') {
      if (window.EmeraldHighwayGeometry) {
        this.emeraldHighwayGeometry = new window.EmeraldHighwayGeometry(this.scene, this);
      }
      if (window.EmeraldHighwayTraffic) {
        this.emeraldHighwayTraffic = new window.EmeraldHighwayTraffic(this.scene, this);
      }
      if (window.EmeraldHighwayAudio) {
        this.emeraldHighwayAudio = new window.EmeraldHighwayAudio(this);
      }
    }
  }

  createSpline() {
    let rawPoints;

    if (this.mapConfig && this.mapConfig.splinePoints) {
      rawPoints = this.mapConfig.splinePoints.map(p =>
        new THREE.Vector3(p[0], p[1], p[2])
      );
    } else {
      // Fallback: 3D dynamic circuit
      rawPoints = [
        new THREE.Vector3(0, 5, 0),
        new THREE.Vector3(80, 15, 10),
        new THREE.Vector3(150, 35, 45),
        new THREE.Vector3(180, 45, 120),
        new THREE.Vector3(140, 20, 180),
        new THREE.Vector3(60, 5, 210),
        new THREE.Vector3(-40, 15, 190),
        new THREE.Vector3(-90, 30, 130),
        new THREE.Vector3(-140, 45, 60),
        new THREE.Vector3(-160, 25, -10),
        new THREE.Vector3(-120, 10, -70),
        new THREE.Vector3(-40, 5, -60),
        new THREE.Vector3(-10, 5, -25)
      ];
    }

    this.curve = new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal');
    this.trackLength = this.curve.getLength();
  }

  getBankAt(u) {
    if (!this.mapConfig || !this.mapConfig.bankProfile || this.mapConfig.bankProfile.length === 0) return 0;
    const profile = this.mapConfig.bankProfile;
    if (profile.length === 1) return profile[0].bank || 0;

    const nu = ((u % 1.0) + 1.0) % 1.0;

    if (nu <= profile[0].u) return profile[0].bank || 0;
    if (nu >= profile[profile.length - 1].u) return profile[profile.length - 1].bank || 0;

    for (let i = 0; i < profile.length - 1; i++) {
      const p0 = profile[i];
      const p1 = profile[i + 1];
      if (nu >= p0.u && nu <= p1.u) {
        const span = p1.u - p0.u;
        if (span < 1e-6) return p0.bank || 0;
        const alpha = Math.max(0, Math.min(1, (nu - p0.u) / span));
        const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
        const result = THREE.MathUtils.lerp(p0.bank, p1.bank, smoothAlpha);
        return isNaN(result) ? (p0.bank || 0) : result;
      }
    }
    return profile[0].bank || 0;
  }


  isJumpGap(u) {
    if (!this.mapConfig || !this.mapConfig.jumps) return false;
    const nu = ((u % 1) + 1) % 1;
    return this.mapConfig.jumps.some(j => nu >= j.uStart && nu <= j.uEnd);
  }

  isBoostPad(u) {
    if (!this.mapConfig || !this.mapConfig.boostPads) return false;
    const nu = ((u % 1) + 1) % 1;
    return this.mapConfig.boostPads.some(bp => Math.abs(nu - bp) < 0.010);
  }

  getTrackWidth(u) {
    const baseW = this.mapConfig ? this.mapConfig.roadWidth : 11.0;
    const cpFrac = (u * 16) % 1.0;
    const nearCp = cpFrac < 0.12 || cpFrac > 0.88;
    let nearLanding = false;
    if (this.mapConfig && this.mapConfig.jumps) {
      this.mapConfig.jumps.forEach(j => {
        const d = Math.abs(u - j.uEnd);
        if (d < 0.04) nearLanding = true;
      });
    }
    return (nearCp || nearLanding) ? baseW * 1.3 : baseW;
  }

  sampleSpline() {
    this.splineSamples = [];
    this.sampleCount = 400; // High resolution for smooth 3D anti-gravity curves

    const points = [];
    const tangents = [];
    for (let i = 0; i <= this.sampleCount; i++) {
      const u = i / this.sampleCount;
      points.push(this.curve.getPointAt(u));
      tangents.push(this.curve.getTangentAt(u).normalize());
    }

    // Double-reflection Rotation Minimizing Frames (RMF) for twist-free 3D orientation
    const t0 = tangents[0];
    let up0 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(t0.dot(up0)) > 0.85) {
      up0 = new THREE.Vector3(1, 0, 0);
    }
    let rmfBinormal = new THREE.Vector3().crossVectors(t0, up0).normalize();
    let rmfNormal = new THREE.Vector3().crossVectors(rmfBinormal, t0).normalize();

    const rmfNormals = [rmfNormal.clone()];
    const rmfBinormals = [rmfBinormal.clone()];

    for (let i = 0; i < this.sampleCount; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const tA = tangents[i];
      const tB = tangents[i + 1];
      const rA = rmfNormals[i];

      const v1 = new THREE.Vector3().subVectors(p1, p0);
      const c1 = v1.dot(v1);
      let rL = rA.clone();
      let tL = tA.clone();

      if (c1 > 1e-6) {
        rL.addScaledVector(v1, -(2 / c1) * v1.dot(rA));
        tL.addScaledVector(v1, -(2 / c1) * v1.dot(tA));
      }

      const v2 = new THREE.Vector3().subVectors(tB, tL);
      const c2 = v2.dot(v2);
      let rB = rL.clone();
      if (c2 > 1e-6) {
        rB.addScaledVector(v2, -(2 / c2) * v2.dot(rL));
      }
      rB.normalize();
      const bB = new THREE.Vector3().crossVectors(tB, rB).normalize();
      rB.crossVectors(bB, tB).normalize();

      rmfNormals.push(rB);
      rmfBinormals.push(bB);
    }

    // Apply banking profile onto RMF frames
    for (let i = 0; i <= this.sampleCount; i++) {
      const u = i / this.sampleCount;
      const point = points[i];
      const tangent = tangents[i];
      const bank = this.getBankAt(u);

      const surfaceNormal = rmfNormals[i].clone().applyAxisAngle(tangent, bank).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, surfaceNormal).normalize();
      surfaceNormal.crossVectors(binormal, tangent).normalize();

      const isGap = this.isJumpGap(u);
      const isBoost = this.isBoostPad(u);
      const width = this.getTrackWidth(u);

      this.splineSamples.push({
        index: i,
        u,
        point,
        tangent,
        normal: surfaceNormal, // Magnetic up away from surface
        binormal,              // Across track from left to right
        bank,
        width,
        isGap,
        isBoost
      });
    }
  }

  getSampleAt(u) {
    if (!this.splineSamples || this.splineSamples.length === 0) return null;
    const safeU = (typeof u === 'number' && !isNaN(u)) ? u : 0;
    const nu = ((safeU % 1) + 1) % 1;
    const exactIdx = nu * this.sampleCount;
    const idx0 = Math.max(0, Math.min(this.splineSamples.length - 1, Math.floor(exactIdx) % this.sampleCount));
    const idx1 = (idx0 + 1) % this.sampleCount;
    const t = exactIdx - Math.floor(exactIdx);

    const s0 = this.splineSamples[idx0] || this.splineSamples[0];
    const s1 = this.splineSamples[idx1] || s0;

    const point = new THREE.Vector3().lerpVectors(s0.point, s1.point, t);
    const tangent = new THREE.Vector3().lerpVectors(s0.tangent, s1.tangent, t).normalize();
    const normal = new THREE.Vector3().lerpVectors(s0.normal, s1.normal, t).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();
    const width = THREE.MathUtils.lerp(s0.width, s1.width, t);
    const isGap = s0.isGap || s1.isGap;
    const isBoost = s0.isBoost || s1.isBoost;

    return { u: nu, point, tangent, normal, binormal, width, isGap, isBoost };
  }

  buildRoadMesh() {
    const roadGeom = new THREE.BufferGeometry();
    const underGeom = new THREE.BufferGeometry();

    const roadVertices = [];
    const roadUvs = [];
    const roadIndices = [];

    const underVertices = [];
    const underUvs = [];
    const underIndices = [];

    const slabThickness = 0.8; // 3D magnetic track thickness

    for (let i = 0; i < this.splineSamples.length; i++) {
      const s = this.splineSamples[i];
      const halfW = s.width * 0.5;

      const left = s.point.clone().addScaledVector(s.binormal, -halfW);
      const right = s.point.clone().addScaledVector(s.binormal, halfW);

      const underLeft = left.clone().addScaledVector(s.normal, -slabThickness);
      const underRight = right.clone().addScaledVector(s.normal, -slabThickness);

      roadVertices.push(left.x, left.y, left.z);
      roadVertices.push(right.x, right.y, right.z);

      const v = s.u * 80;
      roadUvs.push(0, v);
      roadUvs.push(1, v);

      underVertices.push(underLeft.x, underLeft.y, underLeft.z);
      underVertices.push(underRight.x, underRight.y, underRight.z);
      underUvs.push(0, v);
      underUvs.push(1, v);

      if (i < this.splineSamples.length - 1) {
        const nextSample = this.splineSamples[i + 1];
        // Don't draw road triangles across jump gaps!
        if (!s.isGap && !nextSample.isGap) {
          const base = i * 2;
          roadIndices.push(base, base + 1, base + 2);
          roadIndices.push(base + 1, base + 3, base + 2);

          // Underbelly inverted faces
          underIndices.push(base + 2, base + 1, base);
          underIndices.push(base + 2, base + 3, base + 1);
        }
      }
    }

    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeom.setIndex(roadIndices);
    roadGeom.computeVertexNormals();

    underGeom.setAttribute('position', new THREE.Float32BufferAttribute(underVertices, 3));
    roadGeom.computeVertexNormals();

    underGeom.setAttribute('position', new THREE.Float32BufferAttribute(underVertices, 3));
    underGeom.setAttribute('uv', new THREE.Float32BufferAttribute(underUvs, 2));
    underGeom.setIndex(underIndices);
    underGeom.computeVertexNormals();

    const roadColor = this.mapConfig ? this.mapConfig.roadColor : 0x1a1e26;
    this.asphaltTex = this.createProceduralAsphaltTexture();
    const roadMat = new THREE.MeshStandardMaterial({
      color: roadColor,
      map: this.asphaltTex,
      roughness: 0.80,
      metalness: 0.18
    });
    this.roadMat = roadMat;

    const underMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f14,
      roughness: 0.85,
      metalness: 0.65
    });

    const roadMesh = new THREE.Mesh(roadGeom, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);
    this.environmentObjects.push(roadMesh);

    const underMesh = new THREE.Mesh(underGeom, underMat);
    underMesh.receiveShadow = true;
    this.scene.add(underMesh);
    this.environmentObjects.push(underMesh);

    this.buildCenterline();
    this.buildCurbsAndRails();
    this.buildBoostAndLaunchPads();
    this.buildBrakingDistanceBoards();
  }

  buildCenterline() {
    if (this.mapConfig && this.mapConfig.id === 'emerald_highway') return;
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const halfW = 0.22;

    for (let i = 0; i < this.splineSamples.length; i++) {
      if (Math.floor(i / 3) % 2 === 0) continue;
      const s = this.splineSamples[i];
      if (s.isGap) continue;

      const center = s.point.clone().addScaledVector(s.normal, 0.04);
      const left = center.clone().addScaledVector(s.binormal, -halfW);
      const right = center.clone().addScaledVector(s.binormal, halfW);

      vertices.push(left.x, left.y, left.z);
      vertices.push(right.x, right.y, right.z);

      const base = vertices.length / 3 - 2;
      if (i < this.splineSamples.length - 1 && (Math.floor((i + 1) / 3) % 2 !== 0) && !this.splineSamples[i + 1].isGap) {
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    if (vertices.length > 0) {
      geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      const lineColor = this.mapConfig ? this.mapConfig.centerlineColor : 0x00f0ff;
      const lineMat = new THREE.MeshBasicMaterial({ color: lineColor });
      const lineMesh = new THREE.Mesh(geom, lineMat);
      this.scene.add(lineMesh);
      this.environmentObjects.push(lineMesh);
    }
  }

  createProceduralAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base asphalt
    ctx.fillStyle = '#1c1f24';
    ctx.fillRect(0, 0, 512, 512);

    // Fine stone aggregate speckles
    for (let i = 0; i < 22000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = 42 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.65)`;
      ctx.fillRect(x, y, Math.random() > 0.8 ? 2 : 1, Math.random() > 0.8 ? 2 : 1);
    }

    // Longitudinal racing line tire wear marks
    ctx.fillStyle = 'rgba(12, 14, 18, 0.40)';
    ctx.fillRect(100, 0, 80, 512);
    ctx.fillRect(330, 0, 80, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 45);
    return tex;
  }

  buildCurbsAndRails() {
    if (this.mapConfig && this.mapConfig.id === 'emerald_highway') return;
    const railColor = this.mapConfig ? this.mapConfig.railColor : 0x00d8ff;
    // Galvanized steel Armco corrugated guardrail
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x8a929c,
      metalness: 0.88,
      roughness: 0.28
    });
    // Glowing neon top rail cap
    const neonCapMat = new THREE.MeshStandardMaterial({
      color: railColor,
      emissive: railColor,
      emissiveIntensity: 2.4,
      roughness: 0.2
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x151b24, metalness: 0.9, roughness: 0.2 });

    // Alternating Red & White Rumble Kerb Material
    const curbCanvas = document.createElement('canvas');
    curbCanvas.width = 128;
    curbCanvas.height = 128;
    const cctx = curbCanvas.getContext('2d');
    cctx.fillStyle = '#e61a2b';
    cctx.fillRect(0, 0, 128, 64);
    cctx.fillStyle = '#f0f4f8';
    cctx.fillRect(0, 64, 128, 64);
    const curbTex = new THREE.CanvasTexture(curbCanvas);
    curbTex.wrapS = THREE.RepeatWrapping;
    curbTex.wrapT = THREE.RepeatWrapping;
    curbTex.repeat.set(1, 40);

    const curbMat = new THREE.MeshStandardMaterial({
      map: curbTex,
      roughness: 0.72,
      metalness: 0.15
    });

    const railGeom = new THREE.BufferGeometry();
    const railVertices = [];
    const railIndices = [];
    const railH = 0.65;
    const railThickness = 0.36; // Production baseline >=0.30m for anti-tunneling at 300+ km/h
    const segmentOverlap = 0.10; // 0.10m overlap between neighboring segments to prevent seam gaps

    [-1, 1].forEach(side => {
      let prevInnerTop = -1;
      let prevInnerBtm = -1;
      let prevOuterTop = -1;
      let prevOuterBtm = -1;

      for (let i = 0; i < this.splineSamples.length; i++) {
        const s = this.splineSamples[i];
        if (s.isGap) {
          prevInnerTop = -1;
          continue;
        }

        const halfW = s.width * 0.5;
        // Extend slightly longitudinally along tangent for 0.10m segment overlap
        const center = s.point.clone().addScaledVector(s.binormal, side * halfW).addScaledVector(s.normal, railH * 0.5);
        
        // Inner face (facing track)
        const inTop = center.clone().addScaledVector(s.normal, railH * 0.5);
        const inBtm = center.clone().addScaledVector(s.normal, -railH * 0.5);
        // Outer face (facing away from track by railThickness)
        const outTop = inTop.clone().addScaledVector(s.binormal, side * railThickness);
        const outBtm = inBtm.clone().addScaledVector(s.binormal, side * railThickness);

        const currentInnerTop = railVertices.length / 3;
        railVertices.push(inTop.x, inTop.y, inTop.z);
        const currentInnerBtm = railVertices.length / 3;
        railVertices.push(inBtm.x, inBtm.y, inBtm.z);
        const currentOuterTop = railVertices.length / 3;
        railVertices.push(outTop.x, outTop.y, outTop.z);
        const currentOuterBtm = railVertices.length / 3;
        railVertices.push(outBtm.x, outBtm.y, outBtm.z);

        if (prevInnerTop !== -1) {
          // Inner face (facing road)
          railIndices.push(prevInnerTop, prevInnerBtm, currentInnerTop);
          railIndices.push(prevInnerBtm, currentInnerBtm, currentInnerTop);

          // Top cap (facing sky)
          railIndices.push(prevInnerTop, currentInnerTop, prevOuterTop);
          railIndices.push(currentInnerTop, currentOuterTop, prevOuterTop);

          // Outer face (away from road)
          railIndices.push(prevOuterTop, currentOuterTop, prevOuterBtm);
          railIndices.push(currentOuterTop, currentOuterBtm, prevOuterBtm);
        }

        prevInnerTop = currentInnerTop;
        prevInnerBtm = currentInnerBtm;
        prevOuterTop = currentOuterTop;
        prevOuterBtm = currentOuterBtm;

        // Add stanchion posts every 8 samples (away from start grid)
        if (side === 1 && i % 8 === 0 && i > 12 && i < this.splineSamples.length - 12) {
          [-1, 1].forEach(pSide => {
            const postGeom = new THREE.CylinderGeometry(0.10, 0.14, railH + 0.25, 8);
            const post = new THREE.Mesh(postGeom, postMat);
            const postPos = s.point.clone().addScaledVector(s.binormal, pSide * (halfW + railThickness * 0.5));
            post.position.copy(postPos);

            const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
            post.quaternion.setFromRotationMatrix(rotMat);

            this.scene.add(post);
            this.environmentObjects.push(post);
          });
        }
      }
    });

    if (railVertices.length > 0) {
      railGeom.setAttribute('position', new THREE.Float32BufferAttribute(railVertices, 3));
      railGeom.setIndex(railIndices);
      railGeom.computeVertexNormals();

      const railMesh = new THREE.Mesh(railGeom, railMat);
      this.scene.add(railMesh);
      this.environmentObjects.push(railMesh);
    }
  }

  buildBrakingDistanceBoards() {
    const targets = [0.25, 0.40, 0.55, 0.75];
    const distances = ['150', '100', '50'];

    targets.forEach(tU => {
      distances.forEach((distStr, dIdx) => {
        const u = ((tU - 0.015 * (dIdx + 1)) + 1.0) % 1.0;
        const s = this.getSampleAt(u);
        if (!s) return;

        const boardCanvas = document.createElement('canvas');
        boardCanvas.width = 128;
        boardCanvas.height = 64;
        const bctx = boardCanvas.getContext('2d');
        bctx.fillStyle = '#080c14';
        bctx.fillRect(0, 0, 128, 64);
        bctx.strokeStyle = '#00f0ff';
        bctx.lineWidth = 4;
        bctx.strokeRect(2, 2, 124, 60);
        bctx.fillStyle = '#ffffff';
        bctx.font = 'bold 36px monospace';
        bctx.textAlign = 'center';
        bctx.fillText(distStr, 64, 46);

        const boardTex = new THREE.CanvasTexture(boardCanvas);
        const boardMat = new THREE.MeshBasicMaterial({ map: boardTex });
        const boardGeom = new THREE.PlaneGeometry(1.6, 0.8);
        const board = new THREE.Mesh(boardGeom, boardMat);

        const halfW = s.width * 0.5;
        board.position.copy(s.point).addScaledVector(s.binormal, halfW + 1.6).addScaledVector(s.normal, 1.4);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        board.quaternion.setFromRotationMatrix(rotMat);

        // Stanchion post
        const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x222630, metalness: 0.8 });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.copy(board.position).addScaledVector(s.normal, -0.7);
        post.quaternion.copy(board.quaternion);

        this.scene.add(board);
        this.scene.add(post);
        this.environmentObjects.push(board);
        this.environmentObjects.push(post);
      });
    });
  }

  buildBoostAndLaunchPads() {
    this.boostTriggers = [];
    this.jumpTriggers = [];

    const boostMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d8ff,
      emissiveIntensity: 2.2,
      roughness: 0.2
    });

    const jumpMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,
      emissive: 0xff5500,
      emissiveIntensity: 2.5,
      roughness: 0.2
    });

    // 1. Boost pads
    if (this.mapConfig && this.mapConfig.boostPads) {
      this.mapConfig.boostPads.forEach(u => {
        const s = this.getSampleAt(u);
        if (!s) return;

        const padW = s.width * 0.7;
        const padL = 6.0;
        const padGeom = new THREE.BoxGeometry(padW, 0.08, padL);
        const pad = new THREE.Mesh(padGeom, boostMat);

        pad.position.copy(s.point).addScaledVector(s.normal, 0.05);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        pad.quaternion.setFromRotationMatrix(rotMat);

        this.scene.add(pad);
        this.environmentObjects.push(pad);

        this.boostTriggers.push({ u, point: s.point, normal: s.normal });
      });
    }

    // 2. Jump launch platforms & landing gates
    if (this.mapConfig && this.mapConfig.jumps) {
      this.mapConfig.jumps.forEach(j => {
        // Launch Ramp
        const sLaunch = this.getSampleAt(j.uStart);
        if (sLaunch) {
          const rampW = sLaunch.width;
          const rampGeom = new THREE.BoxGeometry(rampW, 0.6, 5.0);
          const ramp = new THREE.Mesh(rampGeom, jumpMat);
          ramp.position.copy(sLaunch.point).addScaledVector(sLaunch.normal, 0.3);
          const rotMat = new THREE.Matrix4().makeBasis(sLaunch.binormal, sLaunch.normal, sLaunch.tangent);
          ramp.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(ramp);
          this.environmentObjects.push(ramp);
        }

        // Landing Capture Arch
        const sLand = this.getSampleAt(j.uEnd);
        if (sLand) {
          const archW = sLand.width + 3.0;
          const archGeom = new THREE.BoxGeometry(archW, 4.0, 1.0);
          const archMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true });
          const arch = new THREE.Mesh(archGeom, archMat);
          arch.position.copy(sLand.point).addScaledVector(sLand.normal, 2.5);
          const rotMat = new THREE.Matrix4().makeBasis(sLand.binormal, sLand.normal, sLand.tangent);
          arch.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(arch);
          this.environmentObjects.push(arch);
        }
      });
    }
  }

  buildFinishGantry() {
    const s0 = this.getSampleAt(0.0);
    if (!s0) return;

    const gantry = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x141a24, metalness: 0.9, roughness: 0.2 });
    const accentColor = this.mapConfig ? parseInt(this.mapConfig.accent.primary.replace('#', '0x')) : 0x00f0ff;
    const bannerMat = new THREE.MeshBasicMaterial({ color: accentColor });

    const pillarH = 7.5;
    const halfW = s0.width * 0.5 + 4.5;

    const leftPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, pillarH), frameMat);
    leftPillar.position.set(-halfW, pillarH * 0.5, 0);
    gantry.add(leftPillar);

    const rightPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, pillarH), frameMat);
    rightPillar.position.set(halfW, pillarH * 0.5, 0);
    gantry.add(rightPillar);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 1.2, 0.8, 0.8), frameMat);
    crossbar.position.set(0, pillarH, 0);
    gantry.add(crossbar);

    const banner = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 1.6, 0.2), bannerMat);
    banner.position.set(0, pillarH - 0.9, 0);
    gantry.add(banner);

    // Place gantry aligned with 3D track frame at u = 0
    gantry.position.copy(s0.point);
    const rotMat = new THREE.Matrix4().makeBasis(s0.binormal, s0.normal, s0.tangent);
    gantry.quaternion.setFromRotationMatrix(rotMat);

    this.scene.add(gantry);
    this.environmentObjects.push(gantry);

    // Finish line strip on 3D track surface
    const finishLineGeom = new THREE.PlaneGeometry(s0.width, 2.0);
    const finishLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const finishLine = new THREE.Mesh(finishLineGeom, finishLineMat);
    finishLine.position.copy(s0.point).addScaledVector(s0.normal, 0.05);

    // Rotate plane so face aligns with track normal
    const flRot = new THREE.Matrix4().makeBasis(s0.binormal, s0.tangent, s0.normal);
    finishLine.quaternion.setFromRotationMatrix(flRot);

    this.scene.add(finishLine);
    this.environmentObjects.push(finishLine);
  }

  buildEnvironment() {
    const env = this.mapConfig ? this.mapConfig.environment : null;
    const groundColor = env ? env.groundColor : 0x1b3022;

    // Ground plane
    const groundGeom = new THREE.PlaneGeometry(800, 800, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: groundColor,
      roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.environmentObjects.push(ground);

    // Map-specific environment
    if (this.mapConfig) {
      switch (this.mapConfig.id) {
        case 'helios_rift':
          this.buildDesertEnvironment();
          break;
        case 'drowned_meridian':
          this.buildUrbanEnvironment();
          break;
        case 'thornwild_crown':
          this.buildForestEnvironment();
          break;
        case 'emerald_highway':
          if (window.EmeraldHighwayScenery) {
            this.emeraldHighwayScenery = new window.EmeraldHighwayScenery(this.scene, this);
          }
          break;
        default:
          this.buildDefaultTrees();
      }
    } else {
      this.buildDefaultTrees();
    }
  }

  // ─────────────────────────────────────────────
  // HELIOS RIFT — Desert canyon environment
  // ─────────────────────────────────────────────
  buildDesertEnvironment() {
    const canyonMat = new THREE.MeshStandardMaterial({ color: 0xb08040, roughness: 0.9 });
    const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.6, roughness: 0.3 });
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x2060a0, metalness: 0.9, roughness: 0.1 });
    const energyMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff });

    for (let i = 0; i < this.splineSamples.length; i += 6) {
      if (i < 14 || i > this.splineSamples.length - 14) continue; // Keep start grid open
      const s = this.splineSamples[i];
      const halfW = (s.width || 12) * 0.5;

      [-1, 1].forEach(side => {
        const dist = halfW + 16 + Math.random() * 25;
        const pos = s.point.clone().addScaledVector(s.binormal, side * dist);

        // Canyon walls — tall irregular boxes
        const h = 12 + Math.random() * 20;
        const w = 6 + Math.random() * 8;
        const wallGeom = new THREE.BoxGeometry(w, h, 8 + Math.random() * 6);
        const wall = new THREE.Mesh(wallGeom, canyonMat);
        wall.position.copy(pos);
        wall.position.y = h * 0.5;
        wall.rotation.y = Math.random() * Math.PI;
        wall.castShadow = true;
        this.scene.add(wall);
        this.environmentObjects.push(wall);

        // Occasional obsidian spires
        if (Math.random() > 0.7) {
          const spH = 8 + Math.random() * 15;
          const spire = new THREE.Mesh(
            new THREE.ConeGeometry(1.5 + Math.random(), spH, 5),
            obsidianMat
          );
          spire.position.copy(pos);
          spire.position.x += (Math.random() - 0.5) * 10;
          spire.position.z += (Math.random() - 0.5) * 10;
          spire.position.y = spH * 0.5;
          this.scene.add(spire);
          this.environmentObjects.push(spire);
        }

        // Solar panels — tilted reflective planes
        if (Math.random() > 0.8) {
          const panelW = 4 + Math.random() * 6;
          const panelH = 3 + Math.random() * 4;
          const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(panelW, panelH),
            solarMat
          );
          panel.position.copy(pos);
          panel.position.y = 5 + Math.random() * 10;
          panel.position.x += (Math.random() - 0.5) * 8;
          panel.rotation.x = -0.3 - Math.random() * 0.4;
          panel.rotation.y = Math.random() * Math.PI;
          this.scene.add(panel);
          this.environmentObjects.push(panel);
        }
      });

      // Ground-level energy conduits (glowing lines)
      if (i % 18 === 0) {
        const conduit = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.1, 6),
          energyMat
        );
        conduit.position.copy(s.point);
        conduit.position.y = 0.07;
        conduit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
        this.scene.add(conduit);
        this.environmentObjects.push(conduit);
      }
    }

    // Large distant sand dunes
    const duneMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 1.0 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 200 + Math.random() * 150;
      const dune = new THREE.Mesh(
        new THREE.SphereGeometry(30 + Math.random() * 40, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
        duneMat
      );
      dune.position.set(Math.cos(angle) * dist, -2, Math.sin(angle) * dist);
      dune.scale.y = 0.3 + Math.random() * 0.3;
      this.scene.add(dune);
      this.environmentObjects.push(dune);
    }
  }

  // ─────────────────────────────────────────────
  // DROWNED MERIDIAN — Urban flooded environment
  // ─────────────────────────────────────────────
  buildUrbanEnvironment() {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.85 });
    const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.9 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.95, metalness: 0.3 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0a2030,
      roughness: 0.05,
      metalness: 0.9,
      transparent: true,
      opacity: 0.6
    });

    for (let i = 0; i < this.splineSamples.length; i += 5) {
      if (i < 14 || i > this.splineSamples.length - 14) continue; // Keep start grid open
      const s = this.splineSamples[i];
      const halfW = (s.width || 12) * 0.5;

      [-1, 1].forEach(side => {
        const dist = halfW + 15 + Math.random() * 20;
        const pos = s.point.clone().addScaledVector(s.binormal, side * dist);

        // Buildings — tall concrete blocks
        const bH = 8 + Math.random() * 30;
        const bW = 5 + Math.random() * 8;
        const bD = 5 + Math.random() * 8;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bW, bH, bD),
          Math.random() > 0.5 ? concreteMat : darkConcrete
        );
        building.position.copy(pos);
        building.position.y = bH * 0.5;
        building.rotation.y = Math.random() * 0.3;
        building.castShadow = true;
        this.scene.add(building);
        this.environmentObjects.push(building);

        // Window lights — small emissive boxes on building faces
        if (Math.random() > 0.5) {
          const lightColors = [0x00cccc, 0xff3333, 0xffaa00];
          for (let w = 0; w < 3; w++) {
            const windowLight = new THREE.Mesh(
              new THREE.BoxGeometry(0.8, 0.6, 0.1),
              new THREE.MeshBasicMaterial({
                color: lightColors[Math.floor(Math.random() * lightColors.length)]
              })
            );
            windowLight.position.copy(pos);
            windowLight.position.y = 3 + w * 4;
            windowLight.position.x += side * (bW * 0.5 + 0.05);
            this.scene.add(windowLight);
            this.environmentObjects.push(windowLight);
          }
        }
      });

      // Flooded water planes alongside road
      if (i % 15 === 0) {
        const waterPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(20, 20),
          waterMat
        );
        waterPlane.rotation.x = -Math.PI * 0.5;
        waterPlane.position.copy(s.point);
        waterPlane.position.y = 0.02;
        waterPlane.position.x += (Math.random() - 0.5) * 20;
        waterPlane.position.z += (Math.random() - 0.5) * 20;
        this.scene.add(waterPlane);
        this.environmentObjects.push(waterPlane);
      }
    }

    // Elevated railway segments
    const railwayMat = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < this.splineSamples.length; i += 30) {
      if (i < 16 || i > this.splineSamples.length - 16) continue;
      const s = this.splineSamples[i];
      const pos = s.point.clone().addScaledVector(s.binormal, 25);

      // Pillars
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 12), railwayMat);
      pillar.position.copy(pos);
      pillar.position.y = 6;
      this.scene.add(pillar);
      this.environmentObjects.push(pillar);

      // Rail beam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 12), railwayMat);
      beam.position.copy(pos);
      beam.position.y = 12;
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
      this.scene.add(beam);
      this.environmentObjects.push(beam);
    }

    // Neon point lights
    const neonColors = [0x00cccc, 0xff3333, 0xff8800];
    for (let i = 0; i < this.splineSamples.length; i += 20) {
      const s = this.splineSamples[i];
      const side = (i % 2 === 0) ? 1 : -1;
      const lightPos = s.point.clone().addScaledVector(s.binormal, side * (s.width * 0.5 + 4));

      const neon = new THREE.PointLight(
        neonColors[i % neonColors.length],
        0.8,
        25
      );
      neon.position.copy(lightPos);
      neon.position.y = 3;
      this.scene.add(neon);
      this.environmentObjects.push(neon);

      // Light pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, 4),
        rustMat
      );
      pole.position.copy(lightPos);
      pole.position.y = 2;
      this.scene.add(pole);
      this.environmentObjects.push(pole);
    }
  }

  // ─────────────────────────────────────────────
  // THORNWILD CROWN — Bioluminescent forest
  // ─────────────────────────────────────────────
  buildForestEnvironment() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x22543d, roughness: 0.85 });
    const darkLeavesMat = new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.9 });
    const bioMat = new THREE.MeshBasicMaterial({ color: 0x00e8ff }); // Bioluminescent
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x2a5030, roughness: 1.0 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });

    for (let i = 0; i < this.splineSamples.length; i += 4) {
      if (i < 14 || i > this.splineSamples.length - 14) continue; // Keep start grid open
      const s = this.splineSamples[i];
      const halfW = (s.width || 12) * 0.5;

      [-1, 1].forEach(side => {
        const dist = halfW + 16 + Math.random() * 30;
        const pos = s.point.clone().addScaledVector(s.binormal, side * dist);

        // Giant trees
        if (Math.random() > 0.3) {
          const tree = new THREE.Group();
          const tH = 6 + Math.random() * 10;
          const tR = 0.4 + Math.random() * 0.8;

          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(tR * 0.6, tR, tH, 8),
            trunkMat
          );
          trunk.position.y = tH * 0.5;
          tree.add(trunk);

          // Multi-layered canopy
          const foliageCount = 2 + Math.floor(Math.random() * 3);
          for (let f = 0; f < foliageCount; f++) {
            const fR = 2.5 + Math.random() * 4;
            const fH = 3 + Math.random() * 4;
            const foliage = new THREE.Mesh(
              new THREE.ConeGeometry(fR, fH, 7),
              Math.random() > 0.4 ? leavesMat : darkLeavesMat
            );
            foliage.position.y = tH - 1 + f * 2.5;
            foliage.position.x += (Math.random() - 0.5) * 1.5;
            foliage.position.z += (Math.random() - 0.5) * 1.5;
            tree.add(foliage);
          }

          tree.position.copy(pos);
          this.scene.add(tree);
          this.environmentObjects.push(tree);
        }

        // Bioluminescent plants — small glowing spheres
        if (Math.random() > 0.6) {
          const bioCount = 2 + Math.floor(Math.random() * 4);
          for (let b = 0; b < bioCount; b++) {
            const glow = new THREE.Mesh(
              new THREE.SphereGeometry(0.15 + Math.random() * 0.25, 6, 6),
              bioMat
            );
            glow.position.copy(pos);
            glow.position.x += (Math.random() - 0.5) * 6;
            glow.position.z += (Math.random() - 0.5) * 6;
            glow.position.y = 0.2 + Math.random() * 1.5;
            this.scene.add(glow);
            this.environmentObjects.push(glow);
          }
        }

        // Ground-level roots crossing near road
        if (Math.random() > 0.85 && dist < 25) {
          const rootLen = 6 + Math.random() * 8;
          const root = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, rootLen, 6),
            rootMat
          );
          root.position.copy(pos);
          root.position.y = 0.2;
          root.rotation.z = Math.PI * 0.5;
          root.rotation.y = Math.random() * Math.PI;
          this.scene.add(root);
          this.environmentObjects.push(root);
        }
      });
    }

    // Root bridge arches over the track
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.22;
      const s = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      const archAngle = Math.atan2(t.x, t.z);

      const arch = new THREE.Group();
      // Two pillars
      [-1, 1].forEach(side => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.9, 8, 6),
          rootMat
        );
        pillar.position.set(side * (this.roadWidth * 0.5 + 2), 4, 0);
        arch.add(pillar);
      });
      // Cross beam
      const crossRoot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, this.roadWidth + 6, 6),
        rootMat
      );
      crossRoot.position.y = 8;
      crossRoot.rotation.z = Math.PI * 0.5;
      arch.add(crossRoot);

      // Hanging bio-lights
      for (let h = 0; h < 3; h++) {
        const hangLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 6, 6),
          bioMat
        );
        hangLight.position.set((h - 1) * 4, 6.5 - Math.random() * 1.5, 0);
        arch.add(hangLight);
      }

      arch.position.copy(s);
      arch.rotation.y = archAngle;
      this.scene.add(arch);
      this.environmentObjects.push(arch);
    }

    // Scattered bioluminescent point lights in the forest
    for (let i = 0; i < 15; i++) {
      const u = Math.random();
      const s = this.curve.getPointAt(u);
      const side = Math.random() > 0.5 ? 1 : -1;
      const n = new THREE.Vector3(
        -this.curve.getTangentAt(u).z, 0, this.curve.getTangentAt(u).x
      ).normalize();
      const pos = s.clone().addScaledVector(n, side * (20 + Math.random() * 25));

      const bioLight = new THREE.PointLight(0x00e8ff, 0.4, 20);
      bioLight.position.copy(pos);
      bioLight.position.y = 1 + Math.random() * 3;
      this.scene.add(bioLight);
      this.environmentObjects.push(bioLight);
    }
  }

  // ─────────────────────────────────────────────
  // DEFAULT — Simple trees (fallback)
  // ─────────────────────────────────────────────
  buildDefaultTrees() {
    const treeMatTrunk = new THREE.MeshStandardMaterial({ color: 0x3d2817 });
    const treeMatLeaves = new THREE.MeshStandardMaterial({ color: 0x22543d, roughness: 0.9 });

    for (let i = 0; i < 90; i++) {
      const u = Math.random();
      const s = this.curve.getPointAt(u);
      const side = Math.random() > 0.5 ? 1 : -1;
      const dist = 18 + Math.random() * 55;
      const normal = new THREE.Vector3(-this.curve.getTangentAt(u).z, 0, this.curve.getTangentAt(u).x).normalize();
      const pos = s.clone().addScaledVector(normal, side * dist);

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3.5), treeMatTrunk);
      trunk.position.y = 1.75;
      tree.add(trunk);

      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.0, 6), treeMatLeaves);
      foliage.position.y = 4.8;
      tree.add(foliage);

      tree.position.copy(pos);
      this.scene.add(tree);
      this.environmentObjects.push(tree);
    }
  }

  // ─────────────────────────────────────────────
  // MAP LANDMARKS — key set-pieces per map
  // ─────────────────────────────────────────────
  buildMapLandmarks() {
    if (!this.mapConfig || !this.mapConfig.landmarks) return;

    this.mapConfig.landmarks.forEach(lm => {
      const u = lm.uPosition;
      const point = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u);

      switch (lm.type) {
        case 'sun_gate':
          this.buildSunGate(point, tangent);
          break;
        case 'rift_bridge':
          this.buildRiftBridge(point, tangent);
          break;
        case 'flooded_terminal':
          this.buildFloodedTerminal(point, tangent);
          break;
        case 'reactor_spine':
          this.buildReactorSpine(point, tangent);
          break;
        case 'root_cathedral':
          this.buildRootCathedral(point, tangent);
          break;
        case 'moonwell_basin':
          this.buildMoonwellBasin(point, tangent);
          break;
      }
    });
  }

  buildSunGate(pos, tangent) {
    const s0 = this.getSampleAt(0.0);
    if (!s0) return;
    const gate = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb08040, roughness: 0.85 });
    const energyMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff });

    const pillarOffset = s0.width * 0.5 + 4.8;

    // Two massive pillars safely flanking the racetrack
    [-1, 1].forEach(side => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 4), stoneMat);
      pillar.position.set(side * pillarOffset, 9, 0);
      pillar.castShadow = true;
      gate.add(pillar);
    });

    // Top lintel overhead
    const lintelWidth = pillarOffset * 2 + 3.5;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintelWidth, 3, 4), stoneMat);
    lintel.position.set(0, 18, 0);
    gate.add(lintel);

    // Energy accents
    const energyStrip = new THREE.Mesh(new THREE.BoxGeometry(lintelWidth * 0.8, 0.3, 0.3), energyMat);
    energyStrip.position.set(0, 16, 2.2);
    gate.add(energyStrip);

    // Position 16m ahead of the start grid spanning across the road
    gate.position.copy(s0.point).addScaledVector(s0.tangent, 16.0);
    const rotMat = new THREE.Matrix4().makeBasis(s0.binormal, s0.normal, s0.tangent);
    gate.quaternion.setFromRotationMatrix(rotMat);

    this.scene.add(gate);
    this.environmentObjects.push(gate);
  }

  buildRiftBridge(pos, tangent) {
    const s = this.getSampleAt(0.60);
    if (!s) return;
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: 0.5, roughness: 0.5 });
    const energyMat = new THREE.MeshBasicMaterial({ color: 0x00c8ff });

    const bridge = new THREE.Group();
    // Bridge deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(s.width + 2, 0.5, 20), bridgeMat);
    deck.position.y = -0.25;
    bridge.add(deck);

    // Side rails
    [-1, 1].forEach(side => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 20), bridgeMat);
      rail.position.set(side * (s.width * 0.5 + 1), 0.75, 0);
      bridge.add(rail);
    });

    // Glowing underside
    const underGlow = new THREE.Mesh(new THREE.BoxGeometry(s.width, 0.1, 18), energyMat);
    underGlow.position.y = -0.5;
    bridge.add(underGlow);

    bridge.position.copy(s.point);
    const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
    bridge.quaternion.setFromRotationMatrix(rotMat);

    this.scene.add(bridge);
    this.environmentObjects.push(bridge);
  }

  buildFloodedTerminal(pos, tangent) {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x445566, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.4
    });

    const terminal = new THREE.Group();
    // Main building
    const main = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 15), concreteMat);
    main.position.y = 6;
    main.castShadow = true;
    terminal.add(main);

    // Glass dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), glassMat);
    dome.position.y = 12;
    terminal.add(dome);

    // Clock tower
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), concreteMat);
    tower.position.set(8, 9, 0);
    tower.castShadow = true;
    terminal.add(tower);

    const angle = Math.atan2(tangent.x, tangent.z);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    terminal.position.copy(pos).addScaledVector(normal, 22);
    terminal.rotation.y = angle;
    this.scene.add(terminal);
    this.environmentObjects.push(terminal);
  }

  buildReactorSpine(pos, tangent) {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.8, roughness: 0.3 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.8, metalness: 0.4 });
    const emergencyMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });

    const reactor = new THREE.Group();
    // Central cylinder
    const core = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 20, 12), metalMat);
    core.position.y = 10;
    core.castShadow = true;
    reactor.add(core);

    // Pipes
    for (let p = 0; p < 4; p++) {
      const pAngle = (p / 4) * Math.PI * 2;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15), pipeMat);
      pipe.position.set(Math.cos(pAngle) * 6, 7.5, Math.sin(pAngle) * 6);
      reactor.add(pipe);
    }

    // Warning light
    const warning = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), emergencyMat);
    warning.position.y = 21;
    reactor.add(warning);

    const angle = Math.atan2(tangent.x, tangent.z);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    reactor.position.copy(pos).addScaledVector(normal, -25);
    reactor.rotation.y = angle;
    this.scene.add(reactor);
    this.environmentObjects.push(reactor);
  }

  buildRootCathedral(pos, tangent) {
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
    const bioMat = new THREE.MeshBasicMaterial({ color: 0x00e8ff });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a6050, roughness: 0.9 });

    const cathedral = new THREE.Group();

    // Root arches
    for (let a = 0; a < 3; a++) {
      const archR = 8 + a * 3;
      [-1, 1].forEach(side => {
        const rootArch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.8, 1.2, archR * 1.5, 6),
          rootMat
        );
        rootArch.position.set(side * (4 + a * 2), archR * 0.6, a * 3);
        rootArch.rotation.z = side * 0.4;
        cathedral.add(rootArch);
      });
    }

    // Stone altar
    const altar = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 4), stoneMat);
    altar.position.y = 0.75;
    cathedral.add(altar);

    // Bio glow on altar
    const altarGlow = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), bioMat);
    altarGlow.position.y = 2;
    cathedral.add(altarGlow);

    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    cathedral.position.copy(pos).addScaledVector(normal, 20);
    this.scene.add(cathedral);
    this.environmentObjects.push(cathedral);
  }

  buildMoonwellBasin(pos, tangent) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a6050, roughness: 0.9 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00aacc, roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.7
    });
    const bioMat = new THREE.MeshBasicMaterial({ color: 0x00e8ff });

    const basin = new THREE.Group();
    // Stone ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.8, 6, 16), stoneMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.5;
    basin.add(ring);

    // Water surface
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24), waterMat);
    water.rotation.x = -Math.PI * 0.5;
    water.position.y = 0.3;
    basin.add(water);

    // Glowing center
    const centerGlow = new THREE.PointLight(0x00e8ff, 1.0, 15);
    centerGlow.position.y = 0.5;
    basin.add(centerGlow);

    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    basin.position.copy(pos).addScaledVector(normal, -18);
    this.scene.add(basin);
    this.environmentObjects.push(basin);
  }

  // ─────────────────────────────────────────────
  // WEATHER PARTICLE SYSTEM
  // ─────────────────────────────────────────────
  buildWeatherSystem() {
    if (!this.mapConfig || !this.mapConfig.environment.ambientParticle) return;

    const type = this.mapConfig.environment.ambientParticle;
    const count = 1500;
    const positions = new Float32Array(count * 3);
    let color, size, spread, heightRange;

    switch (type) {
      case 'sand':
        color = 0xd4a050;
        size = 0.15;
        spread = 200;
        heightRange = [0.5, 15];
        break;
      case 'rain':
        color = 0x8899bb;
        size = 0.08;
        spread = 150;
        heightRange = [0, 40];
        break;
      case 'spores':
        color = 0x00e8ff;
        size = 0.12;
        spread = 180;
        heightRange = [0.5, 12];
        break;
      default:
        return;
    }

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = heightRange[0] + Math.random() * (heightRange[1] - heightRange[0]);
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });

    this.particleSystem = new THREE.Points(geom, mat);
    this.particleType = type;
    this.scene.add(this.particleSystem);
    this.environmentObjects.push(this.particleSystem);
  }

  updateWeather(dt, cameraPos) {
    if (!this.particleSystem) return;

    const positions = this.particleSystem.geometry.attributes.position.array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;

      switch (this.particleType) {
        case 'sand':
          positions[idx] += 4 * dt;         // Wind X
          positions[idx + 1] -= 0.3 * dt;   // Slight fall
          positions[idx + 2] += 1.5 * dt;   // Wind Z
          if (positions[idx] > 100) positions[idx] -= 200;
          if (positions[idx + 1] < 0.5) positions[idx + 1] = 15;
          break;
        case 'rain':
          positions[idx + 1] -= 25 * dt;    // Fast fall
          positions[idx] += 1.5 * dt;       // Wind
          if (positions[idx + 1] < 0) positions[idx + 1] = 40;
          break;
        case 'spores':
          positions[idx] += Math.sin(Date.now() * 0.001 + i) * 0.3 * dt;
          positions[idx + 1] += Math.sin(Date.now() * 0.0005 + i * 0.7) * 0.5 * dt;
          positions[idx + 2] += Math.cos(Date.now() * 0.001 + i * 0.5) * 0.3 * dt;
          break;
      }
    }

    // Center particles around camera
    if (cameraPos) {
      this.particleSystem.position.x = cameraPos.x;
      this.particleSystem.position.z = cameraPos.z;
    }

    this.particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  setupCheckpoints() {
    this.checkpoints = [];
    const count = 16;
    const gateMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.7,
      wireframe: true
    });

    for (let i = 0; i < count; i++) {
      const u = i / count;
      const s = this.getSampleAt(u);
      if (!s) continue;

      this.checkpoints.push({
        index: i,
        u,
        pos: s.point,
        tangent: s.tangent,
        normal: s.normal,
        binormal: s.binormal,
        width: s.width
      });

      // Spawn 3D holographic checkpoint gate arch (except at u=0 where gantry stands)
      if (i > 0 && !s.isGap) {
        const archW = s.width + 1.2;
        const archH = 5.0;
        const archGeom = new THREE.BoxGeometry(archW, archH, 0.4);
        const archMesh = new THREE.Mesh(archGeom, gateMat);

        archMesh.position.copy(s.point).addScaledVector(s.normal, archH * 0.5);
        const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
        archMesh.quaternion.setFromRotationMatrix(rotMat);

        this.scene.add(archMesh);
        this.environmentObjects.push(archMesh);
      }
    }
  }

  getClosestSample(pos) {
    let closestSample = this.splineSamples[0];
    let minDistSq = Infinity;

    for (let i = 0; i < this.splineSamples.length; i++) {
      const s = this.splineSamples[i];
      const dSq = s.point.distanceToSquared(pos);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestSample = s;
      }
    }

    const toCar = new THREE.Vector3().subVectors(pos, closestSample.point);
    const height = toCar.dot(closestSample.normal);
    const lateralOffset = toCar.dot(closestSample.binormal);

    return {
      sample: closestSample,
      u: closestSample.u,
      distSq: minDistSq,
      height,
      lateralOffset
    };
  }

  getTrackProgress(pos) {
    return this.getClosestSample(pos).u;
  }

  isWithinTrack(pos) {
    const res = this.getClosestSample(pos);
    const halfW = res.sample.width * 0.5;
    return Math.abs(res.lateralOffset) <= halfW && res.height >= -0.5 && res.height <= 4.0;
  }

  update(dt, playerPhysics, allPhysics) {
    if (this.emeraldHighwayTraffic) {
      this.emeraldHighwayTraffic.update(dt, playerPhysics, allPhysics);
    }
    if (this.emeraldHighwayAudio) {
      this.emeraldHighwayAudio.update(dt, playerPhysics);
    }
    if (this.particleSystem && playerPhysics) {
      this.updateWeather(dt, playerPhysics.position);
    }
  }

  destroy() {
    if (this.emeraldHighwayGeometry) {
      this.emeraldHighwayGeometry.destroy();
      this.emeraldHighwayGeometry = null;
    }
    if (this.emeraldHighwayTraffic) {
      this.emeraldHighwayTraffic.destroy();
      this.emeraldHighwayTraffic = null;
    }
    if (this.emeraldHighwayScenery) {
      this.emeraldHighwayScenery.destroy();
      this.emeraldHighwayScenery = null;
    }
    if (this.emeraldHighwayAudio) {
      this.emeraldHighwayAudio.destroy();
      this.emeraldHighwayAudio = null;
    }
    this.environmentObjects.forEach(obj => {
      if (obj.parent) obj.parent.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.environmentObjects = [];
  }
}

window.TrackManager = TrackManager;
