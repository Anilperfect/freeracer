/**
 * FreeRacer - Open-world HUD
 * ---------------------------------------------------------------------------
 * Reuses the cockpit cluster (speed / gear / nitro / drift) from the circuit
 * HUD and adds: street name, reputation strip, event panel (timer, position,
 * checkpoints, laps), next-checkpoint direction, and a rotating road-graph
 * minimap with a full-district map toggle (M).
 */
(function () {
  class OpenWorldHUD {
    constructor(manager) {
      this.m = manager;
      const $ = (id) => document.getElementById(id);
      this.speedElem = $('speed-num');
      this.gearElem = $('gear-num');
      this.nitroBar = $('nitro-fill');
      this.nitroTierBadge = $('nitro-tier-badge');
      this.nitroSweetSpot = $('nitro-sweet-spot');
      this.driftAlert = $('drift-alert');
      this.driftScoreElem = $('drift-score');
      this.cashDisplay = $('cash-display');
      this.posElem = $('pos-num');
      this.lapElem = $('lap-num');
      this.timeElem = $('time-num');
      this.wrongWay = $('wrong-way');
      this.checkpointDisplay = $('checkpoint-display');
      this.street = $('ow-street');
      this.repStrip = $('ow-rep');
      this.repFill = $('ow-rep-fill');
      this.eventPanel = $('ow-event-panel');
      this.eventName = $('ow-event-name');
      this.eventMeta = $('ow-event-meta');
      this.eventTimer = $('ow-event-timer');
      this.eventPos = $('ow-event-pos');
      this.eventCp = $('ow-event-cp');
      this.eventArrow = $('ow-cp-arrow');
      this.eventDist = $('ow-cp-dist');
      this.offRoute = $('ow-off-route');
      this.fpsElem = $('ow-fps');
      this.canvas = $('minimap-canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.bigMap = false;
      this.rotate = window.SaveManager ? window.SaveManager.getSetting('minimapRotate', true) : true;
      this.filters = Object.assign({ events: true, garage: true, discoveries: true, caches: true },
        window.SaveManager ? window.SaveManager.getSetting('mapFilters', {}) : {});
      this.streetTimer = 0;
      this.lastStreet = '';
      this.cashTimer = 0;
      this.driftShownScore = 0;
      if (this.canvas) { this.canvas.width = 200; this.canvas.height = 200; }
      this.roadCache = null;
      this.buildRoadCache();
      this.refreshCash();
      this.refreshRep();
      if (this.lapElem) this.lapElem.parentElement.parentElement.classList.add('ow-hidden');
    }

    static formatTime(seconds) {
      if (!Number.isFinite(seconds)) return '--:--.--';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    }

    buildRoadCache() {
      // Pre-simplify roads into segments for fast minimap drawing
      const net = this.m.network;
      const segs = [];
      net.edges.forEach((e) => {
        const pts = e.points || e.rawPoints;
        if (!pts || pts.length < 2) return;
        segs.push({ pts: pts.map((p) => [p.x, p.z]), width: e.type === 'avenue' ? 4 : (e.type === 'alley' ? 1.2 : 2.4), type: e.type });
      });
      this.roadCache = segs;
    }

    toggleBigMap() {
      this.bigMap = !this.bigMap;
      const wrap = this.canvas ? this.canvas.parentElement : null;
      if (wrap) wrap.classList.toggle('big', this.bigMap);
      if (this.canvas) {
        const size = this.bigMap ? Math.min(window.innerWidth, window.innerHeight) * 0.78 : 200;
        this.canvas.width = size; this.canvas.height = size;
      }
    }

    toggleMinimapRotation() {
      this.rotate = !this.rotate;
      if (window.SaveManager) window.SaveManager.setSetting('minimapRotate', this.rotate);
      this.m.toast(`Minimap: ${this.rotate ? 'rotates with car' : 'north up'}`, 'info', 1.5);
    }

    /** Toggles a minimap/marker filter (keys 1-4). Returns the new state. */
    setFilter(key, on) {
      if (!(key in this.filters)) return true;
      this.filters[key] = !!on;
      if (window.SaveManager) window.SaveManager.setSetting('mapFilters', this.filters);
      return this.filters[key];
    }

    refreshCash() {
      if (this.cashDisplay && window.SaveManager) this.cashDisplay.textContent = `₡ ${window.SaveManager.getCash().toLocaleString()}`;
    }

    refreshRep() {
      if (!window.SaveManager) return;
      const info = window.SaveManager.getLevelInfo();
      if (this.repStrip) this.repStrip.textContent = `LV ${info.level} · ${info.title} · ${info.reputation} REP`;
      if (this.repFill) this.repFill.style.width = `${Math.round(info.progress * 100)}%`;
    }

    update(dt) {
      const p = this.m.player;
      if (!p) return;
      // speed & gear
      if (this.speedElem) this.speedElem.textContent = p.getSpeedKmh();
      if (this.gearElem) this.gearElem.textContent = p.currentGear;

      // nitro
      if (this.nitroBar) {
        const pct = p.getNitroPercent();
        this.nitroBar.style.height = `${pct}%`;
        if (this.nitroTierBadge) {
          if (p.nitroTier === 'overdrive' && p.isNitroActive) { this.nitroTierBadge.textContent = '⚡ OVERDRIVE ⚡'; this.nitroTierBadge.className = 'nitro-tier-badge overdrive'; this.nitroBar.style.background = 'linear-gradient(to top, #7928ca, #e024c3, #ff0080)'; }
          else if (p.nitroTier === 'precision' && p.isNitroActive) { this.nitroTierBadge.textContent = '★ PRECISION ★'; this.nitroTierBadge.className = 'nitro-tier-badge precision'; this.nitroBar.style.background = 'linear-gradient(to top, #0070f3, #00d8ff, #00f0ff)'; }
          else if (p.isNitroActive) { this.nitroTierBadge.textContent = 'NITRO'; this.nitroTierBadge.className = 'nitro-tier-badge standard'; this.nitroBar.style.background = 'linear-gradient(to top, #ff4400, #ff8800, #ffbb00)'; }
          else { this.nitroTierBadge.textContent = pct > 75 ? 'OVERDRIVE READY' : (pct > 25 ? 'NITRO READY' : 'RECHARGING'); this.nitroTierBadge.className = 'nitro-tier-badge'; this.nitroBar.style.background = 'linear-gradient(to top, #ff3300, #ff9900, #ffee00)'; }
        }
        if (this.nitroSweetSpot) this.nitroSweetSpot.classList.toggle('active', !!(p.nitroTimingWindow && p.nitroTimingWindow > 0));
      }

      // drift
      if (this.driftAlert) {
        if (p.isDrifting && p.driftScore > 20) {
          this.driftAlert.style.display = 'flex';
          this.driftAlert.classList.add('active');
          if (this.driftScoreElem) this.driftScoreElem.textContent = `+${Math.floor(p.driftScore)}`;
        } else if (this.driftAlert.style.display !== 'none') {
          this.driftAlert.classList.remove('active');
          this.driftAlert.style.display = 'none';
        }
      }

      // cash (cheap: every 0.5 s)
      this.cashTimer += dt;
      if (this.cashTimer > 0.5) { this.cashTimer = 0; this.refreshCash(); this.refreshRep(); }

      // street name
      this.streetTimer += dt;
      if (this.streetTimer > 0.4) {
        this.streetTimer = 0;
        const near = this.m.network.nearestRoadPoint(p.position.x, p.position.z, 30);
        let label;
        if (near && near.dist <= near.edge.halfWidth + 4) label = near.edge.name || (near.edge.type === 'alley' ? 'Service Alley' : OpenWorldHUD.streetName(near.edge));
        else if (p.surfaceType === 'plaza') label = 'Apex Plaza';
        else if (p.surfaceType === 'boardwalk') label = 'Harborline Boardwalk';
        else label = this.m.district.name;
        if (label !== this.lastStreet && this.street) { this.street.textContent = label; this.lastStreet = label; }
      }

      // event panel
      const ev = this.m.events ? this.m.events.getHudState() : null;
      if (this.eventPanel) this.eventPanel.classList.toggle('hidden', !ev);
      if (ev) {
        if (this.eventName) this.eventName.textContent = ev.name;
        if (this.eventTimer) this.eventTimer.textContent = OpenWorldHUD.formatTime(ev.time);
        if (this.eventPos) {
          if (ev.type === 'timetrial') this.eventPos.textContent = ev.medalTimes ? `GOLD ${OpenWorldHUD.formatTime(ev.medalTimes.gold)}` : '';
          else if (ev.type === 'drift' && ev.driftTargets) this.eventPos.textContent = `${Math.floor(ev.driftScore || 0)} / ${ev.driftTargets.gold} PTS`;
          else this.eventPos.textContent = `${window.OpenWorldManager.ordinal(ev.position)} / ${ev.total}`;
        }
        if (this.eventCp) this.eventCp.textContent = ev.type === 'circuit' ? `LAP ${ev.lap}/${ev.laps} · CP ${ev.checkpoint}/${ev.checkpoints}` : `CP ${ev.checkpoint}/${ev.checkpoints}`;
        if (this.eventMeta) this.eventMeta.textContent = ev.state === 'countdown' ? 'GET READY' : (ev.state === 'results' ? 'FINISHED' : (ev.type === 'timetrial' ? 'TIME ATTACK' : (ev.type === 'drift' ? 'DRIFT' : ev.type.toUpperCase())));
        if (this.eventArrow && ev.next) {
          const dx = ev.next.x - p.position.x; const dz = ev.next.z - p.position.z;
          const ang = Math.atan2(dx, dz) - p.yaw; // relative bearing, + = left
          this.eventArrow.style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
          if (this.eventDist) this.eventDist.textContent = `${Math.round(ev.nextDistance)} m`;
        }
        if (this.wrongWay) this.wrongWay.style.display = ev.wrongWay ? 'block' : 'none';
        if (this.offRoute) this.offRoute.classList.toggle('hidden', !ev.offRoute);
      } else {
        if (this.wrongWay) this.wrongWay.style.display = 'none';
        if (this.offRoute) this.offRoute.classList.add('hidden');
      }

      if (this.fpsElem) this.fpsElem.textContent = `${Math.round(this.m.perf.fps)} fps`;
      this.drawMinimap(p, ev);
    }

    static streetName(edge) {
      // deterministic pseudo-names for unnamed streets from node ids
      const names = ['Voltrix Street', 'Kairo Row', 'Radian Street', 'Monarch Way', 'Forge Street', 'Halcyon Street', 'Veyra Street', 'Ironline Street', 'Solace Street', 'Cinder Row', 'Lumen Street', 'Tidal Street'];
      const h = (edge.index * 7919) % names.length;
      return names[h];
    }

    // ── Minimap ──────────────────────────────────────────────────────────
    drawMinimap(p, ev) {
      const ctx = this.ctx;
      if (!ctx) return;
      const w = this.canvas.width; const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      const big = this.bigMap;
      const b = this.m.district.bounds;
      let scale; let cx; let cz; let rot;
      if (big) {
        scale = Math.min(w / (b.maxX - b.minX), h / (b.maxZ - b.minZ)) * 0.94;
        cx = (b.minX + b.maxX) / 2; cz = (b.minZ + b.maxZ) / 2; rot = 0;
      } else {
        scale = w / 420; // 420 m across
        cx = p.position.x; cz = p.position.z; rot = this.rotate ? p.yaw : 0;
      }
      const cos = Math.cos(rot); const sin = Math.sin(rot);
      // world → map (north = -z is "up" when rot=0; with rotation the car's heading points up)
      const toMap = (x, z) => {
        const dx = x - cx; const dz = z - cz;
        // rotate so that the heading direction (sin yaw, cos yaw) maps to up
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        return [w / 2 - rx * scale, h / 2 - rz * scale];
      };
      const forwardUp = !big && this.rotate;
      // north-up: +x → right, +z (south) → down
      const map = (x, z) => {
        if (!forwardUp) return [w / 2 + (x - cx) * scale, h / 2 + (z - cz) * scale];
        return toMap(x, z);
      };

      // circular mask
      ctx.save();
      if (!big) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.clip(); }
      ctx.fillStyle = 'rgba(8, 10, 24, 0.82)';
      ctx.fillRect(0, 0, w, h);

      // plaza & water hints
      const plaza = this.m.district.plaza;
      if (plaza) {
        ctx.fillStyle = 'rgba(60, 70, 110, 0.35)';
        this.fillQuad(ctx, map, plaza.minX, plaza.minZ, plaza.maxX, plaza.maxZ);
      }
      const wf = this.m.district.waterfront;
      if (wf) { ctx.fillStyle = 'rgba(20, 90, 140, 0.45)'; this.fillQuad(ctx, map, b.minX, wf.z, b.maxX, b.maxZ + 200); }

      // roads
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const segs = this.roadCache;
      const cull = big ? Infinity : 320;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const first = s.pts[0]; const last = s.pts[s.pts.length - 1];
        if (!big) {
          const dmin = Math.min(Math.hypot(first[0] - cx, first[1] - cz), Math.hypot(last[0] - cx, last[1] - cz));
          if (dmin > cull) continue;
        }
        ctx.beginPath();
        ctx.strokeStyle = s.type === 'avenue' ? 'rgba(200, 210, 235, 0.55)' : (s.type === 'alley' ? 'rgba(140, 150, 175, 0.35)' : 'rgba(170, 180, 205, 0.45)');
        ctx.lineWidth = Math.max(1, s.width * scale * (big ? 1.4 : 1));
        s.pts.forEach((pt, k) => { const [mx, my] = map(pt[0], pt[1]); if (k === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my); });
        ctx.stroke();
      }

      // route
      if (ev && ev.route) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.lineWidth = Math.max(2, 3 * scale * 2);
        const pts = ev.route.points;
        for (let i = 0; i < pts.length; i += 2) { const [mx, my] = map(pts[i].x, pts[i].z); if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my); }
        ctx.stroke();
        // checkpoints
        if (ev.next) {
          const [nx, ny] = map(ev.next.x, ev.next.z);
          ctx.beginPath(); ctx.arc(nx, ny, big ? 7 : 6, 0, Math.PI * 2);
          ctx.fillStyle = ev.next.isFinish ? '#ff3cac' : '#00f0ff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
        }
        // rivals
        ev.rivals.forEach((ai) => {
          const [ax, ay] = map(ai.physics.position.x, ai.physics.position.z);
          ctx.beginPath(); ctx.arc(ax, ay, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#ff7700'; ctx.fill();
        });
      } else {
        // event markers, garage, discoveries, caches (filterable with keys 1-4)
        if (this.filters.events) {
          const events = this.m.events ? this.m.events.events : [];
          events.forEach((e) => {
            const [mx, my] = map(e.marker.x, e.marker.z);
            if (mx < -10 || my < -10 || mx > w + 10 || my > h + 10) return;
            ctx.beginPath();
            ctx.fillStyle = e.unlocked ? ((e.type === 'timetrial' || e.type === 'drift') ? '#ffc93c' : '#00f0ff') : '#8a2033';
            this.diamond(ctx, mx, my, big ? 7 : 6);
            ctx.fill();
            if (big) { ctx.fillStyle = '#e8ecff'; ctx.font = '12px Rajdhani, Arial'; ctx.fillText(e.name, mx + 9, my + 4); }
          });
        }
        if (this.filters.garage) {
          const g = this.m.district.garage.entry;
          const [gx, gy] = map(g.x, g.z);
          ctx.fillStyle = '#7dff6a'; ctx.beginPath(); ctx.rect(gx - 5, gy - 5, 10, 10); ctx.fill();
          if (big) { ctx.fillStyle = '#e8ecff'; ctx.font = '12px Rajdhani, Arial'; ctx.fillText('Garage', gx + 9, gy + 4); }
        }
        if (this.filters.discoveries) {
          this.m.discoveryMeshes.forEach((m) => {
            if (!m.visible) return;
            const d = m.userData.discovery;
            const [dx, dy] = map(d.x, d.z);
            ctx.fillStyle = 'rgba(255, 201, 60, 0.85)'; ctx.beginPath(); ctx.arc(dx, dy, big ? 4 : 3, 0, Math.PI * 2); ctx.fill();
          });
        }
        if (this.filters.caches) {
          (this.m.cacheMeshes || []).forEach((m) => {
            if (!m.visible) return;
            const c = m.userData.cache;
            const [cx2, cy2] = map(c.x, c.z);
            ctx.fillStyle = '#37ff9e'; ctx.beginPath(); ctx.rect(cx2 - 3, cy2 - 3, 6, 6); ctx.fill();
            if (big) { ctx.fillStyle = '#e8ecff'; ctx.font = '12px Rajdhani, Arial'; ctx.fillText(c.name, cx2 + 9, cy2 + 4); }
          });
        }
        if (big) {
          ctx.fillStyle = 'rgba(232, 236, 255, 0.75)'; ctx.font = '12px Rajdhani, Arial'; ctx.textAlign = 'left';
          ctx.fillText('1 events · 2 garage · 3 discoveries · 4 caches', 12, h - 12);
        }
      }

      // traffic (near only)
      if (!big && this.m.traffic) {
        const near = this.m.traffic.nearby(p.position.x, p.position.z, 200, []);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        near.forEach((c) => { const [tx, ty] = map(c.position.x, c.position.z); ctx.beginPath(); ctx.arc(tx, ty, 1.8, 0, Math.PI * 2); ctx.fill(); });
      }

      // player arrow
      const [px, py] = map(p.position.x, p.position.z);
      ctx.save();
      ctx.translate(px, py);
      // canvas rotation is clockwise-positive; forward (sin yaw, cos yaw) → screen angle π − yaw in north-up mode
      const heading = forwardUp ? 0 : Math.PI - p.yaw;
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath();
      ctx.fillStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
      ctx.restore();

      // compass N
      if (!big) {
        const [nx, ny] = map(cx, cz - 1000);
        const ang = Math.atan2(nx - w / 2, -(ny - h / 2));
        const r = w / 2 - 12;
        ctx.fillStyle = '#ff5f7a'; ctx.font = 'bold 12px Rajdhani, Arial'; ctx.textAlign = 'center';
        ctx.fillText('N', w / 2 + Math.sin(ang) * r, h / 2 - Math.cos(ang) * r + 4);
      }
      ctx.restore();
      // ring
      if (!big) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)'; ctx.lineWidth = 2; ctx.stroke(); }
    }

    fillQuad(ctx, map, x0, z0, x1, z1) {
      const a = map(x0, z0); const b = map(x1, z0); const c = map(x1, z1); const d = map(x0, z1);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    }

    diamond(ctx, x, y, r) {
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    }
  }

  window.OpenWorldHUD = OpenWorldHUD;
})();
