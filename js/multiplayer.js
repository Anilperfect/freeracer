/**
 * Client-side Real-Time Multiplayer Manager for Turbo Rush.
 * Connects via WebSocket to manage 2-4 player private rooms, lobby synchronization,
 * team assignment, countdown, and smooth 3D dead reckoning / interpolation.
 */
class MultiplayerClient {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.ws = null;
    this.roomCode = null;
    this.isHost = false;
    this.inMultiplayer = false;
    this.roomState = null;

    // Remote Players: id -> { carModel, targetPos, currentPos, targetQuat, currentQuat, speed, info }
    this.remotePlayers = new Map();
    this.syncInterval = null;

    this.createLobbyUI();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8080';
    this.ws = new WebSocket(`${proto}//${host}`);

    this.ws.onopen = () => {
      console.log('⚡ Connected to Turbo Rush Multiplayer Server');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    this.ws.onclose = () => {
      console.log('Multiplayer connection closed.');
      this.inMultiplayer = false;
    };
  }

  createLobbyUI() {
    this.modal = document.createElement('div');
    this.modal.id = 'mp-lobby-modal';
    this.modal.className = 'screen-overlay hidden';
    this.modal.style.position = 'fixed';
    this.modal.style.inset = '0';
    this.modal.style.background = 'rgba(6, 10, 18, 0.95)';
    this.modal.style.zIndex = '1500';
    this.modal.style.display = 'none';
    this.modal.style.justifyContent = 'center';
    this.modal.style.alignItems = 'center';

    this.modal.innerHTML = `
      <div style="background: rgba(16, 24, 38, 0.95); border: 1px solid #00f0ff; border-radius: 12px; padding: 24px 32px; width: 560px; max-width: 90vw; box-shadow: 0 0 35px rgba(0,240,255,0.25);">
        
        <!-- HEADER -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h2 style="font-family: 'Orbitron', sans-serif; color: #00f0ff; margin: 0; font-size: 20px;">MULTIPLAYER LOBBY</h2>
            <span style="font-size: 11px; color: #88aacc;">PRIVATE ROOM CIRCUIT RACE</span>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #8899aa; font-family: 'Orbitron', sans-serif;">ROOM CODE</div>
            <div id="mp-room-code" style="font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900; color: #ffaa00; letter-spacing: 2px;">----</div>
          </div>
        </div>

        <!-- PLAYER LIST -->
        <div id="mp-player-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; max-height: 220px; overflow-y: auto;"></div>

        <!-- LOBBY SETTINGS (Host Only) -->
        <div id="mp-host-controls" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; margin-bottom: 20px;">
          <div style="display: flex; gap: 12px;">
            <div style="flex: 1;">
              <label style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #a0c0e0; display: block; margin-bottom: 4px;">CIRCUIT</label>
              <select id="mp-track-select" style="width: 100%; background: #0b111d; color: #fff; border: 1px solid #334460; padding: 6px; border-radius: 4px; font-family: 'Orbitron', sans-serif; font-size: 12px;">
                <option value="helios_rift">Helios Rift</option>
                <option value="drowned_meridian">Drowned Meridian</option>
                <option value="thornwild_crown">Thornwild Crown</option>
              </select>
            </div>
            <div style="flex: 1;">
              <label style="font-size: 11px; font-family: 'Orbitron', sans-serif; color: #a0c0e0; display: block; margin-bottom: 4px;">WEATHER</label>
              <select id="mp-weather-select" style="width: 100%; background: #0b111d; color: #fff; border: 1px solid #334460; padding: 6px; border-radius: 4px; font-family: 'Orbitron', sans-serif; font-size: 12px;">
                <option value="clear">Clear Skies</option>
                <option value="rain">Heavy Rain</option>
                <option value="fog">Volumetric Fog</option>
                <option value="lightning">Lightning Storm</option>
                <option value="energy">Energy Storm</option>
                <option value="night">Night Run</option>
              </select>
            </div>
          </div>
        </div>

        <!-- ACTIONS -->
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button id="mp-btn-leave" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 10px 18px; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: 12px; cursor: pointer;">LEAVE</button>
          <div style="display: flex; gap: 10px;">
            <button id="mp-btn-team" style="background: rgba(0, 216, 255, 0.15); border: 1px solid #00d8ff; color: #00f0ff; padding: 10px 16px; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: 12px; cursor: pointer;">SWITCH TEAM</button>
            <button id="mp-btn-ready" style="background: #00f0ff; color: #0a0e17; font-weight: 800; border: none; padding: 10px 24px; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: 12px; cursor: pointer;">READY</button>
            <button id="mp-btn-start" class="hidden" style="background: #00ff88; color: #0a0e17; font-weight: 900; border: none; padding: 10px 24px; border-radius: 6px; font-family: 'Orbitron', sans-serif; font-size: 12px; cursor: pointer;">LAUNCH RACE 🏁</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    document.getElementById('mp-btn-leave').addEventListener('click', () => this.leaveRoom());
    document.getElementById('mp-btn-team').addEventListener('click', () => {
      this.send({ type: 'SWITCH_TEAM' });
    });
    document.getElementById('mp-btn-ready').addEventListener('click', () => {
      this.send({ type: 'TOGGLE_READY' });
    });
    document.getElementById('mp-btn-start').addEventListener('click', () => {
      this.send({ type: 'START_RACE' });
    });

    const trackSel = document.getElementById('mp-track-select');
    const weatherSel = document.getElementById('mp-weather-select');

    trackSel.addEventListener('change', () => {
      this.send({ type: 'UPDATE_LOBBY_SETTINGS', trackId: trackSel.value });
    });
    weatherSel.addEventListener('change', () => {
      this.send({ type: 'UPDATE_LOBBY_SETTINGS', weather: weatherSel.value });
    });
  }

  createRoom(name, carId) {
    this.connect();
    const pr = window.SaveManager ? window.SaveManager.calculatePR(carId) : 520;
    const profile = window.SaveManager ? window.SaveManager.getProfile() : null;
    const cosmetics = (profile && profile.cosmetics && profile.cosmetics[carId]) || {};

    const trySend = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'CREATE_ROOM',
          name,
          carId,
          pr,
          cosmetics
        });
      } else {
        setTimeout(trySend, 100);
      }
    };
    trySend();
  }

  joinRoom(code, name, carId) {
    this.connect();
    const pr = window.SaveManager ? window.SaveManager.calculatePR(carId) : 520;
    const profile = window.SaveManager ? window.SaveManager.getProfile() : null;
    const cosmetics = (profile && profile.cosmetics && profile.cosmetics[carId]) || {};

    const trySend = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'JOIN_ROOM',
          roomCode: code,
          name,
          carId,
          pr,
          cosmetics
        });
      } else {
        setTimeout(trySend, 100);
      }
    };
    trySend();
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this.roomCode = msg.roomCode;
        this.isHost = true;
        this.inMultiplayer = true;
        this.showLobby(msg.roomState);
        break;

      case 'ROOM_STATE':
        this.roomState = msg.roomState;
        this.roomCode = msg.roomState.code;
        this.inMultiplayer = true;
        this.showLobby(msg.roomState);
        break;

      case 'COUNTDOWN_START':
        this.startMultiplayerRace(msg);
        break;

      case 'REMOTE_SYNC':
        this.updateRemotePlayer(msg);
        break;

      case 'ERROR':
        alert(msg.message);
        break;
    }
  }

  showLobby(roomState) {
    this.modal.style.display = 'flex';
    document.getElementById('mp-room-code').textContent = roomState.code;

    const list = document.getElementById('mp-player-list');
    list.innerHTML = roomState.players.map(p => {
      const teamBg = p.team === 'BLUE' ? 'rgba(0,216,255,0.15)' : 'rgba(255,40,60,0.15)';
      const teamCol = p.team === 'BLUE' ? '#00d8ff' : '#ff4466';

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: ${teamBg}; border: 1px solid ${teamCol}; border-radius: 6px; padding: 8px 14px;">
          <div>
            <span style="font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: #fff;">${p.name} ${p.isHost ? '👑' : ''}</span>
            <span style="font-size: 10px; color: ${teamCol}; font-family: 'Orbitron', sans-serif; margin-left: 8px;">[${p.team} TEAM]</span>
            <div style="font-size: 10px; color: #88aacc; font-family: monospace;">${p.carId.toUpperCase()} • ${p.pr} PR</div>
          </div>
          <span style="font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 800; color: ${p.isReady ? '#00ff88' : '#ffaa00'};">
            ${p.isReady ? 'READY ✓' : 'NOT READY'}
          </span>
        </div>
      `;
    }).join('');

    const startBtn = document.getElementById('mp-btn-start');
    const hostControls = document.getElementById('mp-host-controls');

    if (this.isHost) {
      startBtn.classList.remove('hidden');
      hostControls.style.opacity = '1';
      hostControls.style.pointerEvents = 'auto';
    } else {
      startBtn.classList.add('hidden');
      hostControls.style.opacity = '0.5';
      hostControls.style.pointerEvents = 'none';
    }
  }

  startMultiplayerRace(data) {
    this.modal.style.display = 'none';
    this.clearRemoteCars();

    // Start race in game engine with synced track and weather
    this.game.startRaceFromMapSelect(this.game.selectedCarId, data.trackId);

    // Spawn 3D remote cars for all other players
    data.players.forEach(p => {
      if (p.id !== this.ws.id) {
        const car = new window.CarModel(p.cosmetics.color || 0x00f0ff, false, p.carId, 1);
        if (p.cosmetics) car.setCustomization(p.cosmetics);
        this.game.scene.add(car.group);

        this.remotePlayers.set(p.id, {
          carModel: car,
          targetPos: new THREE.Vector3(),
          targetQuat: new THREE.Quaternion(),
          speed: 0,
          info: p
        });
      }
    });

    // Start 20Hz state broadcast
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (!this.game.playerPhysics) return;
      const p = this.game.playerPhysics;
      this.send({
        type: 'SYNC_STATE',
        pos: [p.position.x, p.position.y, p.position.z],
        quat: [p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w],
        speed: p.speed,
        trackU: p.trackU,
        isAirborne: p.isAirborne,
        nitro: p.isNitroActive,
        steer: p.steerAngle
      });
    }, 50);
  }

  updateRemotePlayer(msg) {
    const remote = this.remotePlayers.get(msg.id);
    if (!remote) return;

    remote.targetPos.set(msg.pos[0], msg.pos[1], msg.pos[2]);
    remote.targetQuat.set(msg.quat[0], msg.quat[1], msg.quat[2], msg.quat[3]);
    remote.speed = msg.speed;

    if (remote.carModel) {
      remote.carModel.updateVisuals(msg.speed, msg.steer, false, msg.nitro);
    }
  }

  updateInterpolation(dt) {
    // Smoothly interpolate remote cars to target transforms
    this.remotePlayers.forEach(r => {
      if (!r.carModel) return;
      r.carModel.group.position.lerp(r.targetPos, Math.min(1.0, 18.0 * dt));
      r.carModel.group.quaternion.slerp(r.targetQuat, Math.min(1.0, 18.0 * dt));
    });
  }

  clearRemoteCars() {
    this.remotePlayers.forEach(r => {
      if (r.carModel) this.game.scene.remove(r.carModel.group);
    });
    this.remotePlayers.clear();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  leaveRoom() {
    this.modal.style.display = 'none';
    this.clearRemoteCars();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.inMultiplayer = false;
    this.game.returnToWorkshop();
  }
}

window.MultiplayerClient = MultiplayerClient;
