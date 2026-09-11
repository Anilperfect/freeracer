/**
 * Destructible Obstacles & Debris Particle Pool for Turbo Rush.
 * Implements breakable neon barriers, holographic speedway signs, and energy pylons
 * with shattered debris physics, object pooling, and balanced collision slowdown.
 */
class DestructiblesManager {
  constructor(scene, trackManager) {
    this.scene = scene;
    this.track = trackManager;
    this.obstacles = [];
    this.debrisPool = [];
    this.activeDebris = [];

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.initPool();
    this.spawnTrackObstacles();
  }

  initPool() {
    // Pre-allocate 60 reusable debris mesh fragments
    const fragGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const fragMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 1.5,
      roughness: 0.4
    });

    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(fragGeom, fragMat.clone());
      mesh.visible = false;
      this.group.add(mesh);
      this.debrisPool.push(mesh);
    }
  }

  spawnTrackObstacles() {
    if (!this.track || !this.track.splineSamples || this.track.splineSamples.length === 0) return;

    // Place destructible barriers and signs around corners and straights
    const obstacleLocations = [0.08, 0.18, 0.32, 0.46, 0.62, 0.74, 0.86];

    const barrierGeom = new THREE.BoxGeometry(1.4, 0.8, 0.3);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xff3344,
      emissive: 0xaa1122,
      emissiveIntensity: 1.4,
      roughness: 0.3
    });

    const signGeom = new THREE.BoxGeometry(1.8, 1.2, 0.15);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0x00e8ff,
      emissive: 0x0088ff,
      emissiveIntensity: 2.0,
      roughness: 0.2
    });

    obstacleLocations.forEach((u, i) => {
      const s = this.track.getSampleAt(u);
      if (!s || s.isGap) return;

      const isSign = i % 2 === 0;
      const obsGroup = new THREE.Group();

      const mesh = new THREE.Mesh(isSign ? signGeom : barrierGeom, isSign ? signMat : barrierMat);
      obsGroup.add(mesh);

      // Place near road edges
      const side = (i % 2 === 0) ? -1 : 1;
      const offset = side * (s.width * 0.38);

      obsGroup.position.copy(s.point)
        .addScaledVector(s.binormal, offset)
        .addScaledVector(s.normal, isSign ? 0.9 : 0.45);

      const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
      obsGroup.quaternion.setFromRotationMatrix(rotMat);

      this.group.add(obsGroup);

      this.obstacles.push({
        id: 'obs_' + i,
        group: obsGroup,
        mesh,
        position: obsGroup.position,
        normal: s.normal,
        active: true,
        respawnTimer: 0,
        radius: isSign ? 1.6 : 1.2
      });
    });
  }

  update(dt, playerPhysics, aiRacers = []) {
    const allPhysics = [playerPhysics, ...aiRacers.map(a => a.physics)].filter(Boolean);

    // 1. Check collisions with active obstacles
    this.obstacles.forEach(obs => {
      if (!obs.active) {
        obs.respawnTimer -= dt;
        if (obs.respawnTimer <= 0) {
          obs.active = true;
          obs.mesh.visible = true;
        }
        return;
      }

      for (const p of allPhysics) {
        const dist = p.position.distanceTo(obs.position);
        if (dist < obs.radius + 1.2) {
          // Trigger Destruction
          this.shatterObstacle(obs, p);
          break;
        }
      }
    });

    // 2. Update debris physics from object pool
    for (let i = this.activeDebris.length - 1; i >= 0; i--) {
      const d = this.activeDebris[i];
      d.life -= dt;

      if (d.life <= 0) {
        d.mesh.visible = false;
        this.debrisPool.push(d.mesh);
        this.activeDebris.splice(i, 1);
        continue;
      }

      // Ballistic velocity and tumble
      d.velocity.y -= 18.0 * dt;
      d.mesh.position.addScaledVector(d.velocity, dt);
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;

      // Fade out
      const alpha = Math.max(0, d.life / d.maxLife);
      d.mesh.material.opacity = alpha;
      d.mesh.material.transparent = true;
    }
  }

  shatterObstacle(obs, collidingPhysics) {
    obs.active = false;
    obs.mesh.visible = false;
    obs.respawnTimer = 14.0; // 14-second regenerate timer

    // Balanced collision penalty: momentary speed reduction with cooldown
    if (collidingPhysics.collisionCooldown <= 0 && Math.abs(collidingPhysics.speed) > 10.0) {
      const impactRatio = Math.min(1.0, Math.abs(collidingPhysics.speed) / collidingPhysics.maxSpeed);
      collidingPhysics.speed *= (0.84 - impactRatio * 0.12);
      collidingPhysics.collisionCooldown = 0.8;

      if (collidingPhysics.isPlayer && window.SoundEngine) {
        window.SoundEngine.playImpact(impactRatio);
      }
    }

    // Spawn 6 debris fragments from pool
    const impactDir = collidingPhysics.getForwardVector ? collidingPhysics.getForwardVector() : new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < 6 && this.debrisPool.length > 0; k++) {
      const fragment = this.debrisPool.pop();
      fragment.visible = true;
      fragment.position.copy(obs.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));

      const velocity = impactDir.clone().multiplyScalar(12 + Math.random() * 15)
        .add(new THREE.Vector3((Math.random() - 0.5) * 10, 6 + Math.random() * 8, (Math.random() - 0.5) * 10));

      this.activeDebris.push({
        mesh: fragment,
        velocity,
        rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 2.2,
        maxLife: 2.2
      });
    }
  }

  dispose() {
    if (this.group) {
      this.scene.remove(this.group);
    }
  }
}

window.DestructiblesManager = DestructiblesManager;
