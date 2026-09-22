/**
 * FreeRacer - Open-world event system.
 * ---------------------------------------------------------------------------
 * Turns data-driven event definitions into playable races inside the district:
 *   - start markers in the world (glowing pads, locked/unlocked by reputation)
 *   - route expansion → racing polyline → checkpoint gates at intersections
 *   - countdown, grid placement, rivals (OpenWorldAIRacer), lap logic
 *   - live ranking, checkpoint HUD data, respawn anchors
 *   - results, medals, credit + reputation rewards, personal bests (SaveManager)
 *
 * States: idle → countdown → running → results → idle
 */
(function () {
  const COLORS = {
    next: 0x00f0ff,
    later: 0x1f4f8a,
    finish: 0xff3cac,
    marker: 0x00f0ff,
    markerLocked: 0x8a2033,
    markerTT: 0xffc93c,
    garage: 0x7dff6a
  };

  function makeTextSprite(text, color = '#00f0ff', sub = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 160);
      ctx.font = 'bold 54px Rajdhani, Orbitron, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color; ctx.shadowBlur = 18;
      ctx.fillStyle = color;
      ctx.fillText(text.toUpperCase(), 256, sub ? 58 : 80);
      if (sub) {
        ctx.font = '30px Rajdhani, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 6;
        ctx.fillText(sub, 256, 116);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(16, 5, 1);
    return sprite;
  }

  class EventSystem {
    /**
     * @param {OpenWorldManager} manager
     * @param {Array} defs  event definitions
     */
    constructor(manager, defs) {
      this.m = manager;
      this.scene = manager.scene;
      this.network = manager.network;
      this.defs = defs || [];
      this.events = [];
      this.state = 'idle';
      this.active = null;          // running event instance
      this.rivals = [];
      this.raceTime = 0;
      this.countdownTimer = 0;
      this.countdownStep = -1;
      this.markerGroup = new THREE.Group();
      this.markerGroup.name = 'eventMarkers';
      this.gateGroup = new THREE.Group();
      this.gateGroup.name = 'eventGates';
      this.scene.add(this.markerGroup, this.gateGroup);
      this.nearMarker = null;
      this.player = null;
      this.playerFollower = null;
      this.playerLap = 0;
      this.playerCheckpoint = 0;
      this.playerPosition = 1;
      this.offRouteTimer = 0;
      this.wrongWay = false;
      this.lastResult = null;
      this.pulse = 0;
      this.buildEvents();
      this.buildMarkers();
    }

    // ── Build ─────────────────────────────────────────────────────────────
    buildEvents() {
      this.defs.forEach((def) => {
        const route = this.network.buildRoutePolyline(def.route, 0);
        if (!route || route.points.length < 2) { console.warn('[EventSystem] invalid route for', def.id); return; }
        const isCircuit = def.type === 'circuit';
        const laps = isCircuit ? (def.laps || 2) : 1;
        // expanded node list for checkpoint placement
        const nodes = [];
        for (let i = 0; i < def.route.length - 1; i++) {
          const path = this.network.route(def.route[i], def.route[i + 1]);
          if (!path) continue;
          path.forEach((step, j) => { if (!(i > 0 && j === 0)) nodes.push(step.node); });
        }
        const follower = new window.RouteFollower(route);
        const checkpoints = [];
        nodes.forEach((node, idx) => {
          if (idx === 0) return;
          // nearest polyline distance to the node
          let bestS = 0; let bestD = Infinity;
          for (let i = 0; i < route.points.length; i++) {
            const p = route.points[i];
            const d = (p.x - node.x) ** 2 + (p.z - node.z) ** 2;
            if (d < bestD) { bestD = d; bestS = route.cum[i]; }
          }
          if (bestD > 40 * 40) return;
          if (checkpoints.length && bestS - checkpoints[checkpoints.length - 1].s < 70) checkpoints.pop();
          const near = this.network.nearestRoadPoint(node.x, node.z, 40);
          const pt = follower.pointAt(bestS);
          const len = Math.hypot(pt.dx, pt.dz) || 1;
          checkpoints.push({
            s: bestS,
            x: node.x, z: node.z,            // gate centred on the intersection
            dx: pt.dx / len, dz: pt.dz / len,
            halfWidth: near ? Math.max(near.edge.halfWidth, 8) + 1.5 : 10,
            isFinish: false
          });
        });
        // final checkpoint = finish line at the route end (sprint/TT) or start line (circuit)
        const endPt = follower.pointAt(route.length);
        const endLen = Math.hypot(endPt.dx, endPt.dz) || 1;
        const endNear = this.network.nearestRoadPoint(endPt.x, endPt.z, 40);
        if (isCircuit) {
          // circuit: the last node equals the first; keep the loop's start gate as finish
          const last = checkpoints[checkpoints.length - 1];
          if (last && route.length - last.s < 70) checkpoints.pop();
          checkpoints.push({ s: route.length - 0.5, x: endPt.x - endPt.dx / endLen * 12, z: endPt.z - endPt.dz / endLen * 12, dx: endPt.dx / endLen, dz: endPt.dz / endLen, halfWidth: endNear ? endNear.edge.halfWidth + 1.5 : 10, isFinish: true });
        } else {
          const last = checkpoints[checkpoints.length - 1];
          if (last && route.length - last.s < 70) checkpoints.pop();
          checkpoints.push({ s: route.length - 0.5, x: endPt.x, z: endPt.z, dx: endPt.dx / endLen, dz: endPt.dz / endLen, halfWidth: endNear ? endNear.edge.halfWidth + 1.5 : 10, isFinish: true });
        }
        const startPt = follower.pointAt(14);
        const startLen = Math.hypot(startPt.dx, startPt.dz) || 1;
        const totalLength = route.length * laps;
        let medalTimes = null;
        if (def.type === 'timetrial') {
          const ms = def.medalSpeeds || { gold: 25, silver: 20, bronze: 15 };
          medalTimes = { gold: route.length / ms.gold, silver: route.length / ms.silver, bronze: route.length / ms.bronze };
        }
        this.events.push({
          def, id: def.id, name: def.name, type: def.type, laps, route, checkpoints, totalLength, medalTimes,
          marker: { x: startPt.x, z: startPt.z, dx: startPt.dx / startLen, dz: startPt.dz / startLen, radius: 8.5 },
          follower
        });
      });
    }

    isUnlocked(ev) {
      const rep = window.SaveManager ? window.SaveManager.getReputation() : 0;
      return rep >= (ev.def.unlockRep || 0);
    }

    buildMarkers() {
      const ringGeo = new THREE.RingGeometry(5.2, 6.4, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const beamGeo = new THREE.CylinderGeometry(0.9, 2.2, 42, 14, 1, true);
      beamGeo.translate(0, 21, 0);
      this.events.forEach((ev) => {
        const g = new THREE.Group();
        g.position.set(ev.marker.x, 0.06, ev.marker.z);
        const unlocked = this.isUnlocked(ev);
        const color = unlocked ? (ev.type === 'timetrial' ? COLORS.markerTT : COLORS.marker) : COLORS.markerLocked;
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
        const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        const label = makeTextSprite(ev.name, unlocked ? '#' + color.toString(16).padStart(6, '0') : '#ff5f7a', unlocked ? EventSystem.typeLabel(ev) : `Locked · ${ev.def.unlockRep} REP`);
        label.position.set(0, 9.5, 0);
        g.add(ring, beam, label);
        g.userData.event = ev;
        ev.markerMesh = g;
        ev.markerRing = ring;
        ev.markerBeam = beam;
        ev.markerLabel = label;
        ev.unlocked = unlocked;
        this.markerGroup.add(g);
      });
    }

    refreshMarkerLocks() {
      this.events.forEach((ev) => {
        const unlocked = this.isUnlocked(ev);
        if (unlocked === ev.unlocked) return;
        ev.unlocked = unlocked;
        const color = unlocked ? (ev.type === 'timetrial' ? COLORS.markerTT : COLORS.marker) : COLORS.markerLocked;
        ev.markerRing.material.color.setHex(color);
        ev.markerBeam.material.color.setHex(color);
        const old = ev.markerLabel;
        const label = makeTextSprite(ev.name, unlocked ? '#' + color.toString(16).padStart(6, '0') : '#ff5f7a', unlocked ? EventSystem.typeLabel(ev) : `Locked · ${ev.def.unlockRep} REP`);
        label.position.copy(old.position);
        ev.markerMesh.remove(old);
        old.material.map.dispose(); old.material.dispose();
        ev.markerMesh.add(label);
        ev.markerLabel = label;
      });
    }

    static typeLabel(ev) {
      const km = (ev.totalLength / 1000).toFixed(1);
      if (ev.type === 'sprint') return `Sprint · ${km} km · ${ev.def.opponents} rivals`;
      if (ev.type === 'circuit') return `Circuit · ${ev.laps} laps · ${km} km`;
      if (ev.type === 'timetrial') return `Time Attack · ${km} km · solo`;
      return ev.type;
    }

    setMarkersVisible(v) { this.markerGroup.visible = v; }

    // ── Idle: marker proximity ───────────────────────────────────────────
    updateIdle(dt, player) {
      this.pulse += dt;
      const s = 1 + Math.sin(this.pulse * 3) * 0.06;
      let near = null;
      for (let i = 0; i < this.events.length; i++) {
        const ev = this.events[i];
        ev.markerRing.scale.set(s, 1, s);
        const d = Math.hypot(player.position.x - ev.marker.x, player.position.z - ev.marker.z);
        if (d < ev.marker.radius && (!near || d < near.d)) near = { ev, d };
      }
      this.nearMarker = near ? near.ev : null;
      return this.nearMarker;
    }

    // ── Start ─────────────────────────────────────────────────────────────
    begin(ev, player) {
      if (this.state !== 'idle') return false;
      if (!this.isUnlocked(ev)) return false;
      this.active = ev;
      this.player = player;
      this.playerFollower = new window.RouteFollower(ev.route);
      this.playerLap = 0;
      this.playerCheckpoint = 0;
      this.playerPosition = 1;
      this.raceTime = 0;
      this.offRouteTimer = 0;
      this.wrongWay = false;
      this.finishOrder = [];
      this.playerFinished = false;
      this.driftAtStart = player.driftScore || 0;
      this.collisionCount = 0;
      this.setMarkersVisible(false);

      // grid: player last, rivals ahead — staggered on the first straight
      const slots = ev.def.opponents + 1;
      const gridS = (i) => 34 + (slots - 1 - i) * 7.5; // i=0 → front
      const laneOff = (i) => (i % 2 === 0 ? 0 : -3.4);
      const poseAt = (s, off) => {
        const p = ev.follower.pointAt(s);
        const len = Math.hypot(p.dx, p.dz) || 1;
        const dx = p.dx / len; const dz = p.dz / len;
        const r = window.RoadNetwork.rightOf(dx, dz);
        return { x: p.x + r.x * off, z: p.z + r.z * off, yaw: Math.atan2(dx, dz) };
      };
      const playerSlot = slots - 1;
      const pp = poseAt(gridS(playerSlot), laneOff(playerSlot));
      player.setPose(pp.x, pp.z, pp.yaw);
      player.checkpointRespawn = { x: pp.x, z: pp.z, yaw: pp.yaw };
      player.nitroFuel = player.maxNitro;
      this.playerFollower.track(pp.x, pp.z, 200, 200);
      if (this.m.traffic) this.m.traffic.clearArea(pp.x, pp.z, 110);

      // rivals
      this.rivals = [];
      const cars = ev.def.rivalCars || ['veloce_v10_corsa', 'veloce_v8_gt', 'veloce_v12_stradale'];
      const names = ['Nova Reyes', 'Kade Marlow', 'Ines Vidal', 'Rook Tanaka', 'Sable Cruz'];
      const colors = [0x1a56e6, 0xd4af37, 0xe61a2b, 0x22c55e, 0xa855f7];
      for (let i = 0; i < ev.def.opponents; i++) {
        const ai = new window.OpenWorldAIRacer({
          name: names[i % names.length],
          carId: cars[i % cars.length],
          color: colors[i % colors.length],
          skill: THREE.MathUtils.clamp((ev.def.aiSkill || 0.8) + (i - 1) * 0.04, 0.55, 0.98),
          world: this.m.worldQuery,
          route: ev.route,
          laps: ev.laps,
          laneOffset: laneOff(i),
          index: i + 1
        });
        const pose = poseAt(gridS(i), laneOff(i));
        this.scene.add(ai.carModel.group);
        ai.placeOnGrid(pose.x, pose.z, pose.yaw);
        this.rivals.push(ai);
      }

      this.buildGates(ev);
      this.state = 'countdown';
      this.countdownTimer = 0;
      this.countdownStep = -1;
      if (window.SoundEngine) window.SoundEngine.setMusicIntensity('rush');
      return true;
    }

    buildGates(ev) {
      this.clearGates();
      const pillarGeo = new THREE.CylinderGeometry(0.42, 0.42, 7.5, 10);
      pillarGeo.translate(0, 3.75, 0);
      const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 70, 10, 1, true);
      beamGeo.translate(0, 35, 0);
      ev.checkpoints.forEach((cp, idx) => {
        const g = new THREE.Group();
        const r = window.RoadNetwork.rightOf(cp.dx, cp.dz);
        const mat = new THREE.MeshBasicMaterial({ color: COLORS.later, transparent: true, opacity: 0.9 });
        const left = new THREE.Mesh(pillarGeo, mat);
        left.position.set(cp.x - r.x * cp.halfWidth, 0, cp.z - r.z * cp.halfWidth);
        const right = new THREE.Mesh(pillarGeo, mat);
        right.position.set(cp.x + r.x * cp.halfWidth, 0, cp.z + r.z * cp.halfWidth);
        const span = new THREE.Mesh(new THREE.BoxGeometry(cp.halfWidth * 2, 0.5, 0.5), mat);
        span.position.set(cp.x, 7.4, cp.z);
        span.rotation.y = Math.atan2(r.x, r.z);
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(cp.halfWidth * 2, 2.2), new THREE.MeshBasicMaterial({ color: cp.isFinish ? COLORS.finish : COLORS.next, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
        banner.position.set(cp.x, 6.0, cp.z);
        banner.rotation.y = Math.atan2(r.x, r.z) + Math.PI / 2;
        const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: COLORS.next, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        beam.position.set(cp.x, 0, cp.z);
        g.add(left, right, span, banner, beam);
        cp.mesh = g; cp.mat = mat; cp.beam = beam; cp.banner = banner;
        this.gateGroup.add(g);
      });
      this.highlightGates();
    }

    highlightGates() {
      const ev = this.active;
      if (!ev) return;
      ev.checkpoints.forEach((cp, idx) => {
        const isNext = idx === this.playerCheckpoint;
        const passed = idx < this.playerCheckpoint;
        const c = cp.isFinish ? COLORS.finish : (isNext ? COLORS.next : COLORS.later);
        cp.mat.color.setHex(isNext ? (cp.isFinish ? COLORS.finish : COLORS.next) : c);
        cp.mat.opacity = passed ? 0.25 : (isNext ? 1.0 : 0.55);
        cp.beam.material.opacity = isNext ? 0.22 : 0.0;
        cp.beam.material.color.setHex(cp.isFinish ? COLORS.finish : COLORS.next);
        cp.banner.material.opacity = isNext ? 0.3 : (passed ? 0.05 : 0.12);
      });
    }

    clearGates() {
      while (this.gateGroup.children.length) {
        const g = this.gateGroup.children[0];
        this.gateGroup.remove(g);
        g.traverse((o) => { if (o.geometry && o.geometry !== undefined) { /* shared geometries are tiny; skip dispose */ } });
      }
    }

    // ── Countdown ─────────────────────────────────────────────────────────
    updateCountdown(dt, input) {
      this.countdownTimer += dt;
      const step = Math.min(3, Math.floor(this.countdownTimer));
      if (step !== this.countdownStep) {
        this.countdownStep = step;
        const labels = ['3', '2', '1', 'GO!'];
        this.m.showCountdown(labels[step], step === 3);
        if (step === 3) {
          this.state = 'running';
          this.raceTime = 0;
          if (window.SoundEngine) window.SoundEngine.announce && window.SoundEngine.announce('GO GO GO!', true);
        }
      }
      // player held on the line (engine can rev)
      const p = this.player;
      p.update(dt, { throttle: input.throttle, brake: 1, steer: 0, handbrake: true, nitro: false });
      p.speed = 0; p.velocity.set(0, 0, 0);
      this.rivals.forEach((ai) => { ai.physics.update(dt, { throttle: 0.2, brake: 1, steer: 0, handbrake: true, nitro: false }); ai.physics.speed = 0; });
    }

    // ── Running ───────────────────────────────────────────────────────────
    updateRunning(dt, trafficBodies) {
      const ev = this.active;
      const p = this.player;
      this.raceTime += dt;
      this.pulse += dt;

      // player progress
      const f = this.playerFollower;
      const prevS = f.s;
      f.track(p.position.x, p.position.z, 120, 40);
      const L = ev.route.length;
      const playerProgress = this.playerLap * L + f.s;

      // checkpoint detection (must pass through the gate area)
      const cp = ev.checkpoints[this.playerCheckpoint];
      if (cp) {
        const d = Math.hypot(p.position.x - cp.x, p.position.z - cp.z);
        const along = (p.position.x - cp.x) * cp.dx + (p.position.z - cp.z) * cp.dz;
        const lateral = Math.abs(-(p.position.x - cp.x) * cp.dz + (p.position.z - cp.z) * cp.dx);
        const passedGate = along >= -1.0 && along < 14 && lateral <= cp.halfWidth + 2.5;
        const nearByProgress = f.s >= cp.s - 6 && f.lateralDist < cp.halfWidth + 6;
        if ((passedGate && d < cp.halfWidth + 16) || (nearByProgress && d < 26)) this.onPlayerCheckpoint(cp);
      }

      // wrong way / off route hints
      const heading = Math.sin(p.yaw) * (f.pointAt(f.s + 6).dx) + Math.cos(p.yaw) * (f.pointAt(f.s + 6).dz);
      const routeDirLen = Math.hypot(f.pointAt(f.s + 6).dx, f.pointAt(f.s + 6).dz) || 1;
      this.wrongWay = p.speed > 6 && heading / routeDirLen < -0.5 && f.lateralDist < 30;
      if (f.lateralDist > 45) this.offRouteTimer += dt; else this.offRouteTimer = 0;

      // rivals
      const ctx = { player: p, rivals: this.rivals, traffic: trafficBodies, raceTime: this.raceTime, playerProgress, routeLength: L };
      for (let i = 0; i < this.rivals.length; i++) {
        const ai = this.rivals[i];
        ai.update(dt, ctx);
        if (!ai.finished) {
          // AI checkpoints by progress
          while (ai.checkpointIndex < ev.checkpoints.length && ai.follower.s >= ev.checkpoints[ai.checkpointIndex].s - 4 && ai.lapsDone * L + ai.follower.s >= ev.checkpoints[ai.checkpointIndex].s - 4) {
            const c = ev.checkpoints[ai.checkpointIndex];
            if (c.isFinish) {
              if (ai.lapsDone + 1 >= ev.laps || ev.type !== 'circuit') {
                ai.setFinished(this.raceTime);
                this.finishOrder.push(ai);
                break;
              }
              ai.checkpointIndex = 0;
              break;
            }
            ai.checkpointIndex++;
          }
          if (ev.type === 'circuit' && !ai.finished && ai.progress >= ev.totalLength - 2) {
            ai.setFinished(this.raceTime);
            this.finishOrder.push(ai);
          }
        }
      }

      // ranking (by checkpoints + progress)
      const score = (lap, cpIdx, s) => lap * 100000 + cpIdx * 1000 + Math.min(999, s);
      const mine = this.playerFinished ? Infinity : score(this.playerLap, this.playerCheckpoint, f.s);
      let pos = 1;
      this.rivals.forEach((ai) => {
        if (ai.finished) { if (!this.playerFinished) pos++; return; }
        const theirs = score(ai.lapsDone, ai.checkpointIndex, ai.follower.s);
        if (theirs > mine) pos++;
      });
      this.playerPosition = pos;

      // gate pulse
      const next = ev.checkpoints[this.playerCheckpoint];
      if (next && next.beam) next.beam.material.opacity = 0.16 + Math.sin(this.pulse * 5) * 0.06;
    }

    onPlayerCheckpoint(cp) {
      const ev = this.active;
      const p = this.player;
      // respawn anchor: at the gate, facing along the route
      p.checkpointRespawn = { x: cp.x, z: cp.z, yaw: Math.atan2(cp.dx, cp.dz) };
      if (cp.isFinish) {
        if (ev.type === 'circuit' && this.playerLap + 1 < ev.laps) {
          this.playerLap++;
          this.playerCheckpoint = 0;
          this.playerFollower.s = 0; this.playerFollower.index = 0;
          this.playerFollower.track(p.position.x, p.position.z, 80, 80);
          this.m.toast(`LAP ${this.playerLap + 1} / ${ev.laps}`, 'info');
          if (window.SoundEngine) window.SoundEngine.playBeep(true);
          this.highlightGates();
          return;
        }
        this.finishPlayer();
        return;
      }
      this.playerCheckpoint++;
      this.highlightGates();
      if (window.SoundEngine) window.SoundEngine.playBeep(false);
      const remaining = ev.checkpoints.length - this.playerCheckpoint;
      this.m.flashCheckpoint(remaining === 1 ? 'FINAL STRETCH' : 'CHECKPOINT');
    }

    finishPlayer() {
      const ev = this.active;
      this.playerFinished = true;
      const position = this.playerPosition;
      const time = this.raceTime;
      const L = ev.route.length;
      // project unfinished rivals
      const rivalResults = this.rivals.map((ai) => {
        let t = ai.finishTime;
        if (t === null) {
          const remaining = Math.max(0, ev.totalLength - ai.progress);
          const avg = Math.max(8, ai.progress / Math.max(1, this.raceTime));
          t = this.raceTime + remaining / avg;
        }
        return { name: ai.name, carId: ai.carId, time: t, isPlayer: false };
      });
      const all = [...rivalResults, { name: 'You', carId: this.player.car ? this.player.car.carId : null, time, isPlayer: true }].sort((a, b) => a.time - b.time);
      const finalPos = all.findIndex((r) => r.isPlayer) + 1;

      // medal + rewards
      let medal = 'none';
      let credits = 0; let rep = 0;
      const rw = ev.def.rewards || {};
      if (ev.type === 'timetrial') {
        const mt = ev.medalTimes;
        medal = time <= mt.gold ? 'gold' : (time <= mt.silver ? 'silver' : (time <= mt.bronze ? 'bronze' : 'none'));
        credits = (rw.credits && rw.credits[medal]) || 0;
        rep = (rw.reputation && rw.reputation[medal]) || 0;
      } else {
        medal = finalPos === 1 ? 'gold' : (finalPos === 2 ? 'silver' : (finalPos === 3 ? 'bronze' : 'none'));
        credits = (rw.credits && rw.credits[Math.min(finalPos, rw.credits.length) - 1]) || 0;
        rep = (rw.reputation && rw.reputation[Math.min(finalPos, rw.reputation.length) - 1]) || 0;
      }
      const driftBonus = Math.min(500, Math.round(Math.max(0, (this.player.driftScore || 0) - this.driftAtStart) * 0.5));
      const prevRecord = window.SaveManager ? window.SaveManager.getEventRecord(ev.id) : null;
      const replay = !!prevRecord;
      if (replay) { credits = Math.round(credits * 0.5); rep = Math.round(rep * 0.5); }
      let saveInfo = { newBest: false, firstClear: !prevRecord };
      let levelInfo = null;
      if (window.SaveManager) {
        saveInfo = window.SaveManager.recordEventResult(ev.id, { time, position: finalPos, medal });
        if (saveInfo.newBest && replay) rep += 100;
        window.SaveManager.addCash(credits + driftBonus);
        levelInfo = window.SaveManager.addReputation(rep);
        window.SaveManager.addStat('driftPoints', Math.round(Math.max(0, (this.player.driftScore || 0) - this.driftAtStart)));
      }
      this.lastResult = {
        event: ev, position: finalPos, time, medal, credits, driftBonus, rep, standings: all,
        newBest: saveInfo.newBest, firstClear: saveInfo.firstClear, replay, levelInfo,
        medalTimes: ev.medalTimes
      };
      this.state = 'results';
      if (window.SoundEngine) {
        if (finalPos === 1 || medal === 'gold') window.SoundEngine.playVictory && window.SoundEngine.playVictory();
        window.SoundEngine.setMusicIntensity('cruising');
      }
      this.m.onEventFinished(this.lastResult);
    }

    /** Leave the event (results → free roam, or abort). */
    end(abort = false) {
      this.rivals.forEach((ai) => ai.dispose(this.scene));
      this.rivals = [];
      this.clearGates();
      this.setMarkersVisible(true);
      this.refreshMarkerLocks();
      if (this.player) this.player.checkpointRespawn = null;
      this.active = null;
      this.state = 'idle';
      this.wrongWay = false;
      if (abort && window.SoundEngine) window.SoundEngine.setMusicIntensity('cruising');
    }

    /** Restart the active/last event from the grid. */
    retry() {
      const ev = this.active || (this.lastResult && this.lastResult.event);
      const player = this.player;
      this.end(true);
      if (ev && player) this.begin(ev, player);
    }

    // ── HUD data ─────────────────────────────────────────────────────────
    getHudState() {
      if (!this.active) return null;
      const ev = this.active;
      const next = ev.checkpoints[this.playerCheckpoint] || null;
      return {
        name: ev.name,
        type: ev.type,
        state: this.state,
        time: this.raceTime,
        position: this.playerPosition,
        total: this.rivals.length + 1,
        lap: this.playerLap + 1,
        laps: ev.laps,
        checkpoint: this.playerCheckpoint,
        checkpoints: ev.checkpoints.length,
        next,
        nextDistance: next ? Math.hypot(this.player.position.x - next.x, this.player.position.z - next.z) : 0,
        wrongWay: this.wrongWay,
        offRoute: this.offRouteTimer > 3,
        medalTimes: ev.medalTimes,
        route: ev.route,
        rivals: this.rivals
      };
    }

    dispose() {
      this.end(true);
      this.scene.remove(this.markerGroup, this.gateGroup);
    }
  }

  EventSystem.COLORS = COLORS;
  EventSystem.makeTextSprite = makeTextSprite;
  window.EventSystem = EventSystem;
})();
