/**
 * Turbo Rush - Emerald Highway Civilian Traffic System
 * 
 * Implements high-fidelity left-hand highway civilian traffic:
 * - Left-hand traffic rules (travel left, overtake right, return to left)
 * - Three vehicle classes:
 *     - Sedans (~70%): 75–100 km/h (20.8 – 27.8 m/s)
 *     - Vans (~20%):   70–90 km/h  (19.4 – 25.0 m/s)
 *     - Trucks (~10%): 55–75 km/h  (15.3 – 20.8 m/s)
 * - Proximity detection & collision avoidance:
 *     - Detects approaching racers within 45m
 *     - Decelerates, illuminates brake lights, and steers towards road shoulder
 * - Object pooling of 22 active vehicles recycled around the 4.8 km track
 */

(function() {
  class CivilianVehicle {
    constructor(scene, trackManager, type = 'sedan') {
      this.scene = scene;
      this.track = trackManager;
      this.type = type;

      this.mesh = null;
      this.brakeLights = [];
      this.headlights = [];

      this.trackU = 0;
      this.lateralOffset = -2.4; // Default left lane in carriageway (-2.4m)
      this.targetLateralOffset = -2.4;
      this.speed = 22.0; // m/s
      this.baseSpeed = 22.0;
      this.length = 4.4;
      this.width = 1.9;

      this.isBraking = false;
      this.isYielding = false;
      this.yieldCooldown = 0;
      this.active = false;

      this.buildModel();
    }

    buildModel() {
      this.mesh = new THREE.Group();

      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x152238, roughness: 0.1, metalness: 0.9 });
      const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const brakeMat = new THREE.MeshStandardMaterial({
        color: 0xff1111,
        emissive: 0xaa0000,
        emissiveIntensity: 0.8,
        roughness: 0.3
      });

      if (this.type === 'sedan') {
        // SEDAN MODEL (~70%)
        this.length = 4.4;
        this.width = 1.85;
        this.baseSpeed = 20.8 + Math.random() * 7.0; // 75–100 km/h

        const sedanColors = [0xd1d5db, 0x1f2937, 0x2563eb, 0xdc2626, 0x4b5563];
        const bodyColor = sedanColors[Math.floor(Math.random() * sedanColors.length)];
        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7, roughness: 0.3 });

        // Lower body
        const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 4.4), bodyMat);
        lowerBody.position.y = 0.52;
        lowerBody.castShadow = true;
        this.mesh.add(lowerBody);

        // Greenhouse cabin
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.3), glassMat);
        cabin.position.set(0, 1.05, -0.2);
        cabin.castShadow = true;
        this.mesh.add(cabin);

        // Roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.08, 2.25), bodyMat);
        roof.position.set(0, 1.34, -0.2);
        this.mesh.add(roof);

        // Headlights
        [-0.65, 0.65].forEach(x => {
          const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.1), headMat);
          hl.position.set(x, 0.62, 2.21);
          this.mesh.add(hl);
          this.headlights.push(hl);
        });

        // Brake lights
        [-0.65, 0.65].forEach(x => {
          const bl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.1), brakeMat.clone());
          bl.position.set(x, 0.64, -2.21);
          this.mesh.add(bl);
          this.brakeLights.push(bl);
        });

      } else if (this.type === 'van') {
        // COMMERCIAL DELIVERY VAN (~20%)
        this.length = 5.2;
        this.width = 2.0;
        this.baseSpeed = 19.4 + Math.random() * 5.6; // 70–90 km/h

        const vanColors = [0xf3f4f6, 0x1e3a8a, 0x374151];
        const bodyColor = vanColors[Math.floor(Math.random() * vanColors.length)];
        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.4, roughness: 0.5 });

        const vanBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 5.2), bodyMat);
        vanBody.position.y = 1.05;
        vanBody.castShadow = true;
        this.mesh.add(vanBody);

        // Windshield
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), glassMat);
        windshield.position.set(0, 1.25, 2.56);
        windshield.rotation.x = 0.25;
        this.mesh.add(windshield);

        // Headlights & Brake lights
        [-0.75, 0.75].forEach(x => {
          const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
          hl.position.set(x, 0.75, 2.61);
          this.mesh.add(hl);
          this.headlights.push(hl);

          const bl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.1), brakeMat.clone());
          bl.position.set(x, 0.85, -2.61);
          this.mesh.add(bl);
          this.brakeLights.push(bl);
        });

      } else {
        // HEAVY FREIGHT TRUCK (~10%)
        this.length = 9.8;
        this.width = 2.4;
        this.baseSpeed = 15.3 + Math.random() * 5.5; // 55–75 km/h

        const cabMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.6, roughness: 0.4 });
        const trailerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });

        // Cab
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.2, 2.6), cabMat);
        cab.position.set(0, 1.45, 3.4);
        cab.castShadow = true;
        this.mesh.add(cab);

        // Trailer
        const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 6.8), trailerMat);
        trailer.position.set(0, 1.75, -1.4);
        trailer.castShadow = true;
        this.mesh.add(trailer);

        // Headlights & Brake lights
        [-0.85, 0.85].forEach(x => {
          const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), headMat);
          hl.position.set(x, 0.75, 4.71);
          this.mesh.add(hl);
          this.headlights.push(hl);

          const bl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), brakeMat.clone());
          bl.position.set(x, 0.85, -4.81);
          this.mesh.add(bl);
          this.brakeLights.push(bl);
        });
      }

      // Wheels
      const wheelGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
      wheelGeom.rotateZ(Math.PI * 0.5);

      const wheelZ = this.length * 0.35;
      const wheelX = this.width * 0.48;

      [
        [-wheelX, 0.36, wheelZ],
        [wheelX, 0.36, wheelZ],
        [-wheelX, 0.36, -wheelZ],
        [wheelX, 0.36, -wheelZ]
      ].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        this.mesh.add(wheel);
      });

      this.mesh.visible = false;
      this.scene.add(this.mesh);
    }

    spawn(u, lane = 'left') {
      this.trackU = ((u % 1.0) + 1.0) % 1.0;
      // Left-hand traffic rules:
      // Left lane (travel): -2.4m
      // Right lane (passing): +2.4m
      this.targetLateralOffset = (lane === 'left') ? -2.4 : 2.4;
      this.lateralOffset = this.targetLateralOffset;
      this.speed = this.baseSpeed;
      this.isBraking = false;
      this.isYielding = false;
      this.yieldCooldown = 0;
      this.active = true;
      this.mesh.visible = true;

      this.updateTransform();
    }

    despawn() {
      this.active = false;
      this.mesh.visible = false;
    }

    update(dt, racers) {
      if (!this.active || !this.track) return;

      const trackLen = Math.max(100.0, this.track.trackLength);

      // ─────────────────────────────────────────────
      // PROXIMITY DETECTION & REACTIVE YIELDING
      // ─────────────────────────────────────────────
      let nearestDist = Infinity;
      let shouldBrake = false;
      let shouldYield = false;

      racers.forEach(r => {
        if (!r || !r.position) return;

        // Calculate distance along track and 3D Euclidean distance
        const dist3D = r.position.distanceTo(this.mesh.position);
        if (dist3D < 48.0) {
          // Check if racer is behind and catching up, or in oncoming/adjacent proximity
          const s = this.track.getSampleAt(this.trackU);
          if (s) {
            const toRacer = new THREE.Vector3().subVectors(r.position, this.mesh.position);
            const dotFwd = toRacer.dot(s.tangent);

            // Racer is within 40m behind or dangerously close ahead
            if (dotFwd < 10.0 && dotFwd > -42.0) {
              nearestDist = Math.min(nearestDist, dist3D);
              shouldBrake = true;

              // If racer is closing fast, steer towards the left shoulder (-4.0m) to clear the passing lane!
              if (r.speed > this.speed) {
                shouldYield = true;
              }
            }
          }
        }
      });

      if (shouldYield) {
        this.targetLateralOffset = -3.8; // Move to shoulder
        this.isYielding = true;
        this.yieldCooldown = 3.0;
      } else if (this.yieldCooldown > 0) {
        this.yieldCooldown -= dt;
        if (this.yieldCooldown <= 0) {
          this.targetLateralOffset = -2.4; // Return to standard left lane
          this.isYielding = false;
        }
      }

      // Smooth lateral transition
      this.lateralOffset = THREE.MathUtils.damp(this.lateralOffset, this.targetLateralOffset, 3.5, dt);

      // Decelerate if braking, else cruise at baseSpeed
      if (shouldBrake) {
        this.isBraking = true;
        this.speed = THREE.MathUtils.damp(this.speed, this.baseSpeed * 0.65, 4.0, dt);
      } else {
        this.isBraking = false;
        this.speed = THREE.MathUtils.damp(this.speed, this.baseSpeed, 2.0, dt);
      }

      // Update brake light glow
      this.brakeLights.forEach(bl => {
        if (bl.material) {
          bl.material.emissiveIntensity = this.isBraking ? 2.5 : 0.4;
        }
      });

      // Advance along spline
      const deltaU = (this.speed / trackLen) * dt;
      this.trackU = ((this.trackU + deltaU) % 1.0 + 1.0) % 1.0;

      this.updateTransform();
    }

    updateTransform() {
      const s = this.track.getSampleAt(this.trackU);
      if (!s) return;

      const pos = s.point.clone()
        .addScaledVector(s.binormal, this.lateralOffset)
        .addScaledVector(s.normal, 0.05);

      this.mesh.position.copy(pos);

      // Orient forward along tangent
      const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
      this.mesh.quaternion.setFromRotationMatrix(rotMat);
    }

    destroy() {
      if (this.mesh && this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
    }
  }

  // ─────────────────────────────────────────────
  // TRAFFIC FLEET MANAGER
  // ─────────────────────────────────────────────
  class EmeraldHighwayTraffic {
    constructor(scene, trackManager) {
      this.scene = scene;
      this.track = trackManager;
      this.vehicles = [];
      this.poolSize = 22; // 22 pooled vehicles

      this.initFleet();
    }

    initFleet() {
      // 70% Sedans, 20% Vans, 10% Trucks
      const counts = {
        sedan: Math.round(this.poolSize * 0.70),
        van: Math.round(this.poolSize * 0.20),
        truck: Math.round(this.poolSize * 0.10)
      };

      for (let i = 0; i < counts.sedan; i++) {
        this.vehicles.push(new CivilianVehicle(this.scene, this.track, 'sedan'));
      }
      for (let i = 0; i < counts.van; i++) {
        this.vehicles.push(new CivilianVehicle(this.scene, this.track, 'van'));
      }
      for (let i = 0; i < counts.truck; i++) {
        this.vehicles.push(new CivilianVehicle(this.scene, this.track, 'truck'));
      }

      // Distribute vehicles evenly along the 4.8 km track
      // Avoid start grid area: keep u between 0.08 and 0.94
      const spacing = 0.86 / this.poolSize;
      this.vehicles.forEach((v, idx) => {
        const u = 0.08 + idx * spacing + (Math.random() - 0.5) * 0.02;
        const lane = (idx % 3 === 0) ? 'right' : 'left'; // Mostly left lane, occasional overtaker in right lane
        v.spawn(u, lane);
      });
    }

    update(dt, playerPhysics, allRacers = []) {
      if (!this.track || this.vehicles.length === 0) return;

      const racers = allRacers.length > 0 ? allRacers : (playerPhysics ? [playerPhysics] : []);

      // Get player U position
      const playerU = playerPhysics ? playerPhysics.trackU : 0;

      this.vehicles.forEach(v => {
        v.update(dt, racers);

        // Recycle vehicles that fall far behind (> 1.2 km behind player) to spawn ahead
        if (playerPhysics) {
          let distU = v.trackU - playerU;
          if (distU < -0.5) distU += 1.0;
          if (distU > 0.5) distU -= 1.0;

          // If vehicle is more than 0.32 U (~1.5 km) behind player, recycle it ahead
          if (distU < -0.28) {
            const newU = ((playerU + 0.35 + Math.random() * 0.15) % 1.0 + 1.0) % 1.0;
            // Ensure not in start grid zone
            if (newU > 0.06 && newU < 0.94) {
              v.spawn(newU, Math.random() > 0.3 ? 'left' : 'right');
            }
          }
        }
      });
    }

    destroy() {
      this.vehicles.forEach(v => v.destroy());
      this.vehicles = [];
    }
  }

  window.EmeraldHighwayTraffic = EmeraldHighwayTraffic;
})();
