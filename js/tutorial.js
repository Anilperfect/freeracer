/**
 * Interactive Driver Academy / Tutorial System for Turbo Rush.
 * Guides new racers through 5 progressive interactive lessons:
 * 1. Acceleration & Precision Steering
 * 2. High-Speed Cornering & Track Banking
 * 3. Nitro Boost Injection & Speed Clamping
 * 4. Bridge Jumps & Mid-Air Attitude Control
 * 5. Track Recovery, Camera Switching & Checkpoints
 */
class TutorialManager {
  constructor(gameEngine) {
    this.game = gameEngine;
    this.active = false;
    this.stepIndex = 0;
    this.stepTimer = 0;

    this.steps = [
      {
        title: "STEP 1: ACCELERATION & STEERING",
        instructions: "Press [W / ↑] to accelerate your sports car, and [A/D / ←→] to steer.",
        check: (p) => Math.abs(p.speed) > 18.0,
        goalText: "Reach 60 KM/H"
      },
      {
        title: "STEP 2: CORNERING & BANKING",
        instructions: "Maintain throttle through corners. Steer smoothly through the banked turns.",
        check: (p) => p.trackU > 0.35,
        goalText: "Drive through the banked canyon curve"
      },
      {
        title: "STEP 3: NITRO BOOST ACTIVATION",
        instructions: "Collect glowing cyan canisters or press [SHIFT / NITRO] for high-acceleration boost up to 150 KM/H!",
        check: (p) => p.isNitroActive,
        goalText: "Activate Nitro Boost"
      },
      {
        title: "STEP 4: BRIDGE JUMPS & ATTITUDE",
        instructions: "Launch across the road gap. Use [W/S] and [A/D] to stabilize your attitude while airborne.",
        check: (p) => p.isAirborne && p.airTime > 0.8,
        goalText: "Launch across the road gap"
      },
      {
        title: "STEP 5: TRACK RECOVERY & CAMERA VIEWS",
        instructions: "Suspension absorbs landing impact. Press [C] to toggle Cockpit view, and [R] to respawn.",
        check: (p) => !p.isAirborne && p.trackU > 0.70,
        goalText: "Touchdown safely on road circuit"
      }
    ];

    this.createOverlay();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'tutorial-hud';
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '75px';
    this.overlay.style.left = '50%';
    this.overlay.style.transform = 'translateX(-50%)';
    this.overlay.style.background = 'rgba(10, 16, 28, 0.92)';
    this.overlay.style.border = '1px solid #00f0ff';
    this.overlay.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.35)';
    this.overlay.style.borderRadius = '8px';
    this.overlay.style.padding = '14px 24px';
    this.overlay.style.textAlign = 'center';
    this.overlay.style.zIndex = '1200';
    this.overlay.style.display = 'none';
    this.overlay.style.minWidth = '340px';
    this.overlay.style.maxWidth = '550px';

    this.overlay.innerHTML = `
      <div id="tut-title" style="font-family: 'Orbitron', sans-serif; font-size: 14px; color: #00f0ff; font-weight: 800; letter-spacing: 1px; margin-bottom: 6px;"></div>
      <div id="tut-desc" style="font-size: 13px; color: #d0e0f0; margin-bottom: 10px; line-height: 1.4;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span id="tut-goal" style="font-family: 'Orbitron', sans-serif; font-size: 11px; color: #ffaa00; font-weight: 700;"></span>
        <button id="tut-skip" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-family: 'Orbitron', sans-serif; cursor: pointer;">SKIP TUTORIAL ✕</button>
      </div>
    `;

    document.body.appendChild(this.overlay);

    document.getElementById('tut-skip').addEventListener('click', () => {
      this.stopTutorial();
    });
  }

  startTutorial() {
    this.active = true;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.overlay.style.display = 'block';
    this.showCurrentStep();

    if (window.SoundEngine) {
      window.SoundEngine.playBeep(true);
    }
  }

  showCurrentStep() {
    if (this.stepIndex >= this.steps.length) {
      this.completeTutorial();
      return;
    }

    const step = this.steps[this.stepIndex];
    document.getElementById('tut-title').textContent = step.title;
    document.getElementById('tut-desc').textContent = step.instructions;
    document.getElementById('tut-goal').textContent = 'GOAL: ' + step.goalText;
  }

  update(dt, playerPhysics) {
    if (!this.active || !playerPhysics) return;

    this.stepTimer += dt;
    const step = this.steps[this.stepIndex];

    if (step && step.check(playerPhysics)) {
      this.stepIndex++;
      if (window.SoundEngine) window.SoundEngine.playBeep(true);
      this.showCurrentStep();
    }
  }

  completeTutorial() {
    this.active = false;
    document.getElementById('tut-title').textContent = '🎉 ACADEMY COMPLETE!';
    document.getElementById('tut-desc').textContent = 'You are now certified for competitive circuit racing!';
    document.getElementById('tut-goal').textContent = 'PROCEED TO RACE';

    if (window.SaveManager) {
      window.SaveManager.getProfile().tutorialCompleted = true;
      window.SaveManager.save();
    }

    setTimeout(() => {
      this.overlay.style.display = 'none';
    }, 4000);
  }

  stopTutorial() {
    this.active = false;
    this.overlay.style.display = 'none';
  }
}

window.TutorialManager = TutorialManager;
