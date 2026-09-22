/**
 * FreeRacer - Road Network
 * ---------------------------------------------------------------------------
 * A district is described as a graph of nodes (intersections) and edges
 * (road segments). This class turns that description into:
 *   - trimmed centerline polylines per edge (so segments stop at the
 *     intersection patch instead of overlapping it)
 *   - per-direction lane polylines used by traffic and AI
 *   - a uniform spatial hash for fast "nearest road" queries
 *   - Dijkstra routing between nodes
 *
 * Coordinate conventions (Three.js, Y up):
 *   heading yaw θ  →  forward = (sin θ, 0, cos θ)
 *   driver's right of a 2D direction d = (dx, dz)  →  (-dz, dx)
 * Traffic keeps to the driver's right (right-hand traffic).
 */
(function () {
  const LANE_WIDTH = 3.6;

  function rightOf(dx, dz) {
    return { x: -dz, z: dx };
  }

  class RoadNetwork {
    /**
     * @param {object} def district definition
     *   nodes: { id: [x, z], ... }
     *   edges: [{ a, b, lanes (per direction), type, via?: [[x,z],...], oneWay?: bool, speedLimit? }]
     */
    constructor(def) {
      this.def = def;
      this.nodes = new Map();
      this.edges = [];
      this.cellSize = 60;
      this.grid = new Map();

      this.build();
    }

    // ────────────────────────────────────────────────────────────────────
    // BUILD
    // ────────────────────────────────────────────────────────────────────
    build() {
      const nodeDefs = this.def.nodes;
      Object.keys(nodeDefs).forEach((id) => {
        const p = nodeDefs[id];
        this.nodes.set(id, {
          id,
          x: p[0],
          z: p[1],
          edges: [],
          radius: 0
        });
      });

      this.def.edges.forEach((e, index) => {
        const a = this.nodes.get(e.a);
        const b = this.nodes.get(e.b);
        if (!a || !b) {
          console.warn('[RoadNetwork] edge references missing node', e);
          return;
        }
        const lanes = e.lanes || 1;
        const type = e.type || 'street';
        const width = e.width || lanes * 2 * LANE_WIDTH;
        const raw = [[a.x, a.z], ...(e.via || []), [b.x, b.z]];
        const edge = {
          id: e.id || `e${index}`,
          index,
          a,
          b,
          lanes,
          type,
          width,
          halfWidth: width * 0.5,
          oneWay: !!e.oneWay,
          noTraffic: !!e.noTraffic,
          speedLimit: e.speedLimit || (type === 'avenue' ? 22 : type === 'highway' ? 30 : 15),
          rawPoints: raw.map((p) => ({ x: p[0], z: p[1] })),
          points: [],
          lanesFwd: [],
          lanesBack: [],
          length: 0,
          name: e.name || null
        };
        this.edges.push(edge);
        a.edges.push(edge);
        b.edges.push(edge);
      });

      // Intersection radius = widest connected road half-width (+ margin)
      this.nodes.forEach((n) => {
        let r = 0;
        n.edges.forEach((e) => { r = Math.max(r, e.halfWidth); });
        n.radius = n.edges.length > 1 ? r + 0.5 : r;
        // A dead end keeps a small turnaround pad
        if (n.edges.length === 1) n.radius = r;
      });

      this.edges.forEach((e) => this.buildEdgeGeometry(e));
      this.buildSpatialHash();
    }

    buildEdgeGeometry(edge) {
      // 1. Smooth via-points with Catmull-Rom for curved roads
      let pts = edge.rawPoints;
      if (pts.length > 2) {
        const v3 = pts.map((p) => new THREE.Vector3(p.x, 0, p.z));
        const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal', 0.5);
        const len = curve.getLength();
        const segments = Math.max(8, Math.ceil(len / 6));
        pts = [];
        for (let i = 0; i <= segments; i++) {
          const p = curve.getPointAt(i / segments);
          pts.push({ x: p.x, z: p.z });
        }
      }

      // 2. Trim both ends back to the intersection radius
      pts = this.trimPolyline(pts, edge.a.radius, edge.b.radius);
      edge.points = pts;

      // 3. Cumulative lengths
      edge.cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dz = pts[i].z - pts[i - 1].z;
        edge.cum.push(edge.cum[i - 1] + Math.hypot(dx, dz));
      }
      edge.length = edge.cum[edge.cum.length - 1];

      // 4. Per-direction lane polylines
      edge.lanesFwd = [];
      edge.lanesBack = [];
      for (let k = 0; k < edge.lanes; k++) {
        const offset = LANE_WIDTH * (k + 0.5);
        edge.lanesFwd.push(this.offsetPolyline(pts, offset));
        if (!edge.oneWay) {
          // back lanes run b → a, on the other side (their own driver's right)
          const rev = pts.slice().reverse();
          edge.lanesBack.push(this.offsetPolyline(rev, offset));
        }
      }
    }

    trimPolyline(pts, trimStart, trimEnd) {
      const total = (() => {
        let l = 0;
        for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        return l;
      })();
      const ts = Math.min(trimStart, total * 0.4);
      const te = Math.min(trimEnd, total * 0.4);
      const start = this.pointAtDistance(pts, ts);
      const end = this.pointAtDistance(pts, total - te);
      const out = [start.point];
      for (let i = start.segIndex + 1; i <= end.segIndex; i++) out.push(pts[i]);
      out.push(end.point);
      // remove degenerate duplicates
      return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 0.05);
    }

    pointAtDistance(pts, d) {
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        if (acc + segLen >= d || i === pts.length - 1) {
          const t = segLen > 0 ? THREE.MathUtils.clamp((d - acc) / segLen, 0, 1) : 0;
          return {
            point: {
              x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
              z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t
            },
            segIndex: i - 1
          };
        }
        acc += segLen;
      }
      return { point: pts[pts.length - 1], segIndex: pts.length - 2 };
    }

    /** Offsets a polyline to the driver's right by `offset` metres. */
    offsetPolyline(pts, offset) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        let dx = next.x - prev.x;
        let dz = next.z - prev.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const r = rightOf(dx, dz);
        out.push({ x: pts[i].x + r.x * offset, z: pts[i].z + r.z * offset, dx, dz });
      }
      // cumulative distance for lane followers
      out.cum = [0];
      for (let i = 1; i < out.length; i++) {
        out.cum.push(out.cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
      }
      out.length2 = out.cum[out.cum.length - 1];
      return out;
    }

    buildSpatialHash() {
      this.grid.clear();
      this.edges.forEach((e) => {
        for (let i = 1; i < e.points.length; i++) {
          const p0 = e.points[i - 1];
          const p1 = e.points[i];
          const minX = Math.min(p0.x, p1.x) - e.halfWidth - 6;
          const maxX = Math.max(p0.x, p1.x) + e.halfWidth + 6;
          const minZ = Math.min(p0.z, p1.z) - e.halfWidth - 6;
          const maxZ = Math.max(p0.z, p1.z) + e.halfWidth + 6;
          for (let cx = Math.floor(minX / this.cellSize); cx <= Math.floor(maxX / this.cellSize); cx++) {
            for (let cz = Math.floor(minZ / this.cellSize); cz <= Math.floor(maxZ / this.cellSize); cz++) {
              const key = cx + ',' + cz;
              if (!this.grid.has(key)) this.grid.set(key, []);
              this.grid.get(key).push({ edge: e, seg: i - 1 });
            }
          }
        }
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // QUERIES
    // ────────────────────────────────────────────────────────────────────
    /**
     * Nearest point on any road centerline.
     * @returns {{edge, seg, t, x, z, dx, dz, dist, lateral, s}|null}
     *   lateral > 0 means the query point is on the driver's-right side when
     *   travelling a→b; s is the distance along the edge from node a.
     */
    nearestRoadPoint(x, z, maxRadius = 90) {
      let best = null;
      const cmin = Math.floor((Math.min(x, x) - maxRadius) / this.cellSize);
      const cmax = Math.floor((x + maxRadius) / this.cellSize);
      const czmin = Math.floor((z - maxRadius) / this.cellSize);
      const czmax = Math.floor((z + maxRadius) / this.cellSize);
      const seen = new Set();
      for (let cx = cmin; cx <= cmax; cx++) {
        for (let cz = czmin; cz <= czmax; cz++) {
          const bucket = this.grid.get(cx + ',' + cz);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const { edge, seg } = bucket[i];
            const key = edge.index * 4096 + seg;
            if (seen.has(key)) continue;
            seen.add(key);
            const p0 = edge.points[seg];
            const p1 = edge.points[seg + 1];
            const vx = p1.x - p0.x;
            const vz = p1.z - p0.z;
            const l2 = vx * vx + vz * vz || 1e-6;
            let t = ((x - p0.x) * vx + (z - p0.z) * vz) / l2;
            t = THREE.MathUtils.clamp(t, 0, 1);
            const px = p0.x + vx * t;
            const pz = p0.z + vz * t;
            const d = Math.hypot(x - px, z - pz);
            if (!best || d < best.dist) {
              const l = Math.sqrt(l2);
              const dx = vx / l;
              const dz = vz / l;
              const r = rightOf(dx, dz);
              best = {
                edge,
                seg,
                t,
                x: px,
                z: pz,
                dx,
                dz,
                dist: d,
                lateral: (x - px) * r.x + (z - pz) * r.z,
                s: edge.cum[seg] + l * t
              };
            }
          }
        }
      }
      return best;
    }

    nearestNode(x, z) {
      let best = null;
      let bestD = Infinity;
      this.nodes.forEach((n) => {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestD) { bestD = d; best = n; }
      });
      return best;
    }

    /** Surface classification for a world position. */
    surfaceAt(x, z) {
      const near = this.nearestRoadPoint(x, z, 60);
      if (near && near.dist <= near.edge.halfWidth) return { type: 'asphalt', near };
      // inside an intersection patch?
      if (near) {
        const a = near.edge.a;
        const b = near.edge.b;
        if (Math.hypot(a.x - x, a.z - z) <= a.radius + 0.5 || Math.hypot(b.x - x, b.z - z) <= b.radius + 0.5) {
          return { type: 'asphalt', near };
        }
      }
      if (near && near.dist <= near.edge.halfWidth + 4.0) return { type: 'sidewalk', near };
      return { type: 'offroad', near };
    }

    /** Sample a lane polyline at distance s (clamped). */
    static sampleLane(lane, s) {
      const cum = lane.cum;
      const n = lane.length;
      if (n === 0) return null;
      if (s <= 0) return { x: lane[0].x, z: lane[0].z, dx: lane[0].dx, dz: lane[0].dz, end: n === 1 };
      if (s >= lane.length2) {
        const p = lane[n - 1];
        return { x: p.x, z: p.z, dx: p.dx, dz: p.dz, end: true };
      }
      // binary search
      let lo = 0; let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid; else hi = mid;
      }
      const segLen = cum[hi] - cum[lo] || 1;
      const t = (s - cum[lo]) / segLen;
      const p0 = lane[lo];
      const p1 = lane[hi];
      let dx = p1.x - p0.x;
      let dz = p1.z - p0.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      return { x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t, dx, dz, end: false };
    }

    /** Lanes leaving `node` along `edge` (direction chosen by the node). */
    static lanesFrom(edge, node) {
      if (edge.a === node) return { lanes: edge.lanesFwd, dir: 1, to: edge.b };
      if (edge.oneWay) return null;
      return { lanes: edge.lanesBack, dir: -1, to: edge.a };
    }

    /** Choose an outgoing edge at a node, preferring to go straight. */
    nextEdgeAtNode(node, arrivingEdge, arrivingDir, rng = Math.random) {
      const candidates = node.edges.filter((e) => {
        if (e === arrivingEdge && node.edges.length > 1) return false;
        if (e.oneWay && e.b === node) return false; // cannot enter a one-way against flow
        if (e.noTraffic) return false;
        return true;
      });
      if (candidates.length === 0) return arrivingEdge; // dead end: U-turn
      // weight by alignment with the arriving direction
      const weights = candidates.map((e) => {
        const info = RoadNetwork.lanesFrom(e, node);
        if (!info) return 0;
        const lane = info.lanes[0];
        const align = lane[0].dx * arrivingDir.x + lane[0].dz * arrivingDir.z;
        return 0.35 + Math.max(0, align) * 1.4;
      });
      const total = weights.reduce((s, w) => s + w, 0);
      let r = rng() * total;
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
      }
      return candidates[candidates.length - 1];
    }

    // ────────────────────────────────────────────────────────────────────
    // ROUTING
    // ────────────────────────────────────────────────────────────────────
    /** Dijkstra shortest path between node ids. Returns [{node, edge}] */
    route(fromId, toId) {
      const start = this.nodes.get(fromId);
      const goal = this.nodes.get(toId);
      if (!start || !goal) return null;
      const dist = new Map();
      const prev = new Map();
      const visited = new Set();
      dist.set(start.id, 0);
      const open = [start];
      while (open.length) {
        open.sort((a, b) => dist.get(a.id) - dist.get(b.id));
        const cur = open.shift();
        if (visited.has(cur.id)) continue;
        visited.add(cur.id);
        if (cur === goal) break;
        cur.edges.forEach((e) => {
          if (e.oneWay && e.b === cur) return;
          const other = e.a === cur ? e.b : e.a;
          const nd = dist.get(cur.id) + e.length;
          if (nd < (dist.has(other.id) ? dist.get(other.id) : Infinity)) {
            dist.set(other.id, nd);
            prev.set(other.id, { node: cur, edge: e });
            open.push(other);
          }
        });
      }
      if (!prev.has(goal.id) && start !== goal) return null;
      const path = [];
      let cur = goal;
      while (cur !== start) {
        const p = prev.get(cur.id);
        path.unshift({ node: cur, edge: p.edge });
        cur = p.node;
      }
      path.unshift({ node: start, edge: null });
      return path;
    }

    /**
     * Builds a drivable polyline (driver's-right lane centres, corner-cut)
     * through the ordered list of node ids.
     */
    buildRoutePolyline(nodeIds, laneIndex = 0) {
      const pts = [];
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const path = this.route(nodeIds[i], nodeIds[i + 1]);
        if (!path) {
          console.warn('[RoadNetwork] no route between', nodeIds[i], nodeIds[i + 1]);
          continue;
        }
        for (let j = 1; j < path.length; j++) {
          const from = path[j - 1].node;
          const edge = path[j].edge;
          const info = RoadNetwork.lanesFrom(edge, from);
          if (!info) continue;
          const lane = info.lanes[Math.min(laneIndex, info.lanes.length - 1)];
          lane.forEach((p, k) => {
            if (pts.length && k === 0) {
              const last = pts[pts.length - 1];
              if (Math.hypot(last.x - p.x, last.z - p.z) < 0.5) return;
            }
            pts.push({ x: p.x, z: p.z });
          });
        }
      }
      // smooth the corners a little for a racing feel
      const v3 = pts.map((p) => new THREE.Vector3(p.x, 0, p.z));
      if (v3.length < 2) return { points: [], cum: [0], length: 0 };
      const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal', 0.35);
      const len = curve.getLength();
      const n = Math.max(16, Math.ceil(len / 4));
      const out = [];
      const cum = [0];
      for (let i = 0; i <= n; i++) {
        const p = curve.getPointAt(i / n);
        out.push({ x: p.x, z: p.z });
        if (i > 0) cum.push(cum[i - 1] + Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z));
      }
      return { points: out, cum, length: cum[cum.length - 1] };
    }

    getBounds() {
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      this.nodes.forEach((n) => {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
      });
      return { minX, maxX, minZ, maxZ };
    }
  }

  RoadNetwork.LANE_WIDTH = LANE_WIDTH;
  RoadNetwork.rightOf = rightOf;
  window.RoadNetwork = RoadNetwork;
})();
