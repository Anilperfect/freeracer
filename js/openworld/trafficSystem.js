/**
 * FreeRacer - Ambient traffic for the open world.
 * ---------------------------------------------------------------------------
 * Civilian cars follow road-network lanes, keep gaps, slow for turns, yield at
 * intersections, pick random exits, and get knocked around when hit by racers.
 * Rendering uses four InstancedMeshes (bodies, glass/wheels, headlights,
 * taillights) so 40 cars cost 4 draw calls.
 */
(function () {
  const LANE_W = 3.6;
  const PALETTE = [0xd8dde3, 0x2a2f36, 0x8d97a3, 0xb3352c, 0x2854a8, 0x3b7d3a, 0xe0b23a, 0x6b3f9a, 0x1b1d22, 0xc9c1b5, 0xf27f2b, 0x7a1f2b];

  const DENSITY = { off: 0, light: 14, normal: 30, heavy: 46 };

  class TrafficCar {
    constructor(id) {
      this.id = id;
      this.position = new THREE.Vector3();
      this.velocity = new THREE.Vector3();
      this.yaw = 0;
      this.yawRate = 0;
      this.speed = 0;
      this.halfWidth = 0.9;
      this.halfLength = 2.2;
      this.mass = 1350;
      this.edge = null;
      this.dir = 1;
      this.lane = null;
      this.laneIndex = 0;
      this.s = 0;
      this.targetSpeed = 12;
      this.personality = 1;
      this.state = 'drive';      // drive | knocked | waiting
      this.knockTimer = 0;
      this.waitTimer = 0;
      this.brakeLight = false;
      this.colorIndex = 0;
      this.nextEdge = null;
      this.turnFactor = 1;
      this.active = false;
    }

    onVehicleImpact(strength, other) {
      if (strength < 1.5) return;
      this.state = 'knocked';
      this.knockTimer = Math.min(3.5, 0.8 + strength * 0.12);
      this.brakeLight = true;
    }
  }

  class TrafficSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {RoadNetwork} network
     * @param {object} world  WorldBuilder (getGroundHeight, collision)
     * @param {string} density  off | light | normal | heavy
     */
    constructor(scene, network, world, density = 'normal') {
      this.scene = scene;
      this.network = network;
      this.world = world;
      this.group = new THREE.Group();
      this.group.name = 'traffic';
      this.cars = [];
      this.maxCars = DENSITY[density] !== undefined ? DENSITY[density] : DENSITY.normal;
      this.spawnRadiusMin = 130;
      this.spawnRadiusMax = 260;
      this.despawnRadius = 330;
      this.spawnTimer = 0;
      this.rng = Math.random;
      this.enabled = this.maxCars > 0;
      this.time = 0;
      this._dummy = new THREE.Object3D();
      this._color = new THREE.Color();
      this._fwd = new THREE.Vector3();
      this.buildInstancedMeshes();
      this.scene.add(this.group);
    }

    setDensity(density) {
      this.maxCars = DENSITY[density] !== undefined ? DENSITY[density] : DENSITY.normal;
      this.enabled = this.maxCars > 0;
      if (!this.enabled) this.cars.forEach((c) => this.deactivate(c));
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    buildInstancedMeshes() {
      const N = 48;
      // Body: lower box + cabin (merged)
      const body = new THREE.BoxGeometry(1.8, 0.62, 4.3);
      body.translate(0, 0.42, 0);
      const cabin = new THREE.BoxGeometry(1.5, 0.5, 2.1);
      cabin.translate(0, 0.98, -0.25);
      const bodyGeo = TrafficSystem.merge([body, cabin]);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.42 });
      this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
      this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.bodyMesh.castShadow = false;
      this.bodyMesh.frustumCulled = false;

      // Wheels + dark trim
      const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheels = [];
      [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]].forEach(([x, z]) => {
        const g = wheelGeo.clone();
        g.translate(x, 0.33, z);
        wheels.push(g);
      });
      const glass = new THREE.BoxGeometry(1.52, 0.42, 2.0);
      glass.translate(0, 1.0, -0.25);
      const trimGeo = TrafficSystem.merge([...wheels, glass]);
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.3, roughness: 0.75 });
      this.trimMesh = new THREE.InstancedMesh(trimGeo, trimMat, N);
      this.trimMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.trimMesh.frustumCulled = false;

      // Headlights (front, +Z) & taillights (rear, -Z)
      const hl = TrafficSystem.merge([
        TrafficSystem.box(0.36, 0.14, 0.06, -0.62, 0.55, 2.16),
        TrafficSystem.box(0.36, 0.14, 0.06, 0.62, 0.55, 2.16)
      ]);
      const tl = TrafficSystem.merge([
        TrafficSystem.box(0.42, 0.12, 0.06, -0.6, 0.6, -2.16),
        TrafficSystem.box(0.42, 0.12, 0.06, 0.6, 0.6, -2.16)
      ]);
      this.headMesh = new THREE.InstancedMesh(hl, new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), N);
      this.tailMesh = new THREE.InstancedMesh(tl, new THREE.MeshBasicMaterial({ color: 0xff2a1a }), N);
      this.headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.tailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.headMesh.frustumCulled = false;
      this.tailMesh.frustumCulled = false;

      this.capacity = N;
      for (let i = 0; i < N; i++) {
        const c = new TrafficCar(i);
        c.colorIndex = i % PALETTE.length;
        this.cars.push(c);
        this.bodyMesh.setColorAt(i, this._color.setHex(PALETTE[c.colorIndex]));
        this.writeInstance(c, false);
      }
      if (this.bodyMesh.instanceColor) this.bodyMesh.instanceColor.needsUpdate = true;
      this.group.add(this.bodyMesh, this.trimMesh, this.headMesh, this.tailMesh);
    }

    static box(w, h, d, x, y, z) {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      return g;
    }

    static merge(geos) {
      // Minimal merge for non-indexed / indexed BoxGeometry & CylinderGeometry
      const positions = []; const normals = []; const uvs = [];
      geos.forEach((g) => {
        const ng = g.index ? g.toNonIndexed() : g;
        positions.push(...ng.attributes.position.array);
        normals.push(...ng.attributes.normal.array);
        if (ng.attributes.uv) uvs.push(...ng.attributes.uv.array);
      });
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      if (uvs.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return out;
    }

    writeInstance(car, visible) {
      const d = this._dummy;
      if (!visible) {
        d.position.set(0, -50, 0);
        d.rotation.set(0, 0, 0);
        d.scale.set(0.001, 0.001, 0.001);
      } else {
        d.position.copy(car.position);
        d.rotation.set(0, car.yaw, 0);
        d.scale.set(1, 1, 1);
      }
      d.updateMatrix();
      this.bodyMesh.setMatrixAt(car.id, d.matrix);
      this.trimMesh.setMatrixAt(car.id, d.matrix);
      this.headMesh.setMatrixAt(car.id, d.matrix);
      // brake lights: scale tail box slightly bigger to brighten (cheap trick)
      if (visible && car.brakeLight) d.scale.set(1.25, 1.6, 1);
      d.updateMatrix();
      this.tailMesh.setMatrixAt(car.id, d.matrix);
    }

    // ── Spawning ──────────────────────────────────────────────────────────
    activeCount() { return this.cars.reduce((n, c) => n + (c.active ? 1 : 0), 0); }

    deactivate(car) {
      car.active = false;
      car.state = 'drive';
      this.writeInstance(car, false);
    }

    randomLanePoint(px, pz, avoid = []) {
      const edges = this.network.edges;
      for (let attempt = 0; attempt < 24; attempt++) {
        const e = edges[Math.floor(this.rng() * edges.length)];
        if (!e || e.noTraffic || e.length < 30) continue;
        const dir = e.oneWay ? 1 : (this.rng() < 0.5 ? 1 : -1);
        const lanes = dir === 1 ? e.lanesFwd : e.lanesBack;
        if (!lanes || lanes.length === 0) continue;
        const laneIndex = Math.floor(this.rng() * lanes.length);
        const lane = lanes[laneIndex];
        const s = 8 + this.rng() * Math.max(1, lane.length2 - 16);
        const p = window.RoadNetwork.sampleLane(lane, s);
        if (!p) continue;
        const d = Math.hypot(p.x - px, p.z - pz);
        if (d < this.spawnRadiusMin || d > this.spawnRadiusMax) continue;
        let blocked = false;
        for (let i = 0; i < avoid.length; i++) {
          const a = avoid[i];
          if (Math.hypot(a.x - p.x, a.z - p.z) < (a.r || 40)) { blocked = true; break; }
        }
        if (blocked) continue;
        // keep spacing from other traffic
        let tooClose = false;
        for (let i = 0; i < this.cars.length; i++) {
          const c = this.cars[i];
          if (c.active && Math.hypot(c.position.x - p.x, c.position.z - p.z) < 14) { tooClose = true; break; }
        }
        if (tooClose) continue;
        return { edge: e, dir, lane, laneIndex, s, p };
      }
      return null;
    }

    spawnOne(px, pz, avoid) {
      const car = this.cars.find((c) => !c.active);
      if (!car) return null;
      const lp = this.randomLanePoint(px, pz, avoid);
      if (!lp) return null;
      car.active = true;
      car.state = 'drive';
      car.edge = lp.edge; car.dir = lp.dir; car.lane = lp.lane; car.laneIndex = lp.laneIndex; car.s = lp.s;
      car.personality = 0.82 + this.rng() * 0.3;
      car.targetSpeed = lp.edge.speedLimit * car.personality;
      car.speed = car.targetSpeed * 0.8;
      car.position.set(lp.p.x, this.groundAt(lp.p.x, lp.p.z), lp.p.z);
      car.yaw = Math.atan2(lp.p.dx, lp.p.dz);
      car.velocity.set(lp.p.dx * car.speed, 0, lp.p.dz * car.speed);
      car.nextEdge = null;
      car.waitTimer = 0;
      car.brakeLight = false;
      return car;
    }

    groundAt(x, z) {
      return this.world && this.world.getGroundHeight ? this.world.getGroundHeight(x, z) : 0;
    }

    /** Remove traffic within radius of a point (used for event grids). */
    clearArea(x, z, radius) {
      this.cars.forEach((c) => {
        if (c.active && Math.hypot(c.position.x - x, c.position.z - z) < radius) this.deactivate(c);
      });
    }

    // ── Simulation ────────────────────────────────────────────────────────
    /**
     * @param {number} dt
     * @param {object} player  physics body (position, velocity, speed, yaw)
     * @param {Array} racers   other dynamic bodies to keep gaps from
     * @param {Array} avoidZones [{x,z,r}] no-spawn zones
     */
    update(dt, player, racers = [], avoidZones = []) {
      if (!this.enabled) return;
      this.time += dt;
      const px = player.position.x; const pz = player.position.z;

      // spawn / despawn budget
      this.spawnTimer -= dt;
      const active = this.activeCount();
      if (active < this.maxCars && this.spawnTimer <= 0) {
        const n = Math.min(4, this.maxCars - active);
        for (let i = 0; i < n; i++) this.spawnOne(px, pz, avoidZones);
        this.spawnTimer = 0.25;
      }

      const others = racers.length ? [player, ...racers] : [player];
      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        if (!car.active) continue;
        const dToPlayer = Math.hypot(car.position.x - px, car.position.z - pz);
        if (dToPlayer > this.despawnRadius) { this.deactivate(car); continue; }
        if (car.state === 'knocked') this.stepKnocked(car, dt);
        else this.stepDrive(car, dt, others);
        this.writeInstance(car, true);
      }
      this.bodyMesh.instanceMatrix.needsUpdate = true;
      this.trimMesh.instanceMatrix.needsUpdate = true;
      this.headMesh.instanceMatrix.needsUpdate = true;
      this.tailMesh.instanceMatrix.needsUpdate = true;
    }

    stepDrive(car, dt, others) {
      const lane = car.lane;
      const remaining = lane.length2 - car.s;

      // choose next edge ahead of time so we can slow for turns
      if (!car.nextEdge && remaining < 60) {
        const endNode = car.dir === 1 ? car.edge.b : car.edge.a;
        const here = window.RoadNetwork.sampleLane(lane, lane.length2);
        const arriving = { x: here.dx, z: here.dz };
        car.nextEdge = this.network.nextEdgeAtNode(endNode, car.edge, arriving, this.rng);
        const info = window.RoadNetwork.lanesFrom(car.nextEdge, endNode);
        if (info) {
          const l0 = info.lanes[Math.min(car.laneIndex, info.lanes.length - 1)];
          const align = l0[0].dx * here.dx + l0[0].dz * here.dz;
          car.turnFactor = align > 0.9 ? 1.0 : (align > 0 ? 0.55 : 0.4);
        } else car.turnFactor = 0.5;
      }

      // desired speed: limit, turn slow-down, gap keeping
      let desired = car.targetSpeed;
      if (car.nextEdge && remaining < 45) {
        const turnSpeed = car.targetSpeed * car.turnFactor;
        desired = Math.min(desired, Math.max(turnSpeed, Math.sqrt(turnSpeed * turnSpeed + 2 * 4.0 * Math.max(0, remaining - 6))));
      }

      // gap keeping vs. everything ahead in our corridor
      const fx = Math.sin(car.yaw); const fz = Math.cos(car.yaw);
      let gap = Infinity; let leadSpeed = 0;
      const consider = (ox, oz, ovx, ovz, halfLen) => {
        const dx = ox - car.position.x; const dz = oz - car.position.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 0 || ahead > 60) return;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (lateral > 2.4) return;
        const g = ahead - halfLen - car.halfLength;
        if (g < gap) { gap = g; leadSpeed = ovx * fx + ovz * fz; }
      };
      for (let i = 0; i < this.cars.length; i++) {
        const o = this.cars[i];
        if (o === car || !o.active) continue;
        if (Math.abs(o.position.x - car.position.x) > 62 || Math.abs(o.position.z - car.position.z) > 62) continue;
        consider(o.position.x, o.position.z, o.velocity.x, o.velocity.z, o.halfLength);
      }
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (!o || !o.position) continue;
        consider(o.position.x, o.position.z, o.velocity ? o.velocity.x : 0, o.velocity ? o.velocity.z : 0, o.halfLength || 2.2);
      }
      if (gap < Infinity) {
        const safe = 5.0 + car.speed * 1.1;
        if (gap < safe) {
          const ratio = THREE.MathUtils.clamp(gap / safe, 0, 1);
          desired = Math.min(desired, Math.max(0, leadSpeed) * ratio + car.targetSpeed * ratio * 0.3);
          if (gap < 2.0) desired = 0;
        }
      }

      // intersection yield: another traffic car inside the node coming from a different edge
      if (remaining < 14 && car.nextEdge) {
        const endNode = car.dir === 1 ? car.edge.b : car.edge.a;
        let occupied = false;
        for (let i = 0; i < this.cars.length && !occupied; i++) {
          const o = this.cars[i];
          if (o === car || !o.active || o.state !== 'drive') continue;
          if (o.edge === car.edge && o.dir === car.dir) continue;
          const d = Math.hypot(o.position.x - endNode.x, o.position.z - endNode.z);
          if (d < endNode.radius * 0.9 && o.speed > 1.0) occupied = true;
          // cross traffic about to enter
          const oRemaining = o.lane ? o.lane.length2 - o.s : Infinity;
          if (!occupied && oRemaining < 10 && oRemaining < remaining && (o.dir === 1 ? o.edge.b : o.edge.a) === endNode && o.state === 'drive') occupied = true;
        }
        if (occupied && car.waitTimer < 4.0) {
          car.waitTimer += dt;
          desired = Math.min(desired, remaining > 7 ? 4.0 : 0);
        }
      } else if (remaining > 20) {
        car.waitTimer = 0;
      }

      // speed control
      const accel = desired > car.speed ? 3.2 : -6.5;
      const prev = car.speed;
      car.speed += accel * dt;
      if ((accel > 0 && car.speed > desired) || (accel < 0 && car.speed < desired)) car.speed = desired;
      car.speed = Math.max(0, car.speed);
      car.brakeLight = car.speed < prev - 0.02 || car.speed < 0.3;

      // advance along lane
      car.s += car.speed * dt;
      if (car.s >= lane.length2) {
        this.advanceToNextEdge(car);
        if (!car.active) return;
      }
      const p = window.RoadNetwork.sampleLane(car.lane, car.s);
      if (!p) { this.deactivate(car); return; }
      const targetYaw = Math.atan2(p.dx, p.dz);
      let dy = targetYaw - car.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      car.yaw += dy * Math.min(1, 8 * dt);
      const y = this.groundAt(p.x, p.z);
      car.velocity.set((p.x - car.position.x) / dt, 0, (p.z - car.position.z) / dt);
      if (car.velocity.lengthSq() > 40 * 40) car.velocity.setLength(car.speed);
      car.position.set(p.x, y, p.z);
    }

    advanceToNextEdge(car) {
      const endNode = car.dir === 1 ? car.edge.b : car.edge.a;
      const next = car.nextEdge || this.network.nextEdgeAtNode(endNode, car.edge, { x: Math.sin(car.yaw), z: Math.cos(car.yaw) }, this.rng);
      const info = window.RoadNetwork.lanesFrom(next, endNode);
      if (!info) { this.deactivate(car); return; }
      const overshoot = car.s - car.lane.length2;
      car.edge = next;
      car.dir = info.dir;
      car.laneIndex = Math.min(car.laneIndex, info.lanes.length - 1);
      car.lane = info.lanes[car.laneIndex];
      car.s = Math.max(0, overshoot);
      car.nextEdge = null;
      car.turnFactor = 1;
      car.targetSpeed = next.speedLimit * car.personality;
      car.waitTimer = 0;
    }

    stepKnocked(car, dt) {
      car.knockTimer -= dt;
      // free-body slide with friction, then re-attach to the nearest lane
      const speed = Math.hypot(car.velocity.x, car.velocity.z);
      const decel = 7.5 * dt;
      if (speed > decel) {
        const k = (speed - decel) / speed;
        car.velocity.x *= k; car.velocity.z *= k;
      } else {
        car.velocity.set(0, 0, 0);
      }
      car.position.x += car.velocity.x * dt;
      car.position.z += car.velocity.z * dt;
      car.yaw += car.yawRate * dt;
      car.yawRate *= Math.max(0, 1 - 2.5 * dt);
      car.speed = Math.hypot(car.velocity.x, car.velocity.z);

      // walls
      if (this.world && this.world.collision) {
        const res = this.world.collision.resolveCircle(car.position.x, car.position.z, car.halfWidth, car.position.y + 0.5);
        if (res) {
          car.position.x += res.nx * res.depth; car.position.z += res.nz * res.depth;
          const vn = car.velocity.x * res.nx + car.velocity.z * res.nz;
          if (vn < 0) { car.velocity.x -= res.nx * vn * 1.3; car.velocity.z -= res.nz * vn * 1.3; }
        }
      }
      car.position.y = this.groundAt(car.position.x, car.position.z);

      if (car.knockTimer <= 0 && car.speed < 2.5) {
        // re-attach
        const near = this.network.nearestRoadPoint(car.position.x, car.position.z, 30);
        if (!near || near.edge.noTraffic) { this.deactivate(car); return; }
        const e = near.edge;
        const fx = Math.sin(car.yaw); const fz = Math.cos(car.yaw);
        const along = fx * near.dx + fz * near.dz;
        const dir = e.oneWay ? 1 : (along >= 0 ? 1 : -1);
        const lanes = dir === 1 ? e.lanesFwd : e.lanesBack;
        if (!lanes || !lanes.length) { this.deactivate(car); return; }
        // nearest lane
        let best = null; let bestD = Infinity; let bestIdx = 0;
        lanes.forEach((lane, idx) => {
          const sGuess = near.s * (dir === 1 ? 1 : -1) + (dir === 1 ? 0 : lane.length2);
          const p = window.RoadNetwork.sampleLane(lane, THREE.MathUtils.clamp(sGuess, 0, lane.length2));
          const d = Math.hypot(p.x - car.position.x, p.z - car.position.z);
          if (d < bestD) { bestD = d; best = lane; bestIdx = idx; }
        });
        car.edge = e; car.dir = dir; car.lane = best; car.laneIndex = bestIdx;
        car.s = THREE.MathUtils.clamp(dir === 1 ? near.s : best.length2 - near.s, 0, best.length2);
        car.state = 'drive';
        car.speed = 0;
        car.nextEdge = null;
        car.targetSpeed = e.speedLimit * car.personality;
        car.velocity.set(0, 0, 0);
        car.yawRate = 0;
      }
    }

    /** Active traffic bodies near a point (for collision tests). */
    nearby(x, z, radius, out = []) {
      out.length = 0;
      const r2 = radius * radius;
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (!c.active) continue;
        const dx = c.position.x - x; const dz = c.position.z - z;
        if (dx * dx + dz * dz <= r2) out.push(c);
      }
      return out;
    }

    dispose() {
      this.scene.remove(this.group);
      [this.bodyMesh, this.trimMesh, this.headMesh, this.tailMesh].forEach((m) => {
        if (m) { m.geometry.dispose(); m.material.dispose(); }
      });
    }
  }

  TrafficSystem.DENSITY = DENSITY;
  window.TrafficSystem = TrafficSystem;
})();
