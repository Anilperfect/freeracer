/**
 * HUD & UI Coordinator for Turbo Rush.
 * Updates the digital speedometer, gear indicator, nitro bar,
 * real-time 2D minimap with live racer dots, lap times, and drift popups.
 */
class HUDManager {
  constructor(trackManager) {
    this.track = trackManager;

    // DOM Elements
    this.speedElem = document.getElementById('speed-num');
    this.gearElem = document.getElementById('gear-num');
    this.posElem = document.getElementById('pos-num');
    this.lapElem = document.getElementById('lap-num');
    this.timeElem = document.getElementById('time-num');
    this.nitroBar = document.getElementById('nitro-fill');
    this.nitroTierBadge = document.getElementById('nitro-tier-badge');
    this.nitroSweetSpot = document.getElementById('nitro-sweet-spot');
    this.driftAlert = document.getElementById('drift-alert');
    this.driftScoreElem = document.getElementById('drift-score');
    this.wrongWayBanner = document.getElementById('wrong-way');

    // Cash & Economy
    this.cashDisplay = document.getElementById('cash-display');
    this.cashNotify = document.getElementById('cash-pickup-notify');
    this.cashNotifyTimer = 0;

    // Checkpoint & Penalty
    this.checkpointDisplay = document.getElementById('checkpoint-display');
    this.checkpointMissed = document.getElementById('checkpoint-missed');
    this.penaltyTimer = document.getElementById('penalty-timer');

    // Minimap Canvas
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    // Minimap bounding box
    this.minX = -180;
    this.maxX = 200;
    this.minZ = -100;
    this.maxZ = 210;

    if (this.minimapCanvas) {
      this.minimapCanvas.width = 170;
      this.minimapCanvas.height = 170;
    }

    this.lastDriftDisplayScore = 0;
  }

  showCashPickup(amount) {
    if (!this.cashNotify) return;
    this.cashNotify.textContent = `+${amount} ₡`;
    this.cashNotify.style.display = 'block';
    this.cashNotify.style.animation = 'none';
    void this.cashNotify.offsetWidth;
    this.cashNotify.style.animation = 'cash-float-up 1.2s ease-out forwards';
    this.cashNotifyTimer = 1.2;
  }

  showCheckpointMissed() {
    if (!this.checkpointMissed) return;
    this.checkpointMissed.style.display = 'block';
    setTimeout(() => {
      if (this.checkpointMissed) this.checkpointMissed.style.display = 'none';
    }, 2000);
  }

  updatePenaltyTimer(remaining) {
    if (!this.penaltyTimer) return;
    if (remaining > 0) {
      this.penaltyTimer.textContent = `PENALTY ${remaining.toFixed(1)}s`;
      this.penaltyTimer.style.display = 'block';
    } else {
      this.penaltyTimer.style.display = 'none';
    }
  }

  update(playerPhysics, raceManager, allCars) {
    // 1. SPEED & GEAR
    const speedKmh = playerPhysics.getSpeedKmh();
    if (this.speedElem) this.speedElem.textContent = speedKmh;

    // Simulated Gear
    let gear = 'N';
    if (playerPhysics.speed < -0.5) gear = 'R';
    else if (speedKmh === 0) gear = 'N';
    else if (speedKmh < 35) gear = '1';
    else if (speedKmh < 70) gear = '2';
    else if (speedKmh < 110) gear = '3';
    else if (speedKmh < 145) gear = '4';
    else if (speedKmh < 175) gear = '5';
    else gear = '6';

    if (this.gearElem) this.gearElem.textContent = gear;

    // 2. MULTI-STAGE NITRO GAUGE & SWEET SPOT
    if (this.nitroBar) {
      const pct = playerPhysics.getNitroPercent();
      this.nitroBar.style.height = `${pct}%`;

      if (this.nitroTierBadge) {
        if (playerPhysics.nitroTier === 'overdrive') {
          this.nitroTierBadge.textContent = '⚡ OVERDRIVE ⚡';
          this.nitroTierBadge.className = 'nitro-tier-badge overdrive';
          this.nitroBar.style.background = 'linear-gradient(to top, #7928ca, #e024c3, #ff0080)';
        } else if (playerPhysics.nitroTier === 'precision') {
          this.nitroTierBadge.textContent = '★ PRECISION ★';
          this.nitroTierBadge.className = 'nitro-tier-badge precision';
          this.nitroBar.style.background = 'linear-gradient(to top, #0070f3, #00d8ff, #00f0ff)';
        } else if (playerPhysics.isNitroActive) {
          this.nitroTierBadge.textContent = 'STANDARD';
          this.nitroTierBadge.className = 'nitro-tier-badge standard';
          this.nitroBar.style.background = 'linear-gradient(to top, #ff4400, #ff8800, #ffbb00)';
        } else {
          this.nitroTierBadge.textContent = pct > 75 ? 'OVERDRIVE READY' : (pct > 25 ? 'NITRO READY' : 'RECHARGING');
          this.nitroTierBadge.className = 'nitro-tier-badge';
          this.nitroBar.style.background = 'linear-gradient(to top, #ff3300, #ff9900, #ffee00)';
        }
      }

      if (this.nitroSweetSpot) {
        if (playerPhysics.nitroTimingWindow && playerPhysics.nitroTimingWindow > 0) {
          this.nitroSweetSpot.classList.add('active');
        } else {
          this.nitroSweetSpot.classList.remove('active');
        }
      }
    }

    // 3. RACE TIME & LAPS
    if (this.timeElem && raceManager) {
      this.timeElem.textContent = this.formatTime(raceManager.raceTime);
    }
    if (this.lapElem && raceManager) {
      this.lapElem.textContent = `${Math.min(raceManager.maxLaps, raceManager.playerLap)}/${raceManager.maxLaps}`;
    }
    if (this.posElem && raceManager) {
      this.posElem.textContent = raceManager.playerPosition;
    }

    // 4. DRIFT NOTIFICATION
    if (playerPhysics.isDrifting && playerPhysics.driftScore > 20) {
      if (this.driftAlert) {
        this.driftAlert.style.display = 'flex';
        this.driftAlert.classList.add('active');
      }
      if (this.driftScoreElem) {
        this.driftScoreElem.textContent = `+${playerPhysics.driftScore}`;
      }
    } else {
      if (this.driftAlert && this.driftAlert.classList.contains('active')) {
        this.driftAlert.classList.remove('active');
        setTimeout(() => {
          if (!playerPhysics.isDrifting && this.driftAlert) {
            this.driftAlert.style.display = 'none';
          }
        }, 400);
      } else if (this.driftAlert && !playerPhysics.isDrifting) {
        this.driftAlert.style.display = 'none';
      }
    }

    // 5. WRONG WAY WARNING
    if (this.wrongWayBanner && raceManager) {
      this.wrongWayBanner.style.display = raceManager.isWrongWay ? 'block' : 'none';
    }

    // 6. CASH DISPLAY
    if (this.cashDisplay && window.SaveManager) {
      this.cashDisplay.textContent = `₡ ${window.SaveManager.getCash().toLocaleString()}`;
    }

    // 7. CASH PICKUP NOTIFICATION TIMER
    if (this.cashNotifyTimer > 0) {
      this.cashNotifyTimer -= 0.016; // approximate dt
      if (this.cashNotifyTimer <= 0 && this.cashNotify) {
        this.cashNotify.style.display = 'none';
      }
    }

    // 8. CHECKPOINT COUNTER
    if (this.checkpointDisplay && raceManager) {
      const cp = raceManager.lastCheckpointPassed || 0;
      this.checkpointDisplay.textContent = `CP ${cp}/16`;
    }

    // 9. DRAW MINIMAP
    this.drawMinimap(playerPhysics, allCars);
  }

  drawMinimap(player, allCars) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Coordinate conversion
    const toMapX = (worldX) => ((worldX - this.minX) / (this.maxX - this.minX)) * (w - 24) + 12;
    const toMapY = (worldZ) => ((worldZ - this.minZ) / (this.maxZ - this.minZ)) * (h - 24) + 12;

    // Draw Track Line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const samples = this.track.splineSamples;
    for (let i = 0; i < samples.length; i++) {
      const pt = samples[i].point;
      const mx = toMapX(pt.x);
      const my = toMapY(pt.z);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw AI Racers (Orange dots)
    if (allCars) {
      allCars.forEach(ai => {
        if (ai === player) return;
        const ax = toMapX(ai.position.x);
        const ay = toMapY(ai.position.z);
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff7700';
        ctx.fill();
      });
    }

    // Draw Player (Glowing Cyan dot)
    const px = toMapX(player.position.x);
    const py = toMapY(player.position.z);

    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0; // reset
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }
}

window.HUDManager = HUDManager;
