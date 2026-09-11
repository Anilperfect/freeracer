/**
 * Game Modes System for Turbo Rush:
 * - ARCADE RACE: Classic 4-car championship against AI
 * - TIME TRIAL: Solo lap attack with personal-best records, checkpoint split comparisons, and 3D ghost vehicle playback
 * - TEAM RACING: 2v2 Red vs Blue team race with position scoring
 * - PRACTICE MODE: Free driving and track exploration
 */
class RaceModesManager {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.currentMode = 'ARCADE'; // ARCADE, TIME_TRIAL, TEAM_RACE, PRACTICE

    // Time Trial & Ghost State
    this.recordedLapSamples = [];
    this.currentLapSamples = [];
    this.ghostCarModel = null;
    this.ghostPlaybackIndex = 0;
    this.personalBestTime = null;
    this.splitDeltas = []; // Delta +/- seconds at checkpoints

    // Team Racing State
    this.playerTeam = 'BLUE'; // 'BLUE' or 'RED'
    this.teamScores = { BLUE: 0, RED: 0 };
  }

  setMode(mode) {
    this.currentMode = mode;
  }

  startMode(mode, mapId, playerPhysics, aiRacers) {
    let modeKey = 'ARCADE';
    if (mode === 'timetrial') modeKey = 'TIME_TRIAL';
    else if (mode === 'team') modeKey = 'TEAM_RACE';
    else if (mode === 'practice') modeKey = 'PRACTICE';
    this.setMode(modeKey);
    this.onRaceStart(mapId, this.game.selectedCarId || 'falcon_s1');
  }

  onRaceStart(trackId, selectedCarId) {
    const profile = window.SaveManager ? window.SaveManager.getProfile() : null;
    this.personalBestTime = (profile && profile.bestTimes && profile.bestTimes[trackId]) || null;
    this.currentLapSamples = [];
    this.ghostPlaybackIndex = 0;

    // In Time Trial: Spawn 3D Holographic Ghost Car if a previous best lap exists
    if (this.currentMode === 'TIME_TRIAL') {
      const savedGhost = profile && profile.ghostLaps && profile.ghostLaps[trackId];
      if (savedGhost && savedGhost.length > 10) {
        this.recordedLapSamples = savedGhost;
        this.spawnGhostCar(selectedCarId);
      }
    }

    // In Team Racing: Assign teams
    if (this.currentMode === 'TEAM_RACE') {
      this.teamScores = { BLUE: 0, RED: 0 };
      // Player + AI 1 are BLUE, AI 2 + AI 3 are RED
      if (this.game.playerCar) {
        this.applyTeamVisuals(this.game.playerCar, 'BLUE');
      }
      if (this.game.aiRacers && this.game.aiRacers.length >= 3) {
        this.applyTeamVisuals(this.game.aiRacers[0].carModel, 'BLUE');
        this.applyTeamVisuals(this.game.aiRacers[1].carModel, 'RED');
        this.applyTeamVisuals(this.game.aiRacers[2].carModel, 'RED');
      }
    }
  }

  spawnGhostCar(carId) {
    if (this.ghostCarModel) {
      this.game.scene.remove(this.ghostCarModel.group);
    }
    const car = window.getCarById(carId);
    this.ghostCarModel = new window.CarModel(0x00f0ff, false, carId, 1);

    // Make entire ghost vehicle semi-transparent holographic cyan
    this.ghostCarModel.group.traverse(obj => {
      if (obj.material) {
        obj.material.transparent = true;
        obj.material.opacity = 0.40;
        obj.material.wireframe = false;
        if (obj.material.color) obj.material.color.set(0x00f0ff);
        if (obj.material.emissive) obj.material.emissive.set(0x00a8ff);
      }
    });

    this.game.scene.add(this.ghostCarModel.group);
  }

  applyTeamVisuals(carModel, team) {
    const color = team === 'BLUE' ? 0x00d8ff : 0xff2244;
    if (carModel.underglowMesh && carModel.underglowMesh.material) {
      carModel.underglowMesh.material.color.set(color);
      carModel.underglowMesh.material.opacity = 0.85;
    }
  }

  update(dt, playerPhysics, raceTime) {
    playerPhysics = playerPhysics || (this.game && this.game.playerPhysics);
    raceTime = raceTime !== undefined ? raceTime : (this.game ? this.game.raceTime : 0);

    // 1. Record Player Lap in Time Trial
    if (this.currentMode === 'TIME_TRIAL' && playerPhysics) {
      this.currentLapSamples.push({
        time: raceTime,
        pos: [playerPhysics.position.x, playerPhysics.position.y, playerPhysics.position.z],
        quat: [playerPhysics.quaternion.x, playerPhysics.quaternion.y, playerPhysics.quaternion.z, playerPhysics.quaternion.w]
      });

      // Update Ghost Car Playback
      if (this.ghostCarModel && this.recordedLapSamples.length > 0) {
        const sample = this.recordedLapSamples[this.ghostPlaybackIndex];
        if (sample) {
          this.ghostCarModel.group.position.set(sample.pos[0], sample.pos[1], sample.pos[2]);
          this.ghostCarModel.group.quaternion.set(sample.quat[0], sample.quat[1], sample.quat[2], sample.quat[3]);

          if (this.ghostPlaybackIndex < this.recordedLapSamples.length - 1) {
            this.ghostPlaybackIndex++;
          }
        }
      }
    }
  }

  onCheckpointPassed(cpIndex, currentTime) {
    if (this.currentMode === 'TIME_TRIAL' && this.personalBestTime) {
      const expectedTime = (this.personalBestTime / 16) * (cpIndex + 1);
      const delta = currentTime - expectedTime;
      const splitEl = document.getElementById('split-hud');
      if (splitEl) {
        splitEl.style.display = 'block';
        splitEl.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(2) + 's';
        splitEl.className = delta <= 0 ? 'ahead' : 'behind';
        setTimeout(() => { if (splitEl) splitEl.style.display = 'none'; }, 2000);
      }
    }
  }

  onLapCompleted(lapTime, trackId) {
    if (this.currentMode === 'TIME_TRIAL') {
      const isRecord = window.SaveManager && window.SaveManager.recordBestTime ? window.SaveManager.recordBestTime(trackId, lapTime, this.currentLapSamples) : false;
      if (isRecord) {
        this.personalBestTime = lapTime;
        this.recordedLapSamples = [...this.currentLapSamples];
        if (!this.ghostCarModel) {
          this.spawnGhostCar(this.game.selectedCarId);
        }
      }
      this.currentLapSamples = [];
      this.ghostPlaybackIndex = 0;
    }
  }

  onRaceFinished(totalTime, playerRank) {
    if (this.currentMode === 'TIME_TRIAL') {
      this.onLapCompleted(totalTime, this.game.selectedMapId);
    } else if (this.currentMode === 'TEAM_RACE') {
      const finishRankings = [
        { name: 'Player', isPlayer: true, rank: playerRank },
        ...this.game.aiRacers.map((a, i) => ({ name: a.name, isPlayer: false, rank: i + 2 }))
      ];
      this.calculateTeamResults(finishRankings);
    }
  }

  calculateTeamResults(finishRankings) {
    // finishRankings is array of { name, isPlayer, rank }
    // 1st = 10pts, 2nd = 6pts, 3rd = 4pts, 4th = 2pts
    const pts = [10, 6, 4, 2];
    this.teamScores = { BLUE: 0, RED: 0 };

    finishRankings.forEach((r, idx) => {
      const team = (idx === 0 || idx === 1) ? 'BLUE' : 'RED'; // (Player + Viper vs Shadow + Blaze)
      const points = pts[idx] || 1;
      this.teamScores[team] += points;
    });

    return {
      blueScore: this.teamScores.BLUE,
      redScore: this.teamScores.RED,
      winner: this.teamScores.BLUE > this.teamScores.RED ? 'BLUE' : (this.teamScores.RED > this.teamScores.BLUE ? 'RED' : 'TIE')
    };
  }

  dispose() {
    if (this.ghostCarModel) {
      this.game.scene.remove(this.ghostCarModel.group);
      this.ghostCarModel = null;
    }
  }
}

window.RaceModesManager = RaceModesManager;
