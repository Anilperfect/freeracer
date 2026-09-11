/**
 * 3D Dynamic Anti-Gravity Racing Line for Turbo Rush.
 * Renders a color-coded guidance ribbon following optimal racing line
 * across floors, walls, ceilings, and loops:
 * - Green: full acceleration
 * - Yellow: corner entry
 * - Red: heavy braking zone
 * - Cyan: nitro boost zone
 */
class RacingLineManager {
  constructor(scene, trackManager) {
    this.scene = scene;
    this.track = trackManager;
    this.visible = true;
    if (this.track && this.track.mapConfig && (this.track.mapConfig.hideRacingLine || this.track.mapConfig.id === 'emerald_highway')) {
      this.visible = false;
    }
    this.opacity = 0.75;
    this.mesh = null;

    this.buildRacingLine();
  }

  buildRacingLine() {
    if (!this.track || !this.track.splineSamples || this.track.splineSamples.length === 0) return;

    const samples = this.track.splineSamples;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const indices = [];

    const ribbonWidth = 0.45;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.isGap) continue;

      // Determine curvature for braking/nitro zones
      const nextU = (s.u + 0.04) % 1.0;
      const nextSample = this.track.getSampleAt(nextU);
      const curvature = nextSample ? (1.0 - Math.max(0, s.tangent.dot(nextSample.tangent))) : 0;

      // Color coding:
      // Red: sharp turn ahead (braking)
      // Yellow: medium sweeper
      // Cyan: boost zone
      // Green: acceleration straight
      let r = 0.0, g = 1.0, b = 0.3; // Green

      if (s.isBoost || (curvature < 0.015 && s.u > 0.1 && s.u < 0.3)) {
        r = 0.0; g = 0.9; b = 1.0; // Cyan nitro
      } else if (curvature > 0.075) {
        r = 1.0; g = 0.15; b = 0.15; // Red braking
      } else if (curvature > 0.03) {
        r = 1.0; g = 0.85; b = 0.0; // Yellow caution
      }

      // Slightly elevated above track surface
      const center = s.point.clone().addScaledVector(s.normal, 0.08);
      const left = center.clone().addScaledVector(s.binormal, -ribbonWidth * 0.5);
      const right = center.clone().addScaledVector(s.binormal, ribbonWidth * 0.5);

      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);

      colors.push(r, g, b, this.opacity);
      colors.push(r, g, b, this.opacity);

      const base = positions.length / 3 - 2;
      if (i < samples.length - 1 && !samples[i + 1].isGap) {
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: this.opacity,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.visible = this.visible;
    this.scene.add(this.mesh);
  }

  setVisible(visible) {
    this.visible = visible;
    if (this.mesh) this.mesh.visible = visible;
  }

  setOpacity(opacity) {
    this.opacity = opacity;
    if (this.mesh && this.mesh.material) {
      this.mesh.material.opacity = opacity;
    }
  }

  update(playerPhysics) {
    if (!this.visible || !this.mesh) return;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}

window.RacingLineManager = RacingLineManager;
