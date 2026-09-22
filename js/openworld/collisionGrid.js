/**
 * FreeRacer - Static collision grid
 * ---------------------------------------------------------------------------
 * Axis-aligned boxes (buildings, barriers, planters) stored in a uniform
 * hash. Vehicles resolve against them with circle sweeps.
 */
(function () {
  class CollisionGrid {
    constructor(cellSize = 40) {
      this.cellSize = cellSize;
      this.cells = new Map();
      this.boxes = [];
    }

    addBox(minX, minZ, maxX, maxZ, minY = 0, maxY = 10, tag = 'static') {
      const box = { minX, minZ, maxX, maxZ, minY, maxY, tag, id: this.boxes.length };
      this.boxes.push(box);
      for (let cx = Math.floor(minX / this.cellSize); cx <= Math.floor(maxX / this.cellSize); cx++) {
        for (let cz = Math.floor(minZ / this.cellSize); cz <= Math.floor(maxZ / this.cellSize); cz++) {
          const key = cx + ',' + cz;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(box);
        }
      }
      return box;
    }

    /** Visit boxes whose cells overlap the query circle. */
    query(x, z, radius, visitor) {
      const seen = new Set();
      for (let cx = Math.floor((x - radius) / this.cellSize); cx <= Math.floor((x + radius) / this.cellSize); cx++) {
        for (let cz = Math.floor((z - radius) / this.cellSize); cz <= Math.floor((z + radius) / this.cellSize); cz++) {
          const bucket = this.cells.get(cx + ',' + cz);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const b = bucket[i];
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            visitor(b);
          }
        }
      }
    }

    /**
     * Resolve a circle (x, z, r) at height y against all boxes.
     * @returns {{x, z, nx, nz, depth, box}|null} the deepest penetration
     */
    resolveCircle(x, z, r, y = 0.5) {
      let best = null;
      this.query(x, z, r + 1, (b) => {
        if (y < b.minY || y > b.maxY) return;
        const cx = THREE.MathUtils.clamp(x, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(z, b.minZ, b.maxZ);
        let dx = x - cx;
        let dz = z - cz;
        let d = Math.hypot(dx, dz);
        let nx; let nz; let depth;
        if (d < 1e-5) {
          // centre is inside the box: push out through the nearest face
          const toMinX = x - b.minX; const toMaxX = b.maxX - x;
          const toMinZ = z - b.minZ; const toMaxZ = b.maxZ - z;
          const m = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
          if (m === toMinX) { nx = -1; nz = 0; depth = toMinX + r; }
          else if (m === toMaxX) { nx = 1; nz = 0; depth = toMaxX + r; }
          else if (m === toMinZ) { nx = 0; nz = -1; depth = toMinZ + r; }
          else { nx = 0; nz = 1; depth = toMaxZ + r; }
        } else {
          if (d >= r) return;
          nx = dx / d; nz = dz / d; depth = r - d;
        }
        if (!best || depth > best.depth) best = { x: cx, z: cz, nx, nz, depth, box: b };
      });
      return best;
    }

    clear() {
      this.cells.clear();
      this.boxes.length = 0;
    }
  }

  window.CollisionGrid = CollisionGrid;
})();
