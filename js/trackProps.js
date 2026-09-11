/**
 * 3D Track Props System for Turbo Rush:
 * - Collectible 3D spinning nitro canisters that replenish stored nitro fuel
 * - Track-mounted boost pads with pulsating energy lights
 * - Sliding and angled jump launch platforms with warning chevrons
 */
class TrackPropsManager {
  constructor(scene, trackManager) {
    this.scene = scene;
    this.track = trackManager;
    this.canisters = [];
    this.boostPads = [];
    this.launchers = [];
    this.cashOrbs = [];
    this.cashPickupCallbacks = [];

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.initProps();
  }

  initProps() {
    if (!this.track || !this.track.splineSamples || this.track.splineSamples.length === 0) return;

    // 1. Collectible Nitro Canisters (placed every ~0.08 of lap on strategic racing lines)
    const canisterPositions = [0.03, 0.12, 0.26, 0.38, 0.52, 0.66, 0.76, 0.90];
    const canGeom = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 16);
    const canMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.8
    });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x111622, metalness: 0.9 });

    canisterPositions.forEach((u, i) => {
      const s = this.track.getSampleAt(u);
      if (!s || s.isGap) return;

      const canisterGroup = new THREE.Group();
      // Alternate left, center, right lanes
      const laneOffset = (i % 3 === 0) ? -s.width * 0.25 : (i % 3 === 1 ? s.width * 0.25 : 0);

      const body = new THREE.Mesh(canGeom, canMat);
      canisterGroup.add(body);

      // Metal endcaps
      [-0.55, 0.55].forEach(y => {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16), capMat);
        cap.position.y = y;
        canisterGroup.add(cap);
      });

      // Holographic glowing aura ring
      const ringGeom = new THREE.TorusGeometry(0.65, 0.04, 8, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      canisterGroup.add(ring);

      // Position along 3D track surface
      const pos = s.point.clone()
        .addScaledVector(s.binormal, laneOffset)
        .addScaledVector(s.normal, 1.2);
      canisterGroup.position.copy(pos);

      // Align up vector with track normal
      canisterGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.normal);

      this.group.add(canisterGroup);

      this.canisters.push({
        u,
        group: canisterGroup,
        ring,
        laneOffset,
        respawnTimer: 0,
        active: true
      });
    });

    // 2. Sliding Launch Platform (Section 8: Jumps & Sliding Launchers)
    // Spawn dynamic moving launcher on suitable straight
    const sSlide = this.track.getSampleAt(0.35);
    if (sSlide) {
      const launcherGroup = new THREE.Group();
      const slideGeom = new THREE.BoxGeometry(4.5, 0.45, 6.5);
      const slideMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff6600,
        emissiveIntensity: 2.0,
        roughness: 0.3
      });
      const slideMesh = new THREE.Mesh(slideGeom, slideMat);
      launcherGroup.add(slideMesh);

      // Warning Chevron Strip
      const chevGeom = new THREE.PlaneGeometry(3.5, 5.0);
      const chevMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
      const chev = new THREE.Mesh(chevGeom, chevMat);
      chev.rotation.x = -Math.PI * 0.5;
      chev.position.y = 0.24;
      launcherGroup.add(chev);

      launcherGroup.position.copy(sSlide.point).addScaledVector(sSlide.normal, 0.25);
      const rotMat = new THREE.Matrix4().makeBasis(sSlide.binormal, sSlide.normal, sSlide.tangent);
      launcherGroup.quaternion.setFromRotationMatrix(rotMat);

      this.group.add(launcherGroup);
      this.launchers.push({
        group: launcherGroup,
        sample: sSlide,
        slideOffset: 0,
        direction: 1
      });
    }

    // 3. Cash Orbs (Floating Gold Collectibles)
    const cashPositions = [0.07, 0.14, 0.23, 0.33, 0.43, 0.54, 0.63, 0.73, 0.83, 0.93];
    const cashGeom = new THREE.SphereGeometry(0.42, 16, 12);
    const cashMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 2.0,
      roughness: 0.15,
      metalness: 0.92
    });

    cashPositions.forEach((u, i) => {
      const s = this.track.getSampleAt(u);
      if (!s || s.isGap) return;

      const orbGroup = new THREE.Group();
      const laneOffset = (i % 3 === 0) ? -s.width * 0.2 : (i % 3 === 1 ? s.width * 0.2 : 0);

      const sphere = new THREE.Mesh(cashGeom, cashMat);
      orbGroup.add(sphere);

      // Inner ₡ symbol ring
      const innerRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.03, 8, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true })
      );
      orbGroup.add(innerRing);

      // Point light glow
      const glow = new THREE.PointLight(0xffcc00, 1.5, 5);
      glow.position.y = 0;
      orbGroup.add(glow);

      const pos = s.point.clone()
        .addScaledVector(s.binormal, laneOffset)
        .addScaledVector(s.normal, 1.5);
      orbGroup.position.copy(pos);

      this.group.add(orbGroup);

      const cashValue = 100 + Math.floor(Math.random() * 150); // 100-250₡

      this.cashOrbs.push({
        u,
        group: orbGroup,
        innerRing,
        glow,
        laneOffset,
        baseY: pos.y,
        respawnTimer: 0,
        active: true,
        value: cashValue
      });
    });
  }

  onCashPickup(callback) {
    this.cashPickupCallbacks.push(callback);
  }

  update(dt, playerPhysics, aiRacers = []) {
    const allPhysics = [playerPhysics, ...aiRacers.map(a => a.physics)].filter(Boolean);

    // 1. Update spinning nitro canisters & collection detection
    this.canisters.forEach(c => {
      if (!c.active) {
        c.respawnTimer -= dt;
        if (c.respawnTimer <= 0) {
          c.active = true;
          c.group.visible = true;
        }
        return;
      }

      // Rotate canister and pulse aura ring
      c.group.rotation.y += 2.8 * dt;
      if (c.ring) {
        c.ring.rotation.x += 1.5 * dt;
        c.ring.rotation.z += 1.2 * dt;
      }

      // Check proximity with all vehicles
      for (const p of allPhysics) {
        const dist = p.position.distanceTo(c.group.position);
        if (dist < 2.5) {
          // Collect nitro canister!
          c.active = false;
          c.group.visible = false;
          c.respawnTimer = 9.0; // 9 second respawn timer

          // Refill 35% nitro capacity
          p.nitroFuel = Math.min(p.maxNitro, p.nitroFuel + (p.maxNitro * 0.35));

          if (p.isPlayer && window.SoundEngine) {
            window.SoundEngine.playBeep(true);
          }
          break;
        }
      }
    });

    // 2. Update Sliding Launchers (sliding sideways across track)
    this.launchers.forEach(l => {
      l.slideOffset += l.direction * 3.5 * dt;
      const maxSlide = (l.sample.width * 0.5) - 2.8;
      if (Math.abs(l.slideOffset) > maxSlide) {
        l.direction *= -1;
        l.slideOffset = Math.sign(l.slideOffset) * maxSlide;
      }

      const newPos = l.sample.point.clone()
        .addScaledVector(l.sample.binormal, l.slideOffset)
        .addScaledVector(l.sample.normal, 0.25);
      l.group.position.copy(newPos);

      // Trigger launch impulse on vehicle driving onto launcher
      for (const p of allPhysics) {
        if (!p.isAirborne && p.position.distanceTo(l.group.position) < 3.2) {
          p.isAirborne = true;
          p.velocity.copy(p.getForwardVector()).multiplyScalar(p.speed * 1.25);
          p.velocity.addScaledVector(l.sample.normal, 12.0); // Super launch into air
          p.speed *= 1.25;

          if (p.isPlayer && window.SoundEngine) {
            window.SoundEngine.playNitro();
          }
        }
      }
    });

    // 3. Update Cash Orbs (spin, bob, player-only collection)
    const time = Date.now() * 0.003;
    this.cashOrbs.forEach(orb => {
      if (!orb.active) {
        orb.respawnTimer -= dt;
        if (orb.respawnTimer <= 0) {
          orb.active = true;
          orb.group.visible = true;
        }
        return;
      }

      // Spin and bob animation
      orb.group.rotation.y += 3.2 * dt;
      if (orb.innerRing) {
        orb.innerRing.rotation.x += 2.0 * dt;
      }

      // Floating bob effect
      const bobOffset = Math.sin(time + orb.u * 20) * 0.3;
      const s = this.track.getSampleAt(orb.u);
      if (s) {
        const pos = s.point.clone()
          .addScaledVector(s.binormal, orb.laneOffset)
          .addScaledVector(s.normal, 1.5 + bobOffset);
        orb.group.position.copy(pos);
      }

      // Player-only collection (cash is not collected by AI)
      if (playerPhysics) {
        const dist = playerPhysics.position.distanceTo(orb.group.position);
        if (dist < 3.0) {
          orb.active = false;
          orb.group.visible = false;
          orb.respawnTimer = 12.0;

          // Award cash
          if (window.SaveManager) {
            window.SaveManager.addCash(orb.value);
          }

          // Notify listeners (HUD popup)
          this.cashPickupCallbacks.forEach(cb => cb(orb.value));

          if (window.SoundEngine) {
            window.SoundEngine.playBeep(true);
          }
        }
      }
    });
  }

  dispose() {
    if (this.group) {
      this.scene.remove(this.group);
    }
  }
}

window.TrackPropsManager = TrackPropsManager;
