/**
 * Turbo Rush - Emerald Highway Countryside Scenery System
 * 
 * Generates an authentic countryside environment:
 * - Rolling green pastures & gentle hillside terrain
 * - Instanced countryside trees (English oaks, Scots pines, willow groves)
 * - Wooden post-and-rail farm fencing along agricultural sectors
 * - Roadside utility poles with transmission lines
 * - Countryside barns, grain silos, and rock ridges near the Blackwood Pass
 * - Concrete drainage culverts with sloped headwalls
 */

(function() {
  class EmeraldHighwayScenery {
    constructor(scene, trackManager) {
      this.scene = scene;
      this.track = trackManager;
      this.objects = [];

      this.init();
    }

    init() {
      if (!this.track || !this.track.splineSamples || this.track.splineSamples.length === 0) return;

      this.buildTreesAndFoliage();
      this.buildFarmFences();
      this.buildUtilityPoles();
      this.buildFarmlandStructures();
      this.buildMountainRidges();
      this.buildDrainageCulverts();
    }

    // ─────────────────────────────────────────────
    // 1. TREES & COUNTRYSIDE FOLIAGE
    // ─────────────────────────────────────────────
    buildTreesAndFoliage() {
      const samples = this.track.splineSamples;

      // Tree Materials
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.9 });
      const oakFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2e6b27, roughness: 0.85 });
      const pineFoliageMat = new THREE.MeshStandardMaterial({ color: 0x1b4324, roughness: 0.85 });
      const willowFoliageMat = new THREE.MeshStandardMaterial({ color: 0x487e36, roughness: 0.80 });

      // Trunk and Canopy Geometries
      const trunkGeom = new THREE.CylinderGeometry(0.35, 0.55, 4.0, 7);
      const oakCanopyGeom = new THREE.SphereGeometry(3.5, 7, 6);
      const pineCanopyGeom = new THREE.ConeGeometry(2.8, 6.5, 6);

      // Distribute trees along the highway perimeter (excluding tunnel u = 0.35 to 0.44)
      for (let i = 0; i < samples.length; i += 4) {
        const s = samples[i];
        if (s.u >= 0.35 && s.u <= 0.44) continue; // Tunnel interior

        [-1, 1].forEach(side => {
          // Place trees outside highway shoulder & median
          const dist = (s.width * 0.5) + 12.0 + Math.random() * 32.0;
          const pos = s.point.clone().addScaledVector(s.binormal, side * dist);

          const isPine = (s.u > 0.30 && s.u < 0.50) || Math.random() > 0.6;
          const treeGroup = new THREE.Group();

          // Trunk
          const trunk = new THREE.Mesh(trunkGeom, trunkMat);
          trunk.position.y = 2.0;
          trunk.castShadow = true;
          treeGroup.add(trunk);

          // Foliage Canopy
          if (isPine) {
            const canopy = new THREE.Mesh(pineCanopyGeom, pineFoliageMat);
            canopy.position.y = 6.0;
            canopy.castShadow = true;
            treeGroup.add(canopy);
          } else {
            const canopy = new THREE.Mesh(oakCanopyGeom, Math.random() > 0.5 ? oakFoliageMat : willowFoliageMat);
            canopy.position.y = 5.5;
            canopy.scale.set(1.0 + Math.random() * 0.3, 0.85 + Math.random() * 0.3, 1.0 + Math.random() * 0.3);
            canopy.castShadow = true;
            treeGroup.add(canopy);
          }

          treeGroup.position.copy(pos);
          treeGroup.position.y = Math.max(0, s.point.y - 0.2);
          treeGroup.rotation.y = Math.random() * Math.PI * 2;
          const sc = 0.75 + Math.random() * 0.6;
          treeGroup.scale.set(sc, sc, sc);

          this.scene.add(treeGroup);
          this.objects.push(treeGroup);
        });
      }
    }

    // ─────────────────────────────────────────────
    // 2. WOODEN POST-AND-RAIL FARM FENCING
    // ─────────────────────────────────────────────
    buildFarmFences() {
      // Valley Agricultural Sector: u ~ 0.10 to 0.32
      const samples = this.track.splineSamples.filter(s => (s.u >= 0.08 && s.u <= 0.32) || (s.u >= 0.65 && s.u <= 0.92));
      if (samples.length < 2) return;

      const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5a4632,
        roughness: 0.95
      });

      const postGeom = new THREE.CylinderGeometry(0.08, 0.09, 1.4, 6);
      const railGeom = new THREE.BoxGeometry(0.06, 0.12, 10.0);

      for (let i = 0; i < samples.length - 1; i += 3) {
        const s = samples[i];
        const sNext = samples[Math.min(samples.length - 1, i + 3)];

        // Outer fence line along countryside pastures
        const fenceDist = (s.width * 0.5) + 6.8;
        const pos = s.point.clone().addScaledVector(s.binormal, fenceDist);

        // Fence post
        const post = new THREE.Mesh(postGeom, woodMat);
        post.position.copy(pos).addScaledVector(s.normal, 0.7);
        post.castShadow = true;
        this.scene.add(post);
        this.objects.push(post);

        // Horizontal rails
        const railTop = new THREE.Mesh(railGeom, woodMat);
        railTop.position.copy(pos).addScaledVector(s.normal, 1.05);
        railTop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
        this.scene.add(railTop);
        this.objects.push(railTop);

        const railBtm = new THREE.Mesh(railGeom, woodMat);
        railBtm.position.copy(pos).addScaledVector(s.normal, 0.55);
        railBtm.quaternion.copy(railTop.quaternion);
        this.scene.add(railBtm);
        this.objects.push(railBtm);
      }
    }

    // ─────────────────────────────────────────────
    // 3. ROADSIDE UTILITY TRANSMISSION POLES
    // ─────────────────────────────────────────────
    buildUtilityPoles() {
      const samples = this.track.splineSamples;
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x3e3226, roughness: 0.9 });
      const crossMat = new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 0.85 });
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

      const poleGeom = new THREE.CylinderGeometry(0.18, 0.25, 9.5, 8);
      const crossGeom = new THREE.BoxGeometry(2.4, 0.15, 0.15);

      let prevCrossPos = null;

      for (let i = 0; i < samples.length; i += 12) {
        const s = samples[i];
        if (s.u >= 0.35 && s.u <= 0.44) continue; // Tunnel

        const poleDist = (s.width * 0.5) + 8.5;
        const pos = s.point.clone().addScaledVector(s.binormal, poleDist);

        const poleGroup = new THREE.Group();
        const pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.y = 4.75;
        pole.castShadow = true;
        poleGroup.add(pole);

        const crossbar = new THREE.Mesh(crossGeom, crossMat);
        crossbar.position.set(0, 8.8, 0);
        poleGroup.add(crossbar);

        poleGroup.position.copy(pos);
        poleGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
        this.scene.add(poleGroup);
        this.objects.push(poleGroup);

        // Connect transmission wires between consecutive poles
        const crossPos = pos.clone().add(new THREE.Vector3(0, 8.8, 0));
        if (prevCrossPos && prevCrossPos.distanceTo(crossPos) < 140) {
          const wireDist = prevCrossPos.distanceTo(crossPos);
          const wireGeom = new THREE.CylinderGeometry(0.015, 0.015, wireDist, 4);
          const wire = new THREE.Mesh(wireGeom, wireMat);

          const mid = new THREE.Vector3().addVectors(prevCrossPos, crossPos).multiplyScalar(0.5);
          mid.y -= 0.6; // Sag
          wire.position.copy(mid);
          wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(crossPos, prevCrossPos).normalize());
          this.scene.add(wire);
          this.objects.push(wire);
        }
        prevCrossPos = crossPos;
      }
    }

    // ─────────────────────────────────────────────
    // 4. FARMLAND BARNS, SILOS & HAY BALES
    // ─────────────────────────────────────────────
    buildFarmlandStructures() {
      // Placed around Willow Creek Valley (Sector 2 & 3)
      const barnSites = [
        { u: 0.18, offset: 48, side: 1, angle: 0.3 },
        { u: 0.28, offset: 55, side: -1, angle: -0.4 },
        { u: 0.72, offset: 52, side: 1, angle: 0.8 }
      ];

      const redBarnMat = new THREE.MeshStandardMaterial({ color: 0x8b1e1e, roughness: 0.85 });
      const roofBarnMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.6 });
      const siloMat = new THREE.MeshStandardMaterial({ color: 0x8c949e, metalness: 0.8, roughness: 0.3 });
      const hayMat = new THREE.MeshStandardMaterial({ color: 0xc2a649, roughness: 0.95 });

      barnSites.forEach(site => {
        const s = this.track.getSampleAt(site.u);
        if (!s) return;

        const farmGroup = new THREE.Group();

        // Main Barn Body
        const barn = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 22), redBarnMat);
        barn.position.set(0, 3.5, 0);
        barn.castShadow = true;
        farmGroup.add(barn);

        // Gambrel Roof
        const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 4.5, 4), roofBarnMat);
        roof.position.set(0, 9.25, 0);
        roof.rotation.y = Math.PI * 0.25;
        roof.scale.set(1.0, 1.0, 1.5);
        roof.castShadow = true;
        farmGroup.add(roof);

        // Cylindrical Grain Silo
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 14, 16), siloMat);
        silo.position.set(10.5, 7.0, -4.0);
        silo.castShadow = true;
        farmGroup.add(silo);

        const siloDome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), siloMat);
        siloDome.position.set(10.5, 14.0, -4.0);
        farmGroup.add(siloDome);

        // Rolled Hay Bales
        const baleGeom = new THREE.CylinderGeometry(1.0, 1.0, 1.6, 12);
        baleGeom.rotateZ(Math.PI * 0.5);
        for (let b = 0; b < 4; b++) {
          const bale = new THREE.Mesh(baleGeom, hayMat);
          bale.position.set(-8 + b * 2.2, 1.0, 12 + Math.random() * 3);
          bale.rotation.y = Math.random() * 0.5;
          farmGroup.add(bale);
        }

        const pos = s.point.clone().addScaledVector(s.binormal, site.side * site.offset);
        farmGroup.position.copy(pos);
        farmGroup.position.y = Math.max(0, s.point.y - 0.2);
        farmGroup.rotation.y = site.angle;

        this.scene.add(farmGroup);
        this.objects.push(farmGroup);
      });
    }

    // ─────────────────────────────────────────────
    // 5. ROCK RIDGES & CLIFF FACES (BLACKWOOD PASS)
    // ─────────────────────────────────────────────
    buildMountainRidges() {
      // Mountain ridge through which the rock-cut tunnel is excavated
      const ridgeU = 0.395;
      const sCenter = this.track.getSampleAt(ridgeU);
      if (!sCenter) return;

      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x33373e,
        roughness: 0.95,
        metalness: 0.15
      });

      // Flanking mountain masses on both sides of the highway
      [-1, 1].forEach(side => {
        const ridgeGroup = new THREE.Group();

        for (let r = 0; r < 5; r++) {
          const h = 24 + Math.random() * 18;
          const w = 32 + Math.random() * 20;
          const d = 40 + Math.random() * 25;

          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(w * 0.5, 1), rockMat);
          rock.scale.set(1.0, h / (w * 0.5), d / (w * 0.5));
          rock.position.set(side * (40 + r * 15), h * 0.35, (r - 2) * 35);
          rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.2);
          rock.castShadow = true;
          ridgeGroup.add(rock);
        }

        ridgeGroup.position.copy(sCenter.point);
        this.scene.add(ridgeGroup);
        this.objects.push(ridgeGroup);
      });
    }

    // ─────────────────────────────────────────────
    // 6. HIGHWAY DRAINAGE CULVERTS
    // ─────────────────────────────────────────────
    buildDrainageCulverts() {
      const culvertLocations = [0.15, 0.29, 0.62, 0.81];
      const concreteMat = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.9 });
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a2e28, roughness: 0.1, metalness: 0.8 });

      culvertLocations.forEach(u => {
        const s = this.track.getSampleAt(u);
        if (!s) return;

        [-1, 1].forEach(side => {
          const pos = s.point.clone().addScaledVector(s.binormal, side * (s.width * 0.5 + 4.2));

          const headwall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 0.8), concreteMat);
          headwall.position.copy(pos).addScaledVector(s.normal, -0.4);
          const rotMat = new THREE.Matrix4().makeBasis(s.binormal, s.normal, s.tangent);
          headwall.quaternion.setFromRotationMatrix(rotMat);
          this.scene.add(headwall);
          this.objects.push(headwall);

          // Pipe opening
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12), concreteMat);
          pipe.rotation.x = Math.PI * 0.5;
          pipe.position.copy(headwall.position);
          this.scene.add(pipe);
          this.objects.push(pipe);
        });
      });
    }

    destroy() {
      this.objects.forEach(obj => {
        if (obj.parent) obj.parent.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      this.objects = [];
    }
  }

  window.EmeraldHighwayScenery = EmeraldHighwayScenery;
})();
