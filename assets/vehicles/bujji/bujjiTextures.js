/**
 * Turbo Rush - Procedural PBR Textures for Bujji Hero Car
 * Generates dynamic high-resolution procedural textures:
 * 1. Brushed Satin Aluminum Armor
 * 2. Carbon-Fiber Weave Monocoque
 * 3. Directional High-Grip Tire Tread with Sidewall Markings
 * 4. OLED Panoramic Dashboard Display & Holographic HUD
 * 5. Original Geometric Hero Badge
 */

(function() {
  const BujjiTextures = {
    /**
     * Procedural Brushed Satin Aluminum Armor Texture
     */
    createBrushedArmorTexture: function() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // Base aluminum tone
      ctx.fillStyle = '#c4ccd6';
      ctx.fillRect(0, 0, 512, 512);

      // Micro-brushed horizontal grain
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const data = imgData.data;
      for (let y = 0; y < 512; y++) {
        const rowNoise = (Math.random() - 0.5) * 18;
        for (let x = 0; x < 512; x++) {
          const idx = (y * 512 + x) * 4;
          const pixelNoise = (Math.random() - 0.5) * 12 + rowNoise;
          data[idx] = Math.min(255, Math.max(0, data[idx] + pixelNoise));
          data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + pixelNoise + 2));
          data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + pixelNoise + 5));
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Structural panel seam lines and fasteners
      ctx.strokeStyle = 'rgba(40, 45, 55, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 8, 496, 496);
      ctx.strokeRect(128, 8, 256, 496);

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    },

    /**
     * Procedural Forged Twill Carbon-Fiber Texture
     */
    createCarbonWeaveTexture: function() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#141619';
      ctx.fillRect(0, 0, 128, 128);

      const tileSize = 8;
      for (let y = 0; y < 128; y += tileSize) {
        for (let x = 0; x < 128; x += tileSize) {
          const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
          ctx.fillStyle = isEven ? '#1e2126' : '#0d0f12';
          ctx.fillRect(x, y, tileSize, tileSize);

          ctx.fillStyle = isEven ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.25)';
          ctx.fillRect(x, y, tileSize, 2);
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(8, 8);
      return tex;
    },

    /**
     * High-Grip Directional Racing Tire Tread Texture
     */
    createTireTreadTexture: function() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      // Tire rubber base
      ctx.fillStyle = '#141517';
      ctx.fillRect(0, 0, 512, 128);

      // Longitudinal water drainage channels
      ctx.fillStyle = '#08090a';
      ctx.fillRect(0, 30, 512, 12);
      ctx.fillRect(0, 58, 512, 14);
      ctx.fillRect(0, 86, 512, 12);

      // Diagonal lateral sipes
      ctx.strokeStyle = '#0a0b0d';
      ctx.lineWidth = 3;
      for (let x = 0; x < 512; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x + 14, 28);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, 100);
        ctx.lineTo(x + 14, 124);
        ctx.stroke();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(4, 1);
      return tex;
    },

    /**
     * Functional Cockpit Panoramic OLED Telemetry Display
     */
    createDashboardDisplayCanvas: function() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      return canvas;
    },

    updateDashboardCanvas: function(canvas, speedKmh, rpm, gear, batteryPercent, nitroPercent) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 1024, 256);

      // Dashboard background
      ctx.fillStyle = 'rgba(6, 10, 18, 0.95)';
      ctx.fillRect(0, 0, 1024, 256);

      // Outer bezel and futuristic grid lines
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, 1012, 244);

      ctx.fillStyle = '#00d8ff';
      ctx.fillRect(6, 6, 200, 4);
      ctx.fillRect(818, 6, 200, 4);

      // Top Vehicle Branding
      ctx.fillStyle = '#a0d8ef';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('BUJJI // ORDNANCE HERO HYBRID AWD', 24, 38);

      // Central Speedometer
      const safeSpeed = Math.max(0, Math.min(150, Math.round(speedKmh || 0)));
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 84px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(safeSpeed), 512, 130);

      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#ff6600';
      ctx.fillText('KM/H (CAP: 150)', 512, 165);

      // Left Gauge: Tachometer & Gear
      ctx.textAlign = 'left';
      ctx.fillStyle = '#88a0b8';
      ctx.font = '16px monospace';
      ctx.fillText('ENGINE V6 TWIN-TURBO', 40, 80);

      const safeRpm = Math.min(8200, Math.round(rpm || 1200));
      ctx.font = 'bold 36px monospace';
      ctx.fillStyle = safeRpm > 7500 ? '#ff2244' : '#00f0ff';
      ctx.fillText(`${safeRpm} RPM`, 40, 125);

      // Tachometer Bar
      ctx.fillStyle = '#1c2230';
      ctx.fillRect(40, 140, 260, 14);
      const rpmFraction = Math.min(1, safeRpm / 8200);
      ctx.fillStyle = safeRpm > 7500 ? '#ff2244' : '#00d8ff';
      ctx.fillRect(40, 140, 260 * rpmFraction, 14);

      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`GEAR ${gear || 1}`, 40, 195);

      // Right Gauge: Hybrid Battery & Nitro Systems
      ctx.textAlign = 'right';
      ctx.fillStyle = '#88a0b8';
      ctx.font = '16px monospace';
      ctx.fillText('ELECTRIC STATOR & NITRO', 984, 80);

      // Battery Bar
      const safeBatt = Math.max(0, Math.min(100, Math.round(batteryPercent !== undefined ? batteryPercent : 100)));
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#00ff88';
      ctx.fillText(`HYBRID SOC: ${safeBatt}%`, 984, 115);
      ctx.fillStyle = '#1c2230';
      ctx.fillRect(724, 125, 260, 12);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(724, 125, 260 * (safeBatt / 100), 12);

      // Nitro Bar
      const safeNitro = Math.max(0, Math.min(100, Math.round(nitroPercent !== undefined ? nitroPercent : 100)));
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#ff6600';
      ctx.fillText(`NITRO CORE: ${safeNitro}%`, 984, 175);
      ctx.fillStyle = '#1c2230';
      ctx.fillRect(724, 185, 260, 12);
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(724, 185, 260 * (safeNitro / 100), 12);

      // Status indicator
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#00ff88';
      ctx.fillText('ARMOR: 100% | ACTIVE AERO: NOMINAL | ALL SYSTEMS GO', 512, 230);
    },

    /**
     * Original Geometric Hero Crest Badge
     */
    createBujjiBadgeCanvas: function() {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');

      // Dark carbon background
      ctx.fillStyle = '#121418';
      ctx.beginPath();
      ctx.arc(64, 64, 60, 0, Math.PI * 2);
      ctx.fill();

      // Outer orange ring
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Inner shield geometry
      ctx.fillStyle = '#c4ccd6';
      ctx.beginPath();
      ctx.moveTo(64, 22);
      ctx.lineTo(98, 42);
      ctx.lineTo(84, 94);
      ctx.lineTo(64, 108);
      ctx.lineTo(44, 94);
      ctx.lineTo(30, 42);
      ctx.closePath();
      ctx.fill();

      // Geometric Hero 'B' Icon
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(50, 36);
      ctx.lineTo(76, 36);
      ctx.lineTo(82, 52);
      ctx.lineTo(72, 62);
      ctx.lineTo(84, 76);
      ctx.lineTo(74, 92);
      ctx.lineTo(50, 92);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#121418';
      ctx.fillRect(58, 44, 14, 12);
      ctx.fillRect(58, 68, 16, 14);

      const tex = new THREE.CanvasTexture(canvas);
      return tex;
    }
  };

  window.BujjiTextures = BujjiTextures;
})();
