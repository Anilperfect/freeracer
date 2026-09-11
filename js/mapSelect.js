/**
 * Turbo Rush - Map Selection Manager
 * Premium map selection screen with animated cards, per-map theming,
 * and smooth transitions between the Workshop and the race.
 */

class MapSelectManager {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.screen = document.getElementById('map-select-screen');

    this.allMaps = window.MapDatabase;
    this.selectedIndex = 0;
    this.selectedMapId = localStorage.getItem('turbo_rush_selected_map') || 'emerald_highway';
    this.selectedCarId = null;

    // Find saved index
    const savedIdx = this.allMaps.findIndex(m => m.id === this.selectedMapId);
    if (savedIdx >= 0) this.selectedIndex = savedIdx;

    // UI references
    this.ui = {
      heroImage: document.getElementById('ms-hero-image'),
      heroOverlay: document.getElementById('ms-hero-overlay'),
      mapName: document.getElementById('ms-map-name'),
      mapSubtitle: document.getElementById('ms-map-subtitle'),
      mapDesc: document.getElementById('ms-map-desc'),
      mapDifficulty: document.getElementById('ms-difficulty'),
      mapSize: document.getElementById('ms-size'),
      tagContainer: document.getElementById('ms-tags'),
      mapStyle: document.getElementById('ms-style'),
      cardContainer: document.getElementById('ms-card-container'),
      btnBack: document.getElementById('ms-btn-back'),
      btnStart: document.getElementById('ms-btn-start')
    };

    this.cards = [];
    this.buildCards();
    this.bindEvents();
  }

  buildCards() {
    this.ui.cardContainer.innerHTML = '';
    this.cards = [];

    this.allMaps.forEach((map, idx) => {
      const card = document.createElement('div');
      card.className = 'ms-card';
      card.dataset.index = idx;

      card.innerHTML = `
        <div class="ms-card-thumb" style="background-image: url('${map.cardImage}')"></div>
        <div class="ms-card-info">
          <div class="ms-card-name">${map.name}</div>
          <div class="ms-card-diff">${map.difficulty}</div>
        </div>
        <div class="ms-card-accent" style="background: ${map.accent.primary}"></div>
      `;

      card.addEventListener('click', () => this.selectMap(idx));
      this.ui.cardContainer.appendChild(card);
      this.cards.push(card);
    });
  }

  bindEvents() {
    this.ui.btnBack.addEventListener('click', () => this.goBack());
    this.ui.btnStart.addEventListener('click', () => this.startRace());

    // Keyboard navigation
    this._keyHandler = (e) => {
      if (this.screen.classList.contains('hidden')) return;
      if (this.screen.style.display === 'none') return;

      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        this.selectMap((this.selectedIndex - 1 + this.allMaps.length) % this.allMaps.length);
        if (window.SoundEngine) window.SoundEngine.playBeep(false);
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.selectMap((this.selectedIndex + 1) % this.allMaps.length);
        if (window.SoundEngine) window.SoundEngine.playBeep(false);
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.startRace();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.goBack();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  enterMapSelect(selectedCarId) {
    this.selectedCarId = selectedCarId;
    this.screen.style.display = 'flex';
    this.screen.classList.remove('hidden');

    this.selectMap(this.selectedIndex);
  }

  selectMap(idx) {
    this.selectedIndex = idx;
    const map = this.allMaps[idx];
    this.selectedMapId = map.id;
    localStorage.setItem('turbo_rush_selected_map', map.id);

    // Update hero background
    this.ui.heroImage.style.backgroundImage = `url('${map.cardImage}')`;

    // Update accent colors on the screen
    this.screen.style.setProperty('--map-accent', map.accent.primary);
    this.screen.style.setProperty('--map-glow', map.accent.glow);
    this.screen.style.setProperty('--map-energy', map.accent.energy);

    // Update info panel
    this.ui.mapName.textContent = map.name;
    this.ui.mapSubtitle.textContent = map.subtitle;
    this.ui.mapDesc.textContent = map.description;
    this.ui.mapDifficulty.textContent = map.difficulty;
    this.ui.mapSize.textContent = map.size;
    this.ui.mapStyle.textContent = map.recommendedStyle;

    // Tags
    this.ui.tagContainer.innerHTML = '';
    map.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'ms-tag';
      chip.textContent = tag;
      this.ui.tagContainer.appendChild(chip);
    });

    // Highlight active card
    this.cards.forEach((card, i) => {
      card.classList.toggle('active', i === idx);
    });

    // Animate hero overlay pulse
    this.ui.heroOverlay.style.background = `
      radial-gradient(ellipse at 30% 80%, ${map.accent.glow} 0%, transparent 60%),
      linear-gradient(180deg, rgba(6,9,17,0.3) 0%, rgba(6,9,17,0.85) 100%)
    `;
  }

  goBack() {
    this.screen.classList.add('hidden');
    setTimeout(() => {
      this.screen.style.display = 'none';
      // Return to workshop
      this.game.returnToWorkshop();
    }, 300);
  }

  startRace() {
    if (window.SoundEngine) window.SoundEngine.playBeep(true);

    const modeSelect = document.getElementById('ms-mode-select');
    const weatherSelect = document.getElementById('ms-weather-select');
    const selectedMode = modeSelect ? modeSelect.value : 'arcade';
    const selectedWeather = weatherSelect ? weatherSelect.value : 'clear';

    this.screen.classList.add('hidden');
    setTimeout(() => {
      this.screen.style.display = 'none';
      this.game.startRaceFromMapSelect(this.selectedCarId, this.selectedMapId, selectedMode, selectedWeather);
    }, 400);
  }
}

// Bind multiplayer button when ready
window.addEventListener('DOMContentLoaded', () => {
  const mpBtn = document.getElementById('btn-open-multiplayer');
  if (mpBtn) {
    mpBtn.addEventListener('click', () => {
      if (window.Game && window.Game.multiplayer) {
        window.Game.multiplayer.openLobbyModal();
      }
    });
  }
});

window.MapSelectManager = MapSelectManager;
