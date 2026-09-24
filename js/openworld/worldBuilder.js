/**
 * FreeRacer - World Builder
 * ---------------------------------------------------------------------------
 * Turns a district definition + RoadNetwork into meshes:
 *   roads, intersections, lane markings, sidewalk slabs, procedurally filled
 *   building blocks with emissive windows and neon signage, street lights,
 *   landmarks, boundaries, water and a dusk sky dome.
 * Everything static is merged into a handful of batched BufferGeometries.
 * Also fills a CollisionGrid and exposes ground-height / surface queries.
 */
(function () {
  // ────────────────────────────────────────────────────────────────────────
  // Small deterministic RNG so the city is identical every load
  // ────────────────────────────────────────────────────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Geometry batcher: accumulates quads into one BufferGeometry
  // ────────────────────────────────────────────────────────────────────────
  class GeometryBatcher {
    constructor(useColor = true) {
      this.positions = [];
      this.normals = [];
      this.uvs = [];
      this.colors = [];
      this.indices = [];
      this.useColor = useColor;
      this.vertexCount = 0;
    }

    /** Quad from 4 corners (counter-clockwise seen from the normal side). */
    addQuad(p0, p1, p2, p3, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], color = [1, 1, 1]) {
      const base = this.vertexCount;
      [p0, p1, p2, p3].forEach((p, i) => {
        this.positions.push(p[0], p[1], p[2]);
        this.normals.push(n[0], n[1], n[2]);
        this.uvs.push(uv[i][0], uv[i][1]);
        if (this.useColor) this.colors.push(color[0], color[1], color[2]);
      });
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.vertexCount += 4;
    }

    /** Triangle helper */
    addTri(p0, p1, p2, n, color = [1, 1, 1]) {
      const base = this.vertexCount;
      [p0, p1, p2].forEach((p, i) => {
        this.positions.push(p[0], p[1], p[2]);
        this.normals.push(n[0], n[1], n[2]);
        this.uvs.push(i === 1 ? 1 : 0, i === 2 ? 1 : 0);
        if (this.useColor) this.colors.push(color[0], color[1], color[2]);
      });
      this.indices.push(base, base + 1, base + 2);
      this.vertexCount += 3;
    }

    /** Horizontal quad (facing +Y) covering [x0,x1]×[z0,z1] at height y. */
    addFloor(x0, z0, x1, z1, y, uvScale = 1, color = [1, 1, 1]) {
      const u1 = (x1 - x0) / uvScale;
      const v1 = (z1 - z0) / uvScale;
      this.addQuad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0],
        [[0, 0], [0, v1], [u1, v1], [u1, 0]], color);
    }

    /**
     * Four outward-facing walls of an axis-aligned box.
     * uvScale = [metres per U repeat, metres per V repeat]
     */
    addWalls(x0, z0, x1, z1, y0, y1, uvScale = [1, 1], color = [1, 1, 1], uvOffset = 0) {
      const h = y1 - y0;
      const w = x1 - x0;
      const d = z1 - z0;
      const vv = h / uvScale[1];
      const uW = w / uvScale[0];
      const uD = d / uvScale[0];
      const o = uvOffset;
      // -Z face (front when looking toward +Z)
      this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1],
        [[o, 0], [o + uW, 0], [o + uW, vv], [o, vv]], color);
      // +Z face
      this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1],
        [[o, 0], [o + uW, 0], [o + uW, vv], [o, vv]], color);
      // -X face
      this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0],
        [[o, 0], [o + uD, 0], [o + uD, vv], [o, vv]], color);
      // +X face
      this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0],
        [[o, 0], [o + uD, 0], [o + uD, vv], [o, vv]], color);
    }

    addBox(x0, y0, z0, x1, y1, z1, color = [1, 1, 1], uvScale = [1, 1]) {
      this.addWalls(x0, z0, x1, z1, y0, y1, uvScale, color);
      this.addFloor(x0, z0, x1, z1, y1, uvScale[0], color);
      // bottom (rarely visible, keeps boxes closed for shadows)
      this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], undefined, color);
    }

    /** Strip along a polyline (points {x,z}) of given width; V follows distance. */
    addStrip(points, width, y, uvLen = 8, color = [1, 1, 1]) {
      const hw = width * 0.5;
      let dist = 0;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l = Math.hypot(dx, dz) || 1;
        const rx = -dz / l * hw;
        const rz = dx / l * hw;
        const v0 = dist / uvLen;
        const v1 = (dist + l) / uvLen;
        this.addQuad(
          [a.x - rx, y, a.z - rz], [a.x + rx, y, a.z + rz],
          [b.x + rx, y, b.z + rz], [b.x - rx, y, b.z - rz],
          [0, 1, 0], [[0, v0], [1, v0], [1, v1], [0, v1]], color);
        dist += l;
      }
    }

    /** Oriented flat rectangle centred at (cx,cz), length along direction (dx,dz). */
    addOrientedRect(cx, cz, dx, dz, length, width, y, color = [1, 1, 1]) {
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const fx = dx * length * 0.5; const fz = dz * length * 0.5;
      const rx = -dz * width * 0.5; const rz = dx * width * 0.5;
      this.addQuad(
        [cx - fx - rx, y, cz - fz - rz], [cx - fx + rx, y, cz - fz + rz],
        [cx + fx + rx, y, cz + fz + rz], [cx + fx - rx, y, cz + fz - rz],
        [0, 1, 0], undefined, color);
    }

    /** Vertical rectangle in the plane facing normal (nx,0,nz), centred at (cx,cy,cz). */
    addBillboard(cx, cy, cz, nx, nz, width, height, color = [1, 1, 1]) {
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      // right vector along the wall = rotate the normal by 90°
      const rx = nz * width * 0.5; const rz = -nx * width * 0.5;
      const hh = height * 0.5;
      this.addQuad(
        [cx - rx, cy - hh, cz - rz], [cx + rx, cy - hh, cz + rz],
        [cx + rx, cy + hh, cz + rz], [cx - rx, cy + hh, cz - rz],
        [nx, 0, nz], undefined, color);
    }

    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
      if (this.useColor) geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
      geo.setIndex(this.indices);
      geo.computeBoundingSphere();
      return geo;
    }

    get isEmpty() { return this.vertexCount === 0; }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Procedural textures
  // ────────────────────────────────────────────────────────────────────────
  const TextureFactory = {
    canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    },

    asphalt(rng) {
      const c = this.canvas(256, 256);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#2a2d33';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const v = 30 + Math.floor(rng() * 40);
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
        ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    },

    paving(rng, base = '#5c6068', line = '#4a4e55', cell = 32) {
      const c = this.canvas(256, 256);
      const ctx = c.getContext('2d');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1400; i++) {
        const v = rng() * 18 - 9;
        ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 90})`;
        ctx.fillRect(rng() * 256, rng() * 256, 3, 3);
      }
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += cell) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    },

    /**
     * Facade with a window grid. One texture = 8 windows wide × 16 tall.
     * style: 'office' | 'residential' | 'glass'
     */
    facade(rng, style) {
      const c = this.canvas(256, 512);
      const ctx = c.getContext('2d');
      const palette = {
        office: { wall: ['#0c1017', '#11161e', '#0e1218'], lit: ['#cfe3ff', '#e8f1ff', '#9fc6ff', '#ffe9c4'], p: 0.55, dark: '#070a10' },
        residential: { wall: ['#161311', '#1b1713', '#14120f'], lit: ['#ffd9a0', '#ffc27a', '#ffe6bf', '#ffb36b'], p: 0.38, dark: '#0a0806' },
        glass: { wall: ['#071018', '#08141d', '#061219'], lit: ['#7fdcff', '#a9ecff', '#4fc3f7', '#e0f7ff'], p: 0.68, dark: '#03080d' }
      }[style] || null;
      const pal = palette || { wall: ['#101318'], lit: ['#ffffff'], p: 0.5, dark: '#05070a' };
      ctx.fillStyle = pal.wall[Math.floor(rng() * pal.wall.length)];
      ctx.fillRect(0, 0, 256, 512);
      // subtle vertical mullions
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 2, 512);
      const cols = 8; const rows = 16;
      const cw = 256 / cols; const ch = 512 / rows;
      const wPad = style === 'glass' ? 3 : 6;
      const hPad = style === 'glass' ? 3 : 7;
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          const lit = rng() < pal.p;
          if (lit) {
            const colr = pal.lit[Math.floor(rng() * pal.lit.length)];
            ctx.fillStyle = colr;
            ctx.globalAlpha = 0.55 + rng() * 0.45;
          } else {
            ctx.fillStyle = pal.dark;
            ctx.globalAlpha = 1;
          }
          ctx.fillRect(col * cw + wPad, r * ch + hPad, cw - wPad * 2, ch - hPad * 2);
        }
      }
      ctx.globalAlpha = 1;
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    },

    /** Simple text sign texture (neon on dark). */
    textSign(text, color = '#00f0ff', w = 512, h = 128) {
      const c = this.canvas(w, h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#05070c';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `900 ${Math.floor(h * 0.55)}px Orbitron, Inter, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, h / 2 + 4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.fillText(text, w / 2, h / 2 + 4);
      const t = new THREE.CanvasTexture(c);
      return t;
    }
  };

  const NEON_PALETTE = [
    [0.0, 0.94, 1.0], [1.0, 0.0, 0.55], [1.0, 0.45, 0.05], [0.55, 1.0, 0.2],
    [0.62, 0.2, 1.0], [1.0, 0.85, 0.2], [0.1, 1.0, 0.7], [1.0, 0.25, 0.3]
  ];

  // ────────────────────────────────────────────────────────────────────────
  // World builder
  // ────────────────────────────────────────────────────────────────────────
  class WorldBuilder {
    constructor(scene, district, network, quality = 'high') {
      this.scene = scene;
      this.district = district;
      this.network = network;
      this.quality = quality;
      this.group = new THREE.Group();
      this.group.name = 'OpenWorld_' + district.id;
      this.collision = new window.CollisionGrid(40);
      this.rng = mulberry32(1337);
      this.textures = {};
      this.materials = {};
      this.meshes = [];
      this.slabs = [];           // raised sidewalk rectangles
      this.ramps = [];           // stunt ramps for ground height
      this.buildings = [];       // {x0,z0,x1,z1,h} for minimap / queries
      this.streetLightCount = 0;
      this.stats = { drawCalls: 0, buildings: 0 };

      this.build();
      this.scene.add(this.group);
    }

    // ── Public queries ────────────────────────────────────────────────────
    getGroundHeight(x, z) {
      let h = 0;
      for (let i = 0; i < this.ramps.length; i++) {
        const r = this.ramps[i];
        const lx = x - r.x; const lz = z - r.z;
        const u = lx * r.fx + lz * r.fz;   // along ramp
        const v = lx * r.rx + lz * r.rz;   // across
        if (u >= 0 && u <= r.length && Math.abs(v) <= r.width * 0.5) {
          return r.height * (u / r.length);
        }
      }
      // sidewalk slab?
      if (this.isOnSlab(x, z)) h = 0.12;
      return h;
    }

    isOnSlab(x, z) {
      const s = this.slabs;
      for (let i = 0; i < s.length; i++) {
        const r = s[i];
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
      }
      return false;
    }

    /** 'asphalt' | 'plaza' | 'sidewalk' | 'boardwalk' | 'sand' | 'offroad' */
    surfaceAt(x, z) {
      const d = this.district;
      const p = d.plaza;
      const surf = this.network.surfaceAt(x, z);
      if (surf.type === 'asphalt') return 'asphalt';
      if (p && x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return 'plaza';
      if (d.waterfront && z >= d.waterfront.boardwalkFrom) return 'boardwalk';
      if (d.beach && z >= d.beach.from) return 'sand';
      if (this.isOnSlab(x, z)) return 'sidewalk';
      return 'offroad';
    }

    // ── Build pipeline ───────────────────────────────────────────────────
    build() {
      const rng = this.rng;
      this.textures.asphalt = TextureFactory.asphalt(rng);
      this.textures.paving = TextureFactory.paving(rng);
      this.textures.plaza = TextureFactory.paving(rng, '#3b4a5c', '#2d3946', 64);
      this.textures.facade = {
        office: TextureFactory.facade(rng, 'office'),
        residential: TextureFactory.facade(rng, 'residential'),
        glass: TextureFactory.facade(rng, 'glass')
      };

      this.buildSky();
      this.buildGroundAndWater();
      this.buildRoads();
      this.buildBlocks();
      this.buildLandmarks();
      this.buildGarage();
      this.buildRamps();
      this.buildBoundaries();
      this.buildVista();
      this.buildStreetLights();
      this.flushBatches();
    }

    // Batches are created lazily by key so styles can be added anywhere.
    batch(key, useColor = true) {
      if (!this._batches) this._batches = new Map();
      if (!this._batches.has(key)) this._batches.set(key, new GeometryBatcher(useColor));
      return this._batches.get(key);
    }

    flushBatches() {
      const mk = (key, material, castShadow = false, receiveShadow = true) => {
        const b = this._batches.get(key);
        if (!b || b.isEmpty) return;
        const mesh = new THREE.Mesh(b.build(), material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.name = 'batch_' + key;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.meshes.push(mesh);
        this.stats.drawCalls++;
      };

      const asphaltMat = new THREE.MeshStandardMaterial({ map: this.textures.asphalt, color: 0xbfc3c8, roughness: 0.92, metalness: 0.05, vertexColors: true });
      const pavingMat = new THREE.MeshStandardMaterial({ map: this.textures.paving, color: 0xd8dadd, roughness: 0.96, metalness: 0.02, vertexColors: true });
      const plazaMat = new THREE.MeshStandardMaterial({ map: this.textures.plaza, color: 0xdadfe6, roughness: 0.8, metalness: 0.08, vertexColors: true });
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.9, vertexColors: true });
      const markingMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.85, metalness: 0.2, vertexColors: true });
      const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0x3a404b, roughness: 0.7, metalness: 0.3, vertexColors: true });
      const propMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6, metalness: 0.5, vertexColors: true });
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.95, vertexColors: true });

      const facadeMat = (style) => new THREE.MeshStandardMaterial({
        map: this.textures.facade[style],
        emissiveMap: this.textures.facade[style],
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.85,
        color: 0xffffff,
        roughness: 0.55,
        metalness: 0.35,
        vertexColors: true
      });

      this.materials = { asphaltMat, pavingMat, plazaMat, curbMat, markingMat, roofMat, neonMat, barrierMat, propMat, foliageMat };

      mk('road', asphaltMat, false, true);
      mk('paving', pavingMat, false, true);
      mk('plaza', plazaMat, false, true);
      mk('curb', curbMat, false, true);
      mk('marking', markingMat, false, false);
      mk('walls_office', facadeMat('office'), true, true);
      mk('walls_residential', facadeMat('residential'), true, true);
      mk('walls_glass', facadeMat('glass'), true, true);
      mk('roof', roofMat, true, true);
      mk('neon', neonMat, false, false);
      mk('barrier', barrierMat, true, true);
      mk('prop', propMat, true, true);
      mk('foliage', foliageMat, true, true);
    }

    // ── Sky, ground, water ───────────────────────────────────────────────
    buildSky() {
      const geo = new THREE.SphereGeometry(2600, 24, 12);
      const pos = geo.attributes.position;
      const colors = [];
      const top = new THREE.Color(0x0a0b2a);
      const mid = new THREE.Color(0x3a1d5c);
      const horizon = new THREE.Color(0xff7a3d);
      const below = new THREE.Color(0x120a1a);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 2600;
        let c;
        if (y > 0.35) c = top.clone().lerp(mid, THREE.MathUtils.clamp((1 - y) / 0.65, 0, 1) * 0.6);
        else if (y > 0.02) c = mid.clone().lerp(horizon, THREE.MathUtils.clamp((0.35 - y) / 0.33, 0, 1));
        else c = horizon.clone().lerp(below, THREE.MathUtils.clamp(-y / 0.25, 0, 1));
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
      const sky = new THREE.Mesh(geo, mat);
      sky.name = 'skyDome';
      sky.renderOrder = -10;
      this.sky = sky;
      this.group.add(sky);
      this.stats.drawCalls++;

      // A low "sun" glow on the horizon for the dusk look
      const sunGeo = new THREE.CircleGeometry(160, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false, transparent: true, opacity: 0.85, depthWrite: false });
      const sun = new THREE.Mesh(sunGeo, sunMat);
      sun.position.set(1400, 120, -1900);
      sun.lookAt(0, 100, 0);
      this.group.add(sun);
    }

    buildGroundAndWater() {
      const b = this.district.bounds;
      const theme = this.district.theme || {};
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(4000, 4000),
        new THREE.MeshStandardMaterial({ color: theme.ground !== undefined ? theme.ground : 0x14171d, roughness: 1.0, metalness: 0.0 })
      );
      ground.rotation.x = -Math.PI * 0.5;
      ground.position.y = -0.05;
      ground.receiveShadow = true;
      ground.name = 'ground';
      this.group.add(ground);
      this.stats.drawCalls++;

      if (this.district.waterfront) {
        const wz = this.district.waterfront.z;
        const water = new THREE.Mesh(
          new THREE.PlaneGeometry(4000, 2200),
          new THREE.MeshStandardMaterial({ color: 0x0a2236, roughness: 0.18, metalness: 0.85, emissive: 0x03101c, emissiveIntensity: 0.6 })
        );
        water.rotation.x = -Math.PI * 0.5;
        water.position.set(0, -1.2, wz + 1100);
        water.name = 'water';
        this.group.add(water);
        this.water = water;
        this.stats.drawCalls++;

        // Boardwalk deck between the loop and the seawall
        const deck = this.batch('paving');
        deck.addFloor(b.minX, this.district.waterfront.boardwalkFrom, b.maxX, wz, 0.12, 6, [0.78, 0.7, 0.6]);
        // deck front edge
        const curb = this.batch('curb');
        curb.addQuad([b.minX, 0, this.district.waterfront.boardwalkFrom], [b.maxX, 0, this.district.waterfront.boardwalkFrom],
          [b.maxX, 0.12, this.district.waterfront.boardwalkFrom], [b.minX, 0.12, this.district.waterfront.boardwalkFrom], [0, 0, -1], undefined, [0.9, 0.9, 0.9]);
        this.slabs.push({ x0: b.minX, z0: this.district.waterfront.boardwalkFrom, x1: b.maxX, z1: wz });
      }

      // Sandy beach apron (coastal districts): a sand-tinted floor just above
      // the ground plane so roads/markings still render on top of it.
      if (this.district.beach) {
        const from = this.district.beach.from;
        const to = this.district.waterfront ? this.district.waterfront.boardwalkFrom : b.maxZ;
        const sand = this.batch('paving');
        sand.addFloor(b.minX, from, b.maxX, to, -0.02, 4, [0.92, 0.78, 0.55]);
      }
    }

    // ── Roads ────────────────────────────────────────────────────────────
    buildRoads() {
      const road = this.batch('road');
      const marking = this.batch('marking');
      const LW = window.RoadNetwork.LANE_WIDTH;
      const white = [0.92, 0.92, 0.95];
      const yellow = [1.0, 0.75, 0.15];
      const roadTint = [1, 1, 1];
      const alleyTint = [0.7, 0.72, 0.75];

      this.network.edges.forEach((e) => {
        const isAlley = e.type === 'alley';
        road.addStrip(e.points, e.width, 0.0, 8, isAlley ? alleyTint : roadTint);
        if (isAlley) return;

        // centre line (double yellow) for two-way roads
        if (!e.oneWay) {
          const c1 = this.network.offsetPolyline(e.points, 0.18);
          const c2 = this.network.offsetPolyline(e.points, -0.18);
          marking.addStrip(c1, 0.12, 0.025, 8, yellow);
          marking.addStrip(c2, 0.12, 0.025, 8, yellow);
        }
        // edge lines
        marking.addStrip(this.network.offsetPolyline(e.points, e.halfWidth - 0.35), 0.12, 0.025, 8, white);
        marking.addStrip(this.network.offsetPolyline(e.points, -(e.halfWidth - 0.35)), 0.12, 0.025, 8, white);

        // dashed lane dividers
        for (let k = 1; k < e.lanes; k++) {
          [1, -1].forEach((side) => {
            const line = this.network.offsetPolyline(e.points, side * LW * k);
            this.addDashes(marking, line, 3.0, 9.0, 0.12, white);
          });
        }

        // crosswalks + stop lines at both ends
        this.addCrossing(marking, e, true);
        this.addCrossing(marking, e, false);
      });

      // Intersection patches
      this.network.nodes.forEach((n) => {
        if (n.edges.length === 0) return;
        const r = n.radius + 0.05;
        road.addFloor(n.x - r, n.z - r, n.x + r, n.z + r, 0.0, 8, roadTint);
      });
    }

    addDashes(batch, line, dashLen, period, width, color) {
      const total = line.length2;
      for (let s = period * 0.5; s < total - dashLen; s += period) {
        const p = window.RoadNetwork.sampleLane(line, s);
        const q = window.RoadNetwork.sampleLane(line, s + dashLen);
        if (!p || !q) continue;
        batch.addOrientedRect((p.x + q.x) * 0.5, (p.z + q.z) * 0.5, q.x - p.x, q.z - p.z, dashLen, width, 0.025, color);
      }
    }

    addCrossing(batch, e, atStart) {
      const node = atStart ? e.a : e.b;
      if (node.edges.length < 3) return;
      const pts = e.points;
      const p = atStart ? pts[0] : pts[pts.length - 1];
      const q = atStart ? pts[1] : pts[pts.length - 2];
      let dx = q.x - p.x; let dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l; // pointing into the edge, away from the node
      const rx = -dz; const rz = dx;
      const stripes = Math.floor((e.width - 1.0) / 1.3);
      const startOff = -(stripes - 1) * 0.65;
      for (let i = 0; i < stripes; i++) {
        const off = startOff + i * 1.3;
        const cx = p.x + dx * 2.6 + rx * off;
        const cz = p.z + dz * 2.6 + rz * off;
        batch.addOrientedRect(cx, cz, dx, dz, 3.0, 0.7, 0.026, [0.9, 0.9, 0.92]);
      }
      // stop line across the driver's-right carriageway (traffic approaching the node)
      // traffic approaching node travels along -d; its right is rightOf(-d) = (dz, -dx)
      const sx = dz; const sz = -dx;
      const hw = e.halfWidth;
      const cx = p.x + dx * 5.2 + sx * hw * 0.5;
      const cz = p.z + dz * 5.2 + sz * hw * 0.5;
      batch.addOrientedRect(cx, cz, rx, rz, hw - 0.4, 0.4, 0.026, [0.92, 0.92, 0.95]);
    }

    // ── Blocks: sidewalk slabs + buildings ───────────────────────────────
    edgeBetween(idA, idB) {
      const a = this.network.nodes.get(idA);
      if (!a) return null;
      return a.edges.find((e) => (e.a.id === idA && e.b.id === idB) || (e.a.id === idB && e.b.id === idA)) || null;
    }

    buildBlocks() {
      const G = this.district.gridLines;
      const nid = (ix, iz) => `n${ix}_${iz}`;
      const plaza = this.district.plaza;
      const SIDEWALK = 4.5;

      for (let i = 0; i < G.length - 1; i++) {
        for (let j = 0; j < G.length - 1; j++) {
          const eL = this.edgeBetween(nid(i, j), nid(i, j + 1));
          const eR = this.edgeBetween(nid(i + 1, j), nid(i + 1, j + 1));
          const eT = this.edgeBetween(nid(i, j), nid(i + 1, j));
          const eB = this.edgeBetween(nid(i, j + 1), nid(i + 1, j + 1));
          const hw = (e) => (e ? e.halfWidth + 0.35 : 0);
          const x0 = G[i] + hw(eL); const x1 = G[i + 1] - hw(eR);
          const z0 = G[j] + hw(eT); const z1 = G[j + 1] - hw(eB);
          if (x1 - x0 < 6 || z1 - z0 < 6) continue;

          const cx = (x0 + x1) * 0.5; const cz = (z0 + z1) * 0.5;
          const isPlaza = plaza && cx > plaza.minX && cx < plaza.maxX && cz > plaza.minZ && cz < plaza.maxZ;
          this.addSlab(x0, z0, x1, z1, isPlaza ? 'plaza' : 'paving');
          if (isPlaza) continue;

          // Landmark exclusion (stadium / towers are placed explicitly)
          const zone = { x0: x0 + SIDEWALK, z0: z0 + SIDEWALK, x1: x1 - SIDEWALK, z1: z1 - SIDEWALK };
          this.fillZone(zone, false);
        }
      }

      // Outer fringe blocks (visual depth beyond the loop)
      const b = this.district.bounds;
      const gridMax = Math.max(Math.abs(G[0]), Math.abs(G[G.length - 1]));
      const ring = gridMax + 11.3 + 0.35;
      const fringe = [
        { x0: b.minX + 4, z0: b.minZ + 4, x1: b.maxX - 4, z1: -ring },          // north
        { x0: b.minX + 4, z0: -ring, x1: -ring, z1: gridMax + 11.3 },            // west
        { x0: ring, z0: -ring, x1: b.maxX - 4, z1: gridMax + 11.3 }              // east
      ];
      fringe.forEach((z) => {
        this.addSlab(z.x0, z.z0, z.x1, z.z1, 'paving');
        this.fillZone({ x0: z.x0 + 5, z0: z.z0 + 5, x1: z.x1 - 5, z1: z.z1 - 5 }, true);
      });
    }

    addSlab(x0, z0, x1, z1, kind) {
      const top = this.batch(kind);
      const tint = kind === 'plaza' ? [1, 1, 1] : [0.95, 0.95, 0.95];
      top.addFloor(x0, z0, x1, z1, 0.12, kind === 'plaza' ? 8 : 4, tint);
      const curb = this.batch('curb');
      const c = [1, 1, 1];
      curb.addQuad([x1, 0, z0], [x0, 0, z0], [x0, 0.12, z0], [x1, 0.12, z0], [0, 0, -1], undefined, c);
      curb.addQuad([x0, 0, z1], [x1, 0, z1], [x1, 0.12, z1], [x0, 0.12, z1], [0, 0, 1], undefined, c);
      curb.addQuad([x0, 0, z0], [x0, 0, z1], [x0, 0.12, z1], [x0, 0.12, z0], [-1, 0, 0], undefined, c);
      curb.addQuad([x1, 0, z1], [x1, 0, z0], [x1, 0.12, z0], [x1, 0.12, z1], [1, 0, 0], undefined, c);
      this.slabs.push({ x0, z0, x1, z1 });
    }

    /** Sub-divides a zone into merged lots and raises buildings on them. */
    fillZone(zone, isFringe) {
      const rng = this.rng;
      const theme = this.district.theme || {};
      const density = theme.density !== undefined ? theme.density : 1;
      const w = zone.x1 - zone.x0;
      const d = zone.z1 - zone.z0;
      if (w < 12 || d < 12) return;
      const nx = Math.max(1, Math.round(w / 38));
      const nz = Math.max(1, Math.round(d / 38));
      const cw = w / nx; const cd = d / nz;
      const used = new Array(nx * nz).fill(false);
      const idx = (ix, iz) => iz * nx + ix;

      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          if (used[idx(ix, iz)]) continue;
          let sx = 1; let sz = 1;
          const r = rng();
          const canX = ix + 1 < nx && !used[idx(ix + 1, iz)];
          const canZ = iz + 1 < nz && !used[idx(ix, iz + 1)];
          const canXZ = canX && canZ && !used[idx(ix + 1, iz + 1)];
          if (r < 0.12 && canXZ) { sx = 2; sz = 2; }
          else if (r < 0.40 && canX) { sx = 2; }
          else if (r < 0.65 && canZ) { sz = 2; }
          for (let a = 0; a < sx; a++) for (let b = 0; b < sz; b++) used[idx(ix + a, iz + b)] = true;

          // occasional empty lot → small park / parking (adds breathing room)
          if (!isFringe && rng() < 0.07) {
            this.addParkLot(zone.x0 + ix * cw, zone.z0 + iz * cd, zone.x0 + (ix + sx) * cw, zone.z0 + (iz + sz) * cd);
            continue;
          }

          // Themed districts can thin out buildings (RNG untouched at density 1).
          if (!isFringe && density < 1 && rng() > density) continue;

          const gap = 1.5 + rng() * 2.5;
          const x0 = zone.x0 + ix * cw + gap;
          const z0 = zone.z0 + iz * cd + gap;
          const x1 = zone.x0 + (ix + sx) * cw - gap;
          const z1 = zone.z0 + (iz + sz) * cd - gap;
          if (this.overlapsLandmark(x0, z0, x1, z1)) continue;
          const h = this.heightFor((x0 + x1) * 0.5, (z0 + z1) * 0.5, isFringe);
          this.addBuilding(x0, z0, x1, z1, h);
        }
      }
    }

    overlapsLandmark(x0, z0, x1, z1) {
      // Garage building + forecourt stay clear of procedural buildings.
      const gb = this.district.garage && this.district.garage.building;
      if (gb) {
        const hx = gb.width * 0.5 + 4; const hz = gb.depth * 0.5 + 4;
        if (x1 > gb.x - hx && x0 < gb.x + hx && z1 > gb.z - hz && z0 < gb.z + hz) return true;
      }
      const ge = this.district.garage && this.district.garage.entry;
      if (ge) {
        const r = (ge.radius || 9) + 14;
        if (x1 > ge.x - r && x0 < ge.x + r && z1 > ge.z - r && z0 < ge.z + r) return true;
      }
      const lms = this.district.landmarks || [];
      for (let i = 0; i < lms.length; i++) {
        const l = lms[i];
        if (l.type === 'tower') {
          const hx = l.width * 0.5 + 6; const hz = l.depth * 0.5 + 6;
          if (x1 > l.x - hx && x0 < l.x + hx && z1 > l.z - hz && z0 < l.z + hz) return true;
        } else if (l.type === 'stadium') {
          const hx = l.rx + 8; const hz = l.rz + 8;
          if (x1 > l.x - hx && x0 < l.x + hx && z1 > l.z - hz && z0 < l.z + hz) return true;
        } else if (l.type === 'containers') {
          const hx = ((l.cols || 5) - 1) * (l.gap || 16) * 0.5 + 10;
          const hz = ((l.rows || 3) - 1) * (l.gap || 16) * 0.5 + 6;
          if (x1 > l.x - hx && x0 < l.x + hx && z1 > l.z - hz && z0 < l.z + hz) return true;
        }
      }
      return false;
    }

    heightFor(x, z, isFringe) {
      const rng = this.rng;
      const theme = this.district.theme || {};
      const maxH = theme.maxHeight || 230;
      const r = Math.hypot(x, z);
      const core = 1 - THREE.MathUtils.smoothstep(r, 120, 720);
      let h = 16 + core * 70 + rng() * (18 + core * 90);
      if (rng() < 0.05 + core * 0.12) h *= 1.6;
      if (isFringe) h = 14 + rng() * 40 + (rng() < 0.08 ? 90 : 0);
      return Math.min(maxH, h);
    }

    addBuilding(x0, z0, x1, z1, h, forcedStyle = null) {
      const rng = this.rng;
      const style = forcedStyle || (h > 110 ? 'glass' : (h > 42 ? (rng() < 0.7 ? 'office' : 'residential') : (rng() < 0.6 ? 'residential' : 'office')));
      const walls = this.batch('walls_' + style);
      const roof = this.batch('roof');
      const tintV = 0.65 + rng() * 0.35;
      const tint = [tintV, tintV * (0.97 + rng() * 0.05), tintV * (1.0 + rng() * 0.08)];
      // Facade texture = 8 windows × 16 windows; a window ≈ 3.4 m × 3.6 m
      walls.addWalls(x0, z0, x1, z1, 0.12, h, [27.2, 57.6], tint, rng());
      roof.addFloor(x0, z0, x1, z1, h, 8, [0.9, 0.9, 0.95]);

      // setback tier on tall buildings
      if (h > 90 && rng() < 0.6) {
        const inset = 3 + rng() * 4;
        const h2 = h + 8 + rng() * 22;
        if (x1 - x0 > inset * 2 + 6 && z1 - z0 > inset * 2 + 6) {
          walls.addWalls(x0 + inset, z0 + inset, x1 - inset, z1 - inset, h, h2, [27.2, 57.6], tint, rng());
          roof.addFloor(x0 + inset, z0 + inset, x1 - inset, z1 - inset, h2, 8, [0.9, 0.9, 0.95]);
          h = h2;
        }
      }

      // antenna
      if (h > 120 || rng() < 0.08) {
        const cx = (x0 + x1) * 0.5; const cz = (z0 + z1) * 0.5;
        const prop = this.batch('prop');
        prop.addBox(cx - 0.35, h, cz - 0.35, cx + 0.35, h + 10 + rng() * 10, cz + 0.35, [0.6, 0.6, 0.65]);
        const neon = this.batch('neon');
        neon.addBox(cx - 0.35, h + 10, cz - 0.35, cx + 0.35, h + 10.7, cz + 0.35, [1.0, 0.1, 0.1]);
      }

      this.addSignage(x0, z0, x1, z1, h);
      this.collision.addBox(x0, z0, x1, z1, -1, h, 'building');
      this.trackBuilding(x0, z0, x1, z1, h);
      this.stats.buildings++;
    }

    /** Records a building footprint for minimap / queries (both rect + center forms). */
    trackBuilding(x0, z0, x1, z1, h) {
      this.buildings.push({
        x0, z0, x1, z1, h,
        x: (x0 + x1) * 0.5, z: (z0 + z1) * 0.5,
        hx: (x1 - x0) * 0.5, hz: (z1 - z0) * 0.5
      });
    }

    /** Neon signs & storefront strips on the road-facing wall. */
    addSignage(x0, z0, x1, z1, h) {
      const rng = this.rng;
      const theme = this.district.theme || {};
      const signage = theme.signage !== undefined ? theme.signage : 1;
      const cx = (x0 + x1) * 0.5; const cz = (z0 + z1) * 0.5;
      const near = this.network.nearestRoadPoint(cx, cz, 120);
      if (!near) return;
      const roadDist = near.dist - near.edge.halfWidth;
      if (roadDist > 26) return; // not street-facing
      // wall facing the road
      const dx = near.x - cx; const dz = near.z - cz;
      let nx = 0; let nz = 0; let wx = cx; let wz = cz; let wallLen;
      if (Math.abs(dx) * (z1 - z0) > Math.abs(dz) * (x1 - x0)) {
        nx = Math.sign(dx); wx = nx > 0 ? x1 : x0; wallLen = z1 - z0;
      } else {
        nz = Math.sign(dz); wz = nz > 0 ? z1 : z0; wallLen = x1 - x0;
      }
      const neon = this.batch('neon');
      const off = 0.12;

      // storefront light strip
      if (rng() < 0.65 * signage && h > 6) {
        neon.addBillboard(wx + nx * off, 3.4, wz + nz * off, nx, nz, wallLen - 1.0, 0.35, [1.0, 0.86, 0.6]);
      }
      // horizontal neon sign
      if (rng() < 0.6 * signage && h > 12) {
        const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
        const width = Math.min(wallLen - 2, 5 + rng() * 6);
        const y = 5.5 + rng() * Math.min(10, h - 8);
        const shift = (rng() - 0.5) * (wallLen - width - 1);
        const sx = wx + nx * off + (nz !== 0 ? shift : 0);
        const sz = wz + nz * off + (nx !== 0 ? shift : 0);
        neon.addBillboard(sx, y, sz, nx, nz, width, 1.3 + rng() * 0.8, color);
      }
      // vertical neon blade
      if (rng() < 0.28 * signage && h > 18) {
        const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
        const height = 6 + rng() * 8;
        const y = 8 + height * 0.5 + rng() * 4;
        const shift = (rng() - 0.5) * (wallLen - 3);
        const sx = wx + nx * 0.9 + (nz !== 0 ? shift : 0);
        const sz = wz + nz * 0.9 + (nx !== 0 ? shift : 0);
        // blade sticks out perpendicular to the wall: normal is along the wall
        neon.addBillboard(sx, y, sz, nz, -nx, 1.6, height, color);
      }
      // rooftop edge glow on tall towers
      if (h > 100 && rng() < 0.7 * signage) {
        const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
        neon.addWalls(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, h - 1.2, h - 0.6, [1, 1], color);
      }
    }

    addParkLot(x0, z0, x1, z1) {
      const rng = this.rng;
      const foliage = this.batch('foliage');
      const prop = this.batch('prop');
      // low hedge border
      const c = [0.55 + rng() * 0.3, 1, 0.6];
      prop.addBox(x0 + 1, 0.12, z0 + 1, x1 - 1, 0.5, z1 - 1, [0.45, 0.47, 0.5]);
      const n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const tx = x0 + 4 + rng() * (x1 - x0 - 8);
        const tz = z0 + 4 + rng() * (z1 - z0 - 8);
        this.addTree(tx, tz, 5 + rng() * 5, foliage, prop, c);
      }
    }

    addTree(x, z, h, foliage, prop, c) {
      prop.addBox(x - 0.25, 0.12, z - 0.25, x + 0.25, h * 0.45, z + 0.25, [0.35, 0.25, 0.18]);
      const r = h * 0.32;
      foliage.addBox(x - r, h * 0.4, z - r, x + r, h, z + r, c);
      this.collision.addBox(x - 0.4, z - 0.4, x + 0.4, z + 0.4, -1, h, 'tree');
    }

    // ── Landmarks ────────────────────────────────────────────────────────
    buildLandmarks() {
      const rng = this.rng;
      (this.district.landmarks || []).forEach((l) => {
        if (l.type === 'tower') {
          const hx = l.width * 0.5; const hz = l.depth * 0.5;
          this.addBuilding(l.x - hx, l.z - hz, l.x + hx, l.z + hz, l.height, l.style || 'glass');
          // crown
          const neon = this.batch('neon');
          neon.addWalls(l.x - hx * 0.6, l.z - hz * 0.6, l.x + hx * 0.6, l.z + hz * 0.6, l.height + 24, l.height + 26, [1, 1], [0.0, 0.94, 1.0]);
          const walls = this.batch('walls_glass');
          walls.addWalls(l.x - hx * 0.6, l.z - hz * 0.6, l.x + hx * 0.6, l.z + hz * 0.6, l.height, l.height + 24, [27.2, 57.6], [1, 1, 1]);
          this.batch('roof').addFloor(l.x - hx * 0.6, l.z - hz * 0.6, l.x + hx * 0.6, l.z + hz * 0.6, l.height + 26, 8, [0.9, 0.9, 0.95]);
        } else if (l.type === 'stadium') {
          this.addStadium(l);
        } else if (l.type === 'fountain') {
          this.addFountain(l);
        } else if (l.type === 'planters') {
          this.addPlanters(l.area);
        } else if (l.type === 'containers') {
          this.addContainerYard(l);
        }
      });
    }

    /** Stacked shipping-container yard (industrial districts). */
    addContainerYard(l) {
      const rng = this.rng;
      const prop = this.batch('prop');
      const palette = [
        [0.62, 0.16, 0.10], [0.10, 0.28, 0.55], [0.16, 0.45, 0.22],
        [0.75, 0.42, 0.08], [0.55, 0.57, 0.60], [0.35, 0.22, 0.45]
      ];
      const W = 12.2; const D = 2.6; const H = 2.9;
      const cols = l.cols || 5; const rows = l.rows || 3; const gap = l.gap || 16;
      const x0 = l.x - ((cols - 1) * gap) * 0.5;
      const z0 = l.z - ((rows - 1) * gap) * 0.5;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cx = x0 + c * gap;
          const cz = z0 + r * gap;
          const levels = 1 + (rng() < 0.45 ? 1 : 0);
          for (let lv = 0; lv < levels; lv++) {
            const y0 = 0.12 + lv * (H + 0.15);
            const color = palette[Math.floor(rng() * palette.length)];
            prop.addBox(cx - W * 0.5, y0, cz - D * 0.5, cx + W * 0.5, y0 + H, cz + D * 0.5, color);
            // ribbed-door end cap
            prop.addBox(cx + W * 0.5 - 0.3, y0 + 0.2, cz - D * 0.5 + 0.2, cx + W * 0.5 + 0.05, y0 + H - 0.2, cz + D * 0.5 - 0.2, [0.2, 0.2, 0.22]);
          }
          this.collision.addBox(cx - W * 0.5, cz - D * 0.5, cx + W * 0.5, cz + D * 0.5, -1, 0.12 + levels * (H + 0.15), 'containers');
          this.trackBuilding(cx - W * 0.5, cz - D * 0.5, cx + W * 0.5, cz + D * 0.5, 3.2 * levels);
        }
      }
    }

    addStadium(l) {
      const segs = 40;
      const walls = this.batch('walls_office');
      const roof = this.batch('roof');
      const neon = this.batch('neon');
      const h = l.height;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [l.x + Math.cos(a0) * l.rx, l.z + Math.sin(a0) * l.rz];
        const p1 = [l.x + Math.cos(a1) * l.rx, l.z + Math.sin(a1) * l.rz];
        const mx = (p0[0] + p1[0]) * 0.5 - l.x; const mz = (p0[1] + p1[1]) * 0.5 - l.z;
        const nl = Math.hypot(mx, mz) || 1;
        const n = [mx / nl, 0, mz / nl];
        const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        walls.addQuad([p0[0], 0.12, p0[1]], [p1[0], 0.12, p1[1]], [p1[0], h, p1[1]], [p0[0], h, p0[1]], n,
          [[0, 0], [segLen / 27.2, 0], [segLen / 27.2, h / 57.6], [0, h / 57.6]], [0.8, 0.8, 0.85]);
        // roof ring segment (outer to inner)
        const q0 = [l.x + Math.cos(a0) * l.rx * 0.72, l.z + Math.sin(a0) * l.rz * 0.72];
        const q1 = [l.x + Math.cos(a1) * l.rx * 0.72, l.z + Math.sin(a1) * l.rz * 0.72];
        roof.addQuad([p0[0], h, p0[1]], [q0[0], h, q0[1]], [q1[0], h, q1[1]], [p1[0], h, p1[1]], [0, 1, 0], undefined, [0.85, 0.85, 0.9]);
        // neon ring
        neon.addQuad([p0[0], h - 1.5, p0[1]], [p1[0], h - 1.5, p1[1]], [p1[0], h - 0.8, p1[1]], [p0[0], h - 0.8, p0[1]], n, undefined, [1.0, 0.0, 0.55]);
      }
      // collision: coarse boxes approximating the ellipse
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const z0 = l.z - l.rz + (i / steps) * l.rz * 2;
        const z1 = l.z - l.rz + ((i + 1) / steps) * l.rz * 2;
        const zm = (z0 + z1) * 0.5;
        const half = l.rx * Math.sqrt(Math.max(0, 1 - Math.pow((zm - l.z) / l.rz, 2)));
        if (half > 2) this.collision.addBox(l.x - half, z0, l.x + half, z1, -1, h, 'stadium');
      }
      // floodlight masts
      [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((s) => {
        const px = l.x + s[0] * l.rx * 0.8; const pz = l.z + s[1] * l.rz * 0.8;
        this.batch('prop').addBox(px - 0.6, 0.12, pz - 0.6, px + 0.6, h + 26, pz + 0.6, [0.5, 0.5, 0.55]);
        this.batch('neon').addBox(px - 2.2, h + 24, pz - 0.6, px + 2.2, h + 26, pz + 0.6, [1, 1, 0.9]);
      });
      this.trackBuilding(l.x - l.rx, l.z - l.rz, l.x + l.rx, l.z + l.rz, h);
    }

    addFountain(l) {
      const prop = this.batch('prop');
      const neon = this.batch('neon');
      const segs = 24;
      const r = l.radius;
      // basin wall
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [l.x + Math.cos(a0) * r, l.z + Math.sin(a0) * r];
        const p1 = [l.x + Math.cos(a1) * r, l.z + Math.sin(a1) * r];
        const n = [Math.cos((a0 + a1) * 0.5), 0, Math.sin((a0 + a1) * 0.5)];
        prop.addQuad([p0[0], 0.12, p0[1]], [p1[0], 0.12, p1[1]], [p1[0], 1.0, p1[1]], [p0[0], 1.0, p0[1]], n, undefined, [0.75, 0.75, 0.8]);
        neon.addQuad([p0[0] * 0.999 + l.x * 0.001, 0.95, p0[1] * 0.999 + l.z * 0.001], [p1[0], 0.95, p1[1]], [p1[0], 1.02, p1[1]], [p0[0], 1.02, p0[1]], n, undefined, [0.0, 0.94, 1.0]);
      }
      const water = new THREE.Mesh(new THREE.CircleGeometry(r - 0.4, 32),
        new THREE.MeshStandardMaterial({ color: 0x0f3a55, roughness: 0.1, metalness: 0.8, emissive: 0x0a2a44, emissiveIntensity: 0.7 }));
      water.rotation.x = -Math.PI * 0.5;
      water.position.set(l.x, 0.8, l.z);
      this.group.add(water);
      this.stats.drawCalls++;
      // centre column
      prop.addBox(l.x - 1.2, 0.12, l.z - 1.2, l.x + 1.2, 7.5, l.z + 1.2, [0.7, 0.7, 0.75]);
      neon.addBox(l.x - 1.4, 7.5, l.z - 1.4, l.x + 1.4, 8.2, l.z + 1.4, [0.0, 0.94, 1.0]);
      this.collision.addBox(l.x - r, l.z - r, l.x + r, l.z + r, -1, 1.0, 'fountain');
    }

    addPlanters(area) {
      const prop = this.batch('prop');
      const foliage = this.batch('foliage');
      const positions = [];
      const step = 30;
      for (let x = area.minX + 15; x <= area.maxX - 15; x += step) {
        positions.push([x, area.minZ + 6], [x, area.maxZ - 6]);
      }
      for (let z = area.minZ + 15 + step; z <= area.maxZ - 15 - step; z += step) {
        positions.push([area.minX + 6, z], [area.maxX - 6, z]);
      }
      positions.forEach((p) => {
        const [x, z] = p;
        // keep the avenue crossings clear
        if (Math.abs(x) < 14 || Math.abs(z) < 14) return;
        prop.addBox(x - 3, 0.12, z - 1.2, x + 3, 0.9, z + 1.2, [0.42, 0.44, 0.5]);
        foliage.addBox(x - 2.7, 0.9, z - 0.9, x + 2.7, 1.9, z + 0.9, [0.6, 1, 0.65]);
        this.collision.addBox(x - 3, z - 1.2, x + 3, z + 1.2, -1, 1.0, 'planter');
      });
    }

    // ── Garage ───────────────────────────────────────────────────────────
    buildGarage() {
      const g = this.district.garage;
      if (!g) return;
      const b = g.building;
      const hx = b.width * 0.5; const hz = b.depth * 0.5;
      const x0 = b.x - hx; const x1 = b.x + hx; const z0 = b.z - hz; const z1 = b.z + hz;
      const walls = this.batch('walls_office');
      const roof = this.batch('roof');
      const neon = this.batch('neon');
      walls.addWalls(x0, z0, x1, z1, 0.12, b.height, [27.2, 57.6], [0.55, 0.6, 0.7]);
      roof.addFloor(x0, z0, x1, z1, b.height, 8, [0.9, 0.9, 0.95]);
      // roll-up doors on the +Z face (toward the boulevard)
      const prop = this.batch('prop');
      [-1, 1].forEach((s) => {
        const dx = b.x + s * 16;
        prop.addBillboard(dx, 3.2, z1 + 0.06, 0, 1, 12, 6.2, [0.18, 0.2, 0.25]);
        neon.addBillboard(dx, 6.5, z1 + 0.1, 0, 1, 12.6, 0.3, [0.0, 0.94, 1.0]);
        neon.addBillboard(dx - 6.3, 3.2, z1 + 0.1, 0, 1, 0.3, 6.4, [0.0, 0.94, 1.0]);
        neon.addBillboard(dx + 6.3, 3.2, z1 + 0.1, 0, 1, 0.3, 6.4, [0.0, 0.94, 1.0]);
      });
      // roof edge glow + sign
      neon.addWalls(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, b.height - 0.9, b.height - 0.4, [1, 1], [0.0, 0.94, 1.0]);
      const signTex = TextureFactory.textSign(g.sign || 'APEX GARAGE', '#00f0ff', 1024, 192);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(36, 6.75),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: false, toneMapped: false }));
      sign.position.set(b.x, b.height + 4.5, z1 + 0.3);
      this.group.add(sign);
      this.stats.drawCalls++;
      this.collision.addBox(x0, z0, x1, z1, -1, b.height, 'garage');
      this.trackBuilding(x0, z0, x1, z1, b.height);
    }

    // ── Ramps ────────────────────────────────────────────────────────────
    buildRamps() {
      (this.district.ramps || []).forEach((r) => {
        const fx = Math.sin(r.yaw); const fz = Math.cos(r.yaw);
        const rx = -fz; const rz = fx; // driver's right of forward
        const ramp = { x: r.x, z: r.z, fx, fz, rx, rz, length: r.length, width: r.width, height: r.height, name: r.name };
        this.ramps.push(ramp);
        const hw = r.width * 0.5;
        const P = (u, v, y) => [r.x + fx * u + rx * v, y, r.z + fz * u + rz * v];
        const road = this.batch('road');
        const prop = this.batch('prop');
        const neon = this.batch('neon');
        const top = 0.12 + r.height;
        // top surface
        const nlen = Math.hypot(r.length, r.height);
        const n = [-fx * (r.height / nlen), r.length / nlen, -fz * (r.height / nlen)];
        road.addQuad(P(0, -hw, 0.12), P(0, hw, 0.12), P(r.length, hw, top), P(r.length, -hw, top), n,
          [[0, 0], [1, 0], [1, r.length / 8], [0, r.length / 8]], [1.1, 1.05, 0.9]);
        // sides
        prop.addTri(P(0, hw, 0.12), P(r.length, hw, 0.12), P(r.length, hw, top), [rx, 0, rz], [0.5, 0.5, 0.55]);
        prop.addTri(P(0, -hw, 0.12), P(r.length, -hw, top), P(r.length, -hw, 0.12), [-rx, 0, -rz], [0.5, 0.5, 0.55]);
        // back
        prop.addQuad(P(r.length, hw, 0.12), P(r.length, -hw, 0.12), P(r.length, -hw, top), P(r.length, hw, top), [fx, 0, fz], undefined, [0.5, 0.5, 0.55]);
        // edge neon
        neon.addQuad(P(0, hw - 0.3, 0.14), P(0, hw, 0.14), P(r.length, hw, top + 0.02), P(r.length, hw - 0.3, top + 0.02), [0, 1, 0], undefined, [1.0, 0.45, 0.05]);
        neon.addQuad(P(0, -hw, 0.14), P(0, -hw + 0.3, 0.14), P(r.length, -hw + 0.3, top + 0.02), P(r.length, -hw, top + 0.02), [0, 1, 0], undefined, [1.0, 0.45, 0.05]);
      });
    }

    // ── Boundaries ───────────────────────────────────────────────────────
    buildBoundaries() {
      const b = this.district.bounds;
      const barrier = this.batch('barrier');
      const neon = this.batch('neon');
      const H = 3.4;
      const wall = (x0, z0, x1, z1) => {
        barrier.addBox(x0, 0, z0, x1, H, z1, [1, 1, 1]);
        neon.addBox(x0 - 0.02, H - 0.35, z0 - 0.02, x1 + 0.02, H - 0.1, z1 + 0.02, [1.0, 0.45, 0.05]);
        this.collision.addBox(x0, z0, x1, z1, -1, H, 'boundary');
      };
      wall(b.minX, b.minZ, b.maxX, b.minZ + 1.0);         // north
      wall(b.minX, b.minZ, b.minX + 1.0, b.maxZ);         // west
      wall(b.maxX - 1.0, b.minZ, b.maxX, b.maxZ);         // east
      // seawall railing (south)
      if (this.district.waterfront) {
        const wz = this.district.waterfront.z;
        barrier.addBox(b.minX, 0.12, wz - 0.5, b.maxX, 1.25, wz, [0.8, 0.85, 0.9]);
        neon.addBox(b.minX, 1.15, wz - 0.5, b.maxX, 1.25, wz, [0.0, 0.94, 1.0]);
        this.collision.addBox(b.minX, wz - 0.6, b.maxX, wz + 20, -1, 2.0, 'seawall');
        // benches + palms along the boardwalk
        const foliage = this.batch('foliage');
        const prop = this.batch('prop');
        for (let x = b.minX + 30; x < b.maxX - 20; x += 36) {
          prop.addBox(x - 1.2, 0.12, wz - 6, x + 1.2, 0.6, wz - 5.3, [0.45, 0.35, 0.25]);
          this.addTree(x + 12, wz - 12, 8 + this.rng() * 4, foliage, prop, [0.55, 1, 0.55]);
        }
      }
    }

    // ── Distant skyline ──────────────────────────────────────────────────
    buildVista() {
      const rng = this.rng;
      const b = this.district.bounds;
      for (let i = 0; i < 70; i++) {
        const side = rng();
        let x; let z;
        if (side < 0.4) { x = b.minX + rng() * (b.maxX - b.minX) * 1.6 - 350; z = b.minZ - 120 - rng() * 500; }
        else if (side < 0.7) { x = b.minX - 120 - rng() * 500; z = b.minZ + rng() * (b.maxZ - b.minZ); }
        else if (side < 1.0) { x = b.maxX + 120 + rng() * 500; z = b.minZ + rng() * (b.maxZ - b.minZ); }
        const w = 30 + rng() * 60; const d = 30 + rng() * 60;
        const h = 40 + rng() * 170;
        const style = h > 120 ? 'glass' : 'office';
        const walls = this.batch('walls_' + style);
        const tint = 0.5 + rng() * 0.3;
        walls.addWalls(x - w * 0.5, z - d * 0.5, x + w * 0.5, z + d * 0.5, -0.5, h, [27.2, 57.6], [tint, tint, tint * 1.05], rng());
        this.batch('roof').addFloor(x - w * 0.5, z - d * 0.5, x + w * 0.5, z + d * 0.5, h, 8, [0.9, 0.9, 0.95]);
      }
      // harbour cranes across the water
      if (this.district.waterfront) {
        const wz = this.district.waterfront.z;
        for (let i = 0; i < 9; i++) {
          const x = -700 + i * 175 + rng() * 40;
          const z = wz + 700 + rng() * 260;
          const prop = this.batch('prop');
          const neon = this.batch('neon');
          prop.addBox(x - 6, -1, z - 6, x + 6, 70, z + 6, [0.3, 0.3, 0.35]);
          prop.addBox(x - 60, 66, z - 2, x + 30, 70, z + 2, [0.3, 0.3, 0.35]);
          neon.addBox(x - 1, 70, z - 1, x + 1, 71, z + 1, [1, 0.1, 0.1]);
          // warehouses
          const walls = this.batch('walls_residential');
          walls.addWalls(x - 50, z + 40, x + 50, z + 110, -1, 22, [27.2, 57.6], [0.5, 0.5, 0.5]);
          this.batch('roof').addFloor(x - 50, z + 40, x + 50, z + 110, 22, 8, [0.9, 0.9, 0.95]);
        }
      }
    }

    // ── Street lights (instanced) ────────────────────────────────────────
    buildStreetLights() {
      const spacing = 36;
      const transforms = [];
      this.network.edges.forEach((e) => {
        if (e.type === 'alley') return;
        for (let s = spacing * 0.5; s < e.length; s += spacing) {
          const p = this.network.pointAtDistance(e.points, s);
          const seg = e.points[p.segIndex]; const nxt = e.points[p.segIndex + 1] || seg;
          let dx = nxt.x - seg.x; let dz = nxt.z - seg.z;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const rx = -dz; const rz = dx;
          const off = e.halfWidth + 1.4;
          transforms.push({ x: p.point.x + rx * off, z: p.point.z + rz * off, yaw: Math.atan2(-rx, -rz) });
          transforms.push({ x: p.point.x - rx * off, z: p.point.z - rz * off, yaw: Math.atan2(rx, rz) });
        }
      });
      const count = transforms.length;
      this.streetLightCount = count;
      if (count === 0) return;

      const poleGeo = new THREE.CylinderGeometry(0.12, 0.2, 9, 6);
      poleGeo.translate(0, 4.5 + 0.12, 0);
      const armGeo = new THREE.BoxGeometry(0.16, 0.16, 2.6);
      armGeo.translate(0, 8.9, 1.3);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f333b, roughness: 0.6, metalness: 0.6 });
      const lampGeo = new THREE.BoxGeometry(0.5, 0.22, 1.3);
      lampGeo.translate(0, 8.85, 2.4);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });

      const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
      const arms = new THREE.InstancedMesh(armGeo, poleMat, count);
      const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const one = new THREE.Vector3(1, 1, 1);
      transforms.forEach((t, i) => {
        q.setFromAxisAngle(up, t.yaw);
        m.compose(new THREE.Vector3(t.x, 0, t.z), q, one);
        poles.setMatrixAt(i, m);
        arms.setMatrixAt(i, m);
        lamps.setMatrixAt(i, m);
      });
      [poles, arms, lamps].forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        im.frustumCulled = false;
        this.group.add(im);
        this.meshes.push(im);
        this.stats.drawCalls++;
      });
      poles.castShadow = true;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    dispose() {
      this.scene.remove(this.group);
      this.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mt) => {
            if (mt.map) mt.map.dispose();
            if (mt.emissiveMap) mt.emissiveMap.dispose();
            mt.dispose();
          });
        }
      });
      this.collision.clear();
      this.meshes.length = 0;
    }
  }

  window.WorldBuilder = WorldBuilder;
  window.GeometryBatcher = GeometryBatcher;
  window.WorldTextureFactory = TextureFactory;
  window.NEON_PALETTE = NEON_PALETTE;
})();
