/**
 * FreeRacer - Neon Auto Exchange (v0.7.0)
 * ---------------------------------------------------------------------------
 * A full store for Neon Coast: buy & sell cars, buy & refund part stages.
 * Entry points: the main menu (SHOP button / S key) and the free-roam pause
 * menu (SHOP). Pure UI + economy wiring — all persistence goes through
 * SaveManager and all part pricing through UpgradeSystem, so the shop always
 * agrees with the garage/workshop.
 *
 * Economy rules:
 *   - Buying a car costs its sticker price (same as the showroom).
 *   - Selling a car returns 60% of the sticker price plus 50% of the parts
 *     value invested in it; installed parts are lost on sale.
 *   - Starter-grant cars, your currently-selected car and your last remaining
 *     car cannot be sold.
 *   - Part stages refund 50% of the stage cost, one stage at a time.
 */
(function () {
  const SELL_RATE = 0.6;       // fraction of sticker price returned when selling a car
  const SALVAGE_RATE = 0.5;    // fraction of installed parts value returned when selling a car
  const HARD_GRANT_CARS = ['veloce_v10_corsa', 'falcon_s1']; // permanently unlocked in SaveManager

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => '₡ ' + Math.round(n || 0).toLocaleString();

  class ShopManager {
    constructor() {
      this.isOpen = false;
      this.tab = 'cars';
      this.bound = false;
      this.game = null;
      this.from = 'menu';
      this.onKey = this.onKey.bind(this);
      this.onPanelClick = this.onPanelClick.bind(this);
    }

    ensureBound() {
      if (this.bound) return;
      this.bound = true;
      this.el = $('shop-screen');
      this.cashEl = $('shop-cash');
      this.levelEl = $('shop-level');
      this.subEl = $('shop-sub');
      this.carsPanel = $('shop-cars-panel');
      this.partsPanel = $('shop-parts-panel');
      this.flashEl = $('shop-flash');
      const back = $('btn-shop-back');
      if (back) back.addEventListener('click', () => this.close());
      const tabCars = $('shop-tab-cars');
      const tabParts = $('shop-tab-parts');
      if (tabCars) tabCars.addEventListener('click', () => this.setTab('cars'));
      if (tabParts) tabParts.addEventListener('click', () => this.setTab('parts'));
      if (this.carsPanel) this.carsPanel.addEventListener('click', this.onPanelClick);
      if (this.partsPanel) this.partsPanel.addEventListener('click', this.onPanelClick);
    }

    // ── Open / close ────────────────────────────────────────────────────
    /** @param {object} opts { game, from: 'menu' | 'pause', tab?: 'cars' | 'parts' } */
    open(opts = {}) {
      this.ensureBound();
      if (!this.el) return;
      this.game = opts.game || this.game;
      this.from = opts.from || 'menu';
      this.tab = opts.tab || this.tab || 'cars';
      this.isOpen = true;
      this.el.classList.remove('hidden');
      this.el.style.display = 'flex';
      // Capture phase: swallow Esc / digits before the pause-menu and menu key handlers see them.
      window.addEventListener('keydown', this.onKey, true);
      this.render();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      window.removeEventListener('keydown', this.onKey, true);
      if (this.el) { this.el.classList.add('hidden'); this.el.style.display = 'none'; }
      if (this.from === 'pause' && this.game && this.game.openWorld) {
        // Return to the (still paused) pause menu overlay
        const ow = this.game.openWorld;
        if (ow.dom && ow.dom.pause) ow.dom.pause.classList.remove('hidden');
        ow.pauseMenuOpen = true;
      } else if (this.game && this.game.mainMenu) {
        this.game.mainMenu.showMenu();
      }
    }

    onKey(e) {
      if (!this.isOpen) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.code === 'Digit1') { e.stopPropagation(); this.setTab('cars'); return; }
      if (e.code === 'Digit2') { e.stopPropagation(); this.setTab('parts'); }
    }

    setTab(tab) {
      if (this.tab === tab) return;
      this.tab = tab;
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
      this.render();
    }

    // ── Economy helpers ─────────────────────────────────────────────────
    sellValue(car) {
      const invested = window.UpgradeSystem ? window.UpgradeSystem.totalInvested(car.id) : 0;
      return Math.round((car.price || 0) * SELL_RATE) + Math.round(invested * SALVAGE_RATE / 10) * 10;
    }

    ownedCount() {
      const sm = window.SaveManager;
      if (!sm || !window.CarDatabase) return 0;
      return window.CarDatabase.filter((c) => sm.isCarUnlocked(c.id)).length;
    }

    currentCar() {
      const id = window.SaveManager ? window.SaveManager.getSelectedCarId() : null;
      return id && window.getCarById ? window.getCarById(id) : null;
    }

    // ── Render ──────────────────────────────────────────────────────────
    render() {
      const sm = window.SaveManager;
      const cash = sm ? sm.getCash() : 0;
      if (this.cashEl) this.cashEl.textContent = fmt(cash);
      if (this.levelEl && sm && sm.getLevelInfo) {
        const info = sm.getLevelInfo();
        this.levelEl.textContent = `LV ${info.level} · ${info.title} · ${info.reputation} REP`;
      }
      if (this.subEl) {
        if (this.tab === 'cars') {
          const total = (window.CarDatabase || []).length;
          this.subEl.textContent = `${this.ownedCount()} of ${total} cars in your garage · selling returns 60% of sticker price + 50% of installed parts value · keys 1/2 switch tabs`;
        } else {
          const car = this.currentCar();
          const invested = car && window.UpgradeSystem ? window.UpgradeSystem.totalInvested(car.id) : 0;
          this.subEl.textContent = car
            ? `Fitting parts to your ${car.name} · ${fmt(invested)} invested · refunds pay 50% of the top stage`
            : '';
        }
      }
      const tc = $('shop-tab-cars');
      const tp = $('shop-tab-parts');
      if (tc) tc.classList.toggle('active', this.tab === 'cars');
      if (tp) tp.classList.toggle('active', this.tab === 'parts');
      if (this.carsPanel) this.carsPanel.style.display = this.tab === 'cars' ? '' : 'none';
      if (this.partsPanel) this.partsPanel.style.display = this.tab === 'parts' ? '' : 'none';
      if (this.tab === 'cars') this.renderCars(); else this.renderParts();
    }

    statsHtml(car) {
      let s = null;
      try { s = window.UpgradeSystem ? window.UpgradeSystem.getDisplayStats(car.id) : null; } catch (err) { s = null; }
      s = s || car.stats || {};
      const rows = [['SPD', s.topSpeed || 60], ['ACC', s.acceleration || 60], ['HDL', s.handling || 60]];
      return '<div class="shop-stats">' + rows.map(([k, v]) => `
        <div class="shop-stat"><span class="shop-stat-k">${k}</span>
          <span class="shop-stat-bar"><span class="shop-stat-fill" style="width:${Math.max(2, Math.min(100, v))}%"></span></span>
          <span class="shop-stat-v">${Math.round(v)}</span></div>`).join('') + '</div>';
    }

    renderCars() {
      if (!this.carsPanel) return;
      const sm = window.SaveManager;
      const cash = sm ? sm.getCash() : 0;
      const selectedId = sm ? sm.getSelectedCarId() : null;
      const owned = this.ownedCount();
      this.carsPanel.innerHTML = (window.CarDatabase || []).map((car) => {
        const isOwned = sm ? sm.isCarUnlocked(car.id) : true;
        const isSelected = car.id === selectedId;
        const hardGrant = HARD_GRANT_CARS.includes(car.id) || car.isDefault;
        const price = car.price || 0;
        const invested = window.UpgradeSystem ? window.UpgradeSystem.totalInvested(car.id) : 0;
        const sell = this.sellValue(car);
        let actions = '';
        if (!isOwned) {
          const afford = cash >= price;
          actions = `<button class="ws-btn primary shop-act" data-buy="${car.id}" ${afford ? '' : 'disabled title="Not enough cash"'}>BUY · ${fmt(price)}</button>`;
        } else {
          const bits = [];
          bits.push(isSelected
            ? '<span class="shop-chip current">CURRENT</span>'
            : `<button class="ws-btn shop-act" data-select="${car.id}">SELECT</button>`);
          if (hardGrant) bits.push('<span class="shop-chip dim" title="Starter grant cars are part of your licence and cannot be sold">STARTER GRANT</span>');
          else if (isSelected) bits.push('<span class="shop-chip dim" title="Select another car first — you cannot sell the one you are driving">SELL (select another car first)</span>');
          else if (owned <= 1) bits.push('<span class="shop-chip dim" title="You must keep at least one car">LAST CAR</span>');
          else bits.push(`<button class="ws-btn danger shop-act" data-sell="${car.id}" title="60% sticker + 50% parts salvage; installed parts are lost">SELL · ${fmt(sell)}</button>`);
          actions = bits.join('');
        }
        const priceLine = isOwned
          ? (invested > 0 ? `Parts invested: ${fmt(invested)} · salvage ≈ ${fmt(Math.round(invested * SALVAGE_RATE))}` : 'In your garage')
          : `<span class="shop-price">${fmt(price)}</span>${car.tier ? ` <span class="shop-tier">TIER ${car.tier}</span>` : ''}`;
        return `
        <div class="shop-card ${isOwned ? 'owned' : ''} ${isSelected ? 'current' : ''}">
          <div class="shop-card-head"><span class="shop-card-name">${car.name}</span><span class="shop-card-class">${car.carClass || 'Street'}</span></div>
          <div class="shop-card-mfg">${car.manufacturer || ''}</div>
          ${this.statsHtml(car)}
          <div class="shop-card-foot">${priceLine}</div>
          <div class="shop-card-actions">${actions}</div>
        </div>`;
      }).join('');
    }

    renderParts() {
      if (!this.partsPanel) return;
      const us = window.UpgradeSystem;
      const car = this.currentCar();
      if (!us || !car) {
        this.partsPanel.innerHTML = '<div class="shop-empty">No car selected.</div>';
        return;
      }
      const cash = window.SaveManager ? window.SaveManager.getCash() : 0;
      const parts = us.getParts(car.id);
      const rows = us.catalog.categories.map((cat) => {
        const stage = parts[cat.id] || 0;
        const next = us.getNextStage(car.id, cat.id);
        const nextCost = us.getNextStageCost(car.id, cat.id);
        const refund = us.getUninstallRefund ? us.getUninstallRefund(car.id, cat.id) : null;
        const pips = cat.stages.map((st, i) => `<span class="ws-pip ${i < stage ? 'on' : ''}" title="Stage ${i + 1}: ${st.name}"></span>`).join('');
        let effHtml = '';
        if (next) {
          try {
            const describe = us.constructor.describeEffects;
            if (describe) effHtml = describe.call(us.constructor, next.effects)
              .map((x) => `<span class="shop-eff ${x.good ? 'good' : 'bad'}">${x.label} ${x.value}</span>`).join('');
          } catch (err) { effHtml = ''; }
        }
        const buyBtn = next
          ? `<button class="ws-btn primary shop-act" data-install="${cat.id}" ${cash >= nextCost ? '' : 'disabled title="Not enough cash"'}>BUY S${next.index} · ${fmt(nextCost)}</button>
             <div class="shop-next-name">${next.name}${effHtml ? ' · ' + effHtml : ''}</div>`
          : '<span class="shop-chip">MAXED</span>';
        const refundBtn = refund !== null
          ? `<button class="ws-btn shop-act" data-refund="${cat.id}" title="Removes the top stage and refunds 50% of its cost">REFUND · ${fmt(refund)}</button>`
          : '';
        const stageLabel = stage > 0 ? `Stage ${stage} · ${cat.stages[stage - 1].name}` : 'Stock';
        return `
        <div class="shop-part-row">
          <div class="shop-part-icon">${cat.icon || '⚙'}</div>
          <div class="shop-part-body">
            <div class="shop-part-name">${cat.name}<span class="shop-part-stage">${stageLabel}</span></div>
            <div class="shop-part-blurb">${cat.blurb || ''}</div>
            <div class="shop-part-pips">${pips}</div>
          </div>
          <div class="shop-part-actions">${buyBtn}${refundBtn}</div>
        </div>`;
      }).join('');
      this.partsPanel.innerHTML = rows || '<div class="shop-empty">No parts catalogue available.</div>';
    }

    // ── Transactions ────────────────────────────────────────────────────
    onPanelClick(e) {
      const btn = e.target.closest('[data-buy],[data-select],[data-sell],[data-install],[data-refund]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.buy) this.buyCar(btn.dataset.buy);
      else if (btn.dataset.select) this.selectCar(btn.dataset.select);
      else if (btn.dataset.sell) this.sellCar(btn.dataset.sell);
      else if (btn.dataset.install) this.installStage(btn.dataset.install);
      else if (btn.dataset.refund) this.refundStage(btn.dataset.refund);
    }

    buyCar(id) {
      const sm = window.SaveManager;
      const car = window.getCarById ? window.getCarById(id) : null;
      if (!sm || !car) return;
      if (sm.getCash() < (car.price || 0)) {
        this.flash('Not enough cash for that car.', 'bad');
        if (window.SoundEngine) window.SoundEngine.playBeep(false);
        return;
      }
      sm.spendCash(car.price || 0, `Auto Exchange: bought ${car.name}`);
      sm.unlockCar(id);
      this.flash(`${car.name} purchased — it's waiting in your garage.`, 'good');
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
      this.render();
    }

    selectCar(id) {
      const sm = window.SaveManager;
      if (!sm) return;
      sm.setSelectedCarId(id);
      localStorage.setItem('turbo_rush_selected_car', id); // legacy key kept in sync, as the workshop does
      const car = window.getCarById ? window.getCarById(id) : null;
      this.flash(`${car ? car.name : 'Car'} is now your current car.`, 'good');
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
      this.render();
    }

    sellCar(id) {
      const sm = window.SaveManager;
      const car = window.getCarById ? window.getCarById(id) : null;
      if (!sm || !car) return;
      if (HARD_GRANT_CARS.includes(id) || car.isDefault) { this.flash('Starter grant cars cannot be sold.', 'bad'); return; }
      if (id === sm.getSelectedCarId()) { this.flash('Select another car before selling this one.', 'bad'); return; }
      if (this.ownedCount() <= 1) { this.flash('You need to keep at least one car.', 'bad'); return; }
      const value = this.sellValue(car);
      const invested = window.UpgradeSystem ? window.UpgradeSystem.totalInvested(id) : 0;
      const ok = window.confirm(
        `Sell your ${car.name} for ${fmt(value)}?\n\n` +
        `· 60% of sticker price: ${fmt((car.price || 0) * SELL_RATE)}\n` +
        `· 50% parts salvage: ${fmt(invested * SALVAGE_RATE)}\n\n` +
        `Installed parts are lost with the car.`
      );
      if (!ok) return;
      if (!sm.removeCar(id)) { this.flash('That car cannot be sold.', 'bad'); return; }
      const p = sm.getProfile();
      if (p && p.parts) delete p.parts[id];
      if (p && p.tuning) delete p.tuning[id];
      sm.addCash(value);
      sm.save();
      this.flash(`Sold ${car.name} for ${fmt(value)}.`, 'good');
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
      this.render();
    }

    installStage(catId) {
      const us = window.UpgradeSystem;
      const car = this.currentCar();
      if (!us || !car) return;
      const res = us.install(car.id, catId);
      const cat = us.getCategory(catId);
      const name = cat ? cat.name : catId;
      if (res === 'ok') {
        const stage = us.getParts(car.id)[catId];
        this.flash(`${name} stage ${stage} installed on your ${car.name}.`, 'good');
        if (window.SoundEngine) window.SoundEngine.playBeep(true);
      } else if (res === 'no_cash') {
        this.flash('Not enough cash for that stage.', 'bad');
        if (window.SoundEngine) window.SoundEngine.playBeep(false);
      } else if (res === 'maxed') {
        this.flash(`${name} is already maxed out.`, 'info');
      } else {
        this.flash('Installation failed.', 'bad');
      }
      this.render();
    }

    refundStage(catId) {
      const us = window.UpgradeSystem;
      const car = this.currentCar();
      if (!us || !car || !us.uninstall) return;
      const refund = us.getUninstallRefund ? us.getUninstallRefund(car.id, catId) : null;
      if (refund === null) { this.flash('Nothing to refund in that category.', 'info'); return; }
      const res = us.uninstall(car.id, catId);
      const cat = us.getCategory(catId);
      if (res === 'ok') {
        this.flash(`${cat ? cat.name : catId} stage removed — ${fmt(refund)} refunded.`, 'good');
        if (window.SoundEngine) window.SoundEngine.playBeep(true);
      } else {
        this.flash('Could not refund that stage.', 'bad');
      }
      this.render();
    }

    flash(text, kind = 'info') {
      const el = this.flashEl;
      if (!el) return;
      el.textContent = text;
      el.className = `shop-flash ${kind}`;
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => el.classList.add('hidden'), 3400);
    }
  }

  window.ShopManager = new ShopManager();
})();
