/**
 * FreeRacer - Open-world race AI.
 * ---------------------------------------------------------------------------
 * Each rival drives a FreeVehiclePhysics body with a route-following driver:
 *   - pure-pursuit steering on a smoothed route polyline with lateral offset
 *   - curvature-aware speed planning (brake before corners, not in them)
 *   - traffic/rival avoidance via corridor checks and lane-offset shifting
 *   - nitro on straights, mild rubber-banding, stuck recovery
 * Progress along the route drives race positions and checkpoint counting.
 */
(function () {
  class RouteFollower {
    constructor(route) {
      this.route = route; // { points:[{x,z}], cum:[], length }
      this.s = 0;
      this.index = 0;
    }

    /** Update progress with a windowed nearest-point search (keeps s monotonic). */
    track(x, z, window = 90, allowBack = 25) {
      const pts = this.route.points;
      const cum = this.route.cum;
      if (pts.length < 2) return 0;
      let bestD = Infinity; let bestS = this.s; let bestI = this.index;
      const sMin = this.s - allowBack; const sMax = this.s + window;
      let i0 = this.index;
      while (i0 > 0 && cum[i0] > sMin) i0--;
      for (let i = i0; i < pts.length - 1 && cum[i] <= sMax; i++) {
        const ax = pts[i].x; const az = pts[i].z; const bx = pts[i + 1].x; const bz = pts[i + 1].z;
        const dx = bx - ax; const dz = bz - az;
        const len2 = dx * dx + dz * dz || 1;
        let t = ((x - ax) * dx + (z - az) * dz) / len2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const px = ax + dx * t; const pz = az + dz * t;
        const d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bestD) { bestD = d; bestS = cum[i] + (cum[i + 1] - cum[i]) * t; bestI = i; }
      }
      this.s = bestS;
      this.index = bestI;
      this.lateralDist = Math.sqrt(bestD);
      return this.s;
    }

    pointAt(s) {
      const pts = this.route.points; const cum = this.route.cum;
      const L = this.route.length;
      if (s <= 0) return { x: pts[0].x, z: pts[0].z, dx: pts[1].x - pts[0].x, dz: pts[1].z - pts[0].z };
      if (s >= L) { const n = pts.length - 1; return { x: pts[n].x, z: pts[n].z, dx: pts[n].x - pts[n - 1].x, dz: pts[n].z - pts[n - 1].z }; }
      let lo = 0; let hi = pts.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
      const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
      return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, z: pts[lo].z + (pts[hi].z - pts[lo].z) * t, dx: pts[hi].x - pts[lo].x, dz: pts[hi].z - pts[lo].z };
    }

    /** Heading change (radians) between s and s+d — a cheap curvature proxy. */
    turnAhead(s, d) {
      const a = this.pointAt(s); const b = this.pointAt(s + d);
      const ha = Math.atan2(a.dx, a.dz); const hb = Math.atan2(b.dx, b.dz);
      let diff = hb - ha;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      return diff;
    }
  }

  class OpenWorldAIRacer {
    /**
     * @param {object} opts { name, carId, color, skill (0.6–1), world, route, laps, laneOffset }
     */
    constructor(opts) {
      this.name = opts.name || 'Rival';
      this.carId = opts.carId;
      this.skill = THREE.MathUtils.clamp(opts.skill || 0.8, 0.5, 1.0);
      this.world = opts.world;
      const cfg = window.getCarById(this.carId) || {};
      this.carModel = new window.CarModel(opts.color !== undefined ? opts.color : (cfg.colorHex || 0xff4400), false, this.carId, opts.index || 1);
      this.physics = new window.FreeVehiclePhysics(this.carModel, this.world, false, cfg);
      this.physics.setAssistLevel('standard');
      this.physics.onImpact = () => {};
      this.follower = new RouteFollower(opts.route);
      this.laps = opts.laps || 1;
      this.lapsDone = 0;
      this.lapProgressS = 0;
      this.progress = 0;           // total metres of route completed (laps * length + s)
      this.baseOffset = opts.laneOffset || 0;
      this.offset = this.baseOffset;
      this.offsetTimer = 0;
      this.finished = false;
      this.finishTime = null;
      this.checkpointIndex = 0;
      this.stuckTimer = 0;
      this.reverseTimer = 0;
      this.reverseAttempts = 0;
      this.nitroTimer = 0;
      this.inputs = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
      // personality
      this.aLat = 9.5 + this.skill * 6.5;         // lateral accel budget (m/s²)
      this.aBrake = 10 + this.skill * 6;
      this.topSpeedScale = 0.86 + this.skill * 0.14;
      this.lookBase = 9 + (1 - this.skill) * 3;
      this.avoidDir = 1;
      this.avoidTimer = 0;
      this._scratch = new THREE.Vector3();
    }

    placeOnGrid(x, z, yaw) {
      this.physics.setPose(x, z, yaw);
      this.follower.s = 0; this.follower.index = 0;
      this.follower.track(x, z, 200, 200);
      this.lapProgressS = this.follower.s;
      this.progress = this.follower.s;
      this.finished = false;
      this.finishTime = null;
      this.lapsDone = 0;
      this.checkpointIndex = 0;
    }

    get position() { return this.physics.position; }
    get velocity() { return this.physics.velocity; }

    /**
     * @param {number} dt
     * @param {object} ctx { player, rivals, traffic (array of bodies), raceTime, playerProgress, routeLength }
     */
    update(dt, ctx) {
      const p = this.physics;
      if (this.finished) {
        // cruise gently after the finish line
        p.update(dt, { throttle: p.speed > 12 ? 0 : 0.25, brake: p.speed > 15 ? 0.4 : 0, steer: this.steerToRoute(dt, 12), handbrake: false, nitro: false });
        return;
      }
      const f = this.follower;
      const prevS = f.s;
      f.track(p.position.x, p.position.z);
      const L = f.route.length;
      // lap wrap for circuits: route ends where it starts
      if (this.laps > 1 && prevS > L * 0.9 && f.s < L * 0.1 + 1) {
        this.lapsDone++;
      } else if (this.laps > 1 && f.s >= L - 3 && prevS < L - 3) {
        // reached the end; wrap to start
        this.lapsDone++;
        f.s = 0; f.index = 0;
      }
      this.progress = this.lapsDone * L + f.s;

      // ── speed planning ──
      const speed = Math.max(p.speed, 0);
      const look1 = THREE.MathUtils.clamp(speed * 0.9, 12, 40);
      const look2 = THREE.MathUtils.clamp(speed * 2.0, 25, 90);
      const turnNear = Math.abs(f.turnAhead(f.s, look1));
      const turnFar = Math.abs(f.turnAhead(f.s + look1, look2 - look1));
      // corner speed from heading change over arc length: κ ≈ Δθ / d
      const kNear = turnNear / look1;
      const kFar = turnFar / (look2 - look1);
      const vNear = Math.sqrt(this.aLat / Math.max(kNear, 1e-3));
      const vFar = Math.sqrt(this.aLat / Math.max(kFar, 1e-3));
      let target = Math.min(p.maxSpeed * this.topSpeedScale, vNear, Math.sqrt(vFar * vFar + 2 * this.aBrake * look1));
      // finish approach (sprints): no need to slow
      // rubber band: behind the player → a bit braver, far ahead → relax
      if (ctx && typeof ctx.playerProgress === 'number') {
        const gap = ctx.playerProgress - this.progress; // >0: player ahead
        const band = THREE.MathUtils.clamp(gap / 250, -1, 1);
        target *= 1 + band * 0.07;
      }

      // ── avoidance: traffic & rivals in our corridor ──
      let blockAhead = Infinity; let blockSpeed = 0; let blockSide = 0;
      const fx = Math.sin(p.yaw); const fz = Math.cos(p.yaw);
      const check = (o) => {
        if (!o || o === this || o === p || !o.position) return;
        const dx = o.position.x - p.position.x; const dz = o.position.z - p.position.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 1 || ahead > 45) return;
        const lat = dx * fz - dz * fx; // + = left (local +X)
        if (Math.abs(lat) > 3.2) return;
        if (ahead < blockAhead) {
          blockAhead = ahead;
          blockSpeed = o.velocity ? (o.velocity.x * fx + o.velocity.z * fz) : 0;
          blockSide = lat;
        }
      };
      if (ctx) {
        if (ctx.traffic) for (let i = 0; i < ctx.traffic.length; i++) check(ctx.traffic[i]);
        if (ctx.rivals) for (let i = 0; i < ctx.rivals.length; i++) check(ctx.rivals[i].physics || ctx.rivals[i]);
        if (ctx.player) check(ctx.player);
      }
      if (blockAhead < Infinity) {
        const closing = speed - blockSpeed;
        const ttc = closing > 0.5 ? blockAhead / closing : Infinity;
        if (this.avoidTimer <= 0) {
          this.avoidDir = blockSide > 0 ? -1 : 1; // go around the free side
          this.avoidTimer = 1.6;
        }
        if (ttc < 1.4 || blockAhead < 7) target = Math.min(target, Math.max(blockSpeed - 1, 0));
        else if (ttc < 2.8) target = Math.min(target, blockSpeed + 3);
      }
      if (this.avoidTimer > 0) {
        this.avoidTimer -= dt;
        this.offset = THREE.MathUtils.damp(this.offset, this.baseOffset + this.avoidDir * 3.4, 4, dt);
      } else {
        this.offset = THREE.MathUtils.damp(this.offset, this.baseOffset, 2, dt);
      }

      // ── throttle / brake ──
      const err = target - speed;
      let throttle = 0; let brake = 0;
      if (err > 0.5) throttle = THREE.MathUtils.clamp(err * 0.35 + 0.35, 0, 1);
      else if (err < -1.5) brake = THREE.MathUtils.clamp(-err * 0.18, 0.15, 1);
      else throttle = 0.35;

      // ── steering ──
      const lookSteer = THREE.MathUtils.clamp(this.lookBase + speed * 0.45, 8, 38);
      let steer = this.steerToRoute(dt, lookSteer);
      // counter-steer when sliding
      if (Math.abs(p.driftAngle) > 0.12) steer = THREE.MathUtils.clamp(steer - p.driftAngle * 1.1, -1, 1);
      // less throttle mid-slide / at high steer
      if (Math.abs(steer) > 0.6 && speed > 18) throttle *= 0.7;

      // ── nitro on straights when behind ──
      this.nitroTimer -= dt;
      let nitro = false;
      const straight = turnNear < 0.12 && turnFar < 0.5;
      const behind = ctx && typeof ctx.playerProgress === 'number' ? ctx.playerProgress - this.progress > 30 : false;
      if (straight && speed > 15 && speed < p.maxSpeed * 0.85 && (behind || this.nitroTimer < -6) && p.nitroFuel > 30) {
        nitro = true;
        if (this.nitroTimer < -6) this.nitroTimer = 2.0;
      }

      // ── stuck recovery ──
      if (speed < 1.0 && throttle > 0.3 && this.reverseTimer <= 0) this.stuckTimer += dt; else if (speed > 3) this.stuckTimer = 0;
      if (this.stuckTimer > 1.6) {
        this.stuckTimer = 0;
        this.reverseTimer = 1.1;
        this.reverseAttempts++;
        if (this.reverseAttempts > 3) {
          // teleport back onto the route
          const pt = f.pointAt(Math.max(0, f.s - 5));
          p.setPose(pt.x, pt.z, Math.atan2(pt.dx, pt.dz));
          p.ghostTimer = 2.0;
          this.reverseAttempts = 0;
          this.reverseTimer = 0;
        }
      }
      if (this.reverseTimer > 0) {
        this.reverseTimer -= dt;
        throttle = 0; brake = 1; steer = -steer; nitro = false;
      }
      if (speed > 8) this.reverseAttempts = 0;

      this.inputs.throttle = throttle;
      this.inputs.brake = brake;
      this.inputs.steer = steer;
      this.inputs.handbrake = false;
      this.inputs.nitro = nitro;
      p.update(dt, this.inputs);
    }

    steerToRoute(dt, lookahead) {
      const p = this.physics;
      const f = this.follower;
      const tgt = f.pointAt(f.s + lookahead);
      // apply lateral offset (route right-hand normal)
      const len = Math.hypot(tgt.dx, tgt.dz) || 1;
      const rx = -tgt.dz / len; const rz = tgt.dx / len; // right of travel (matches RoadNetwork.rightOf)
      const tx = tgt.x + rx * this.offset; const tz = tgt.z + rz * this.offset; // offset > 0 = to the right
      const dx = tx - p.position.x; const dz = tz - p.position.z;
      const desired = Math.atan2(dx, dz);
      let diff = desired - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      // steer input: + = right. Heading diff > 0 means target is to the left (yaw increases to the left)
      const gain = 1.9;
      return THREE.MathUtils.clamp(-diff * gain - p.yawRate * 0.12, -1, 1);
    }

    setFinished(time) {
      this.finished = true;
      this.finishTime = time;
    }

    dispose(scene) {
      if (scene && this.carModel && this.carModel.group) scene.remove(this.carModel.group);
    }
  }

  window.RouteFollower = RouteFollower;
  window.OpenWorldAIRacer = OpenWorldAIRacer;
})();
