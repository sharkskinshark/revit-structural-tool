/**
 * Scene3D — Three.js 3D viewport.
 *
 * OrbitControls + click-to-select (yellow highlight) + auto zoom-fit.
 * Extracted from App.tsx during the component split.
 */
import React, { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  getVolumeElev, getColumnSize, getFloorBottom, getFloorTop,
  getFireRating, TYPES, USE_TYPES,
} from "../lib/buildingModel";

export default function Scene3D({ gridX, gridY, typicalH, exceptions, maxBX, maxBY, volumes, selected, onSelect, onSelectElement, dwall, columns, beams, slabs, totalAbove, show }) {
  const ref = useRef();
  const af = useRef(0);
  const meshMap = useRef({});
  const controlsRef = useRef<any>(null);
  const selectedMeshRef = useRef<any>(null);
  const camStateRef = useRef<any>(null);            // 跨 re-render 保存相機位置
  const tweenRef = useRef<any>(null);                // { posFrom, posTo, tgtFrom, tgtTo, t0, dur }
  const initialFitRef = useRef<any>(null);           // { center, radius } 用於 reset
  const [, forceRerender] = useState(0);        // 給 overlay 按鈕用

  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const W = m.clientWidth, H = m.clientHeight;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x0e0e1a);
    const cam = new THREE.PerspectiveCamera(45, W/H, 1, 500000);
    const ren = new THREE.WebGLRenderer({ antialias:true });
    ren.setSize(W, H);
    ren.setPixelRatio(Math.min(devicePixelRatio, 2));
    m.innerHTML = "";
    m.appendChild(ren.domElement);

    sc.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7);
    dl.position.set(1, 2, 1.5);
    sc.add(dl);
    sc.add(new THREE.DirectionalLight(0x5577aa, 0.3).translateX(-2));

    // Grid lines
    const gMat = new THREE.LineBasicMaterial({ color:0x2a2a44 });
    for (let i = 0; i <= maxBX; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i*gridX, 0, -800),
        new THREE.Vector3(i*gridX, 0, maxBY*gridY+800)
      ]);
      sc.add(new THREE.Line(g, gMat));
    }
    for (let j = 0; j <= maxBY; j++) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-800, 0, j*gridY),
        new THREE.Vector3(maxBX*gridX+800, 0, j*gridY)
      ]);
      sc.add(new THREE.Line(g, gMat));
    }

    const gpSize = Math.max(maxBX*gridX, maxBY*gridY) + 6000;
    const gp = new THREE.Mesh(
      new THREE.PlaneGeometry(gpSize, gpSize),
      new THREE.MeshPhongMaterial({ color:0x151520, side:THREE.DoubleSide })
    );
    gp.rotation.x = -Math.PI/2;
    gp.position.set(maxBX*gridX/2, -0.5, maxBY*gridY/2);
    sc.add(gp);

    const glPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(gpSize, gpSize),
      new THREE.MeshPhongMaterial({ color:0x335533, side:THREE.DoubleSide, transparent:true, opacity:0.06 })
    );
    glPlane.rotation.x = -Math.PI/2;
    glPlane.position.set(maxBX*gridX/2, 0, maxBY*gridY/2);
    sc.add(glPlane);

    meshMap.current = {};

    // ═══ Diaphragm Wall ═══
    if (dwall && show.dwall) {
      const dH = dwall.depthMm;
      const dT = dwall.thickness;
      const dwMat = new THREE.MeshPhongMaterial({
        color: 0xaa7755, transparent:true, opacity:0.6, side:THREE.DoubleSide
      });
      const ox1 = dwall.x1 * gridX - dT/2;
      const ox2 = dwall.x2 * gridX + dT/2;
      const oy1 = dwall.y1 * gridY - dT/2;
      const oy2 = dwall.y2 * gridY + dT/2;
      const wx = ox2 - ox1, wy = oy2 - oy1;
      const walls = [
        { w: wx, d: dT, x: (ox1+ox2)/2, z: oy2 - dT/2 },
        { w: wx, d: dT, x: (ox1+ox2)/2, z: oy1 + dT/2 },
        { w: dT, d: wy - dT*2, x: ox2 - dT/2, z: (oy1+oy2)/2 },
        { w: dT, d: wy - dT*2, x: ox1 + dT/2, z: (oy1+oy2)/2 },
      ];
      walls.forEach(({w,d,x,z}, idx) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, dH, d), dwMat.clone());
        mesh.position.set(x, -dH/2, z);
        mesh.userData = {
          info: {
            "構件": "🟫 連續壁 D-Wall",
            "Family/Type": dwall.type,
            "厚度": `${dwall.thickness} mm`,
            "深度": `${dwall.depth.toFixed(1)} m`,
            "範圍": `${(dwall.x2-dwall.x1)*gridX/1000}m × ${(dwall.y2-dwall.y1)*gridY/1000}m`,
            "fc'": "280 kgf/cm²",
            "防火時效": "3 小時 (地下室主要構造)",
            "施工": dwall.note,
          }
        };
        sc.add(mesh);
      });
    }

    // ═══ Volumes ═══
    if (show.volumes) {
      volumes.forEach(v => {
        const { bottom, top, height } = getVolumeElev(v, typicalH, exceptions);
        if (height <= 0) return;
        const w = (v.x2 - v.x1) * gridX;
        const d = (v.y2 - v.y1) * gridY;
        if (w <= 0 || d <= 0) return;

        const color = new THREE.Color(v.color);
        const isSelected = selected === v.id;
        const isCore = v.type === "core";
        const opacity = isSelected ? 0.6 : (isCore ? 0.45 : (v.opacity || 0.3));
        const mat = new THREE.MeshPhongMaterial({
          color, transparent:true, opacity, side: THREE.DoubleSide,
        });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), mat);
        const cx = v.x1 * gridX + w/2;
        const cy = (bottom + top) / 2;
        const cz = v.y1 * gridY + d/2;
        box.position.set(cx, cy, cz);
        sc.add(box);

        const wireColor = isSelected ? 0xffdd44 : (isCore ? 0xff8866 : 0xffffff);
        const wire = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(w, height, d)),
          new THREE.LineBasicMaterial({
            color: wireColor,
            opacity: isSelected ? 1 : (isCore ? 0.5 : 0.25), transparent:true
          })
        );
        wire.position.copy(box.position);
        sc.add(wire);

        // Service core: shear walls
        if (isCore) {
          const swT = 300;
          const swMat = new THREE.MeshPhongMaterial({ color:0xcc6644, transparent:true, opacity:0.85 });
          const walls = [
            { w: w, d: swT, ox: 0, oz: -d/2 + swT/2 },
            { w: w, d: swT, ox: 0, oz: d/2 - swT/2 },
            { w: swT, d: d - swT*2, ox: -w/2 + swT/2, oz: 0 },
            { w: swT, d: d - swT*2, ox: w/2 - swT/2, oz: 0 },
          ];
          walls.forEach(({w:ww, d:dd, ox, oz}, idx) => {
            const sw = new THREE.Mesh(new THREE.BoxGeometry(ww, height, dd), swMat.clone());
            sw.position.set(cx + ox, cy, cz + oz);
            sw.userData = {
              info: {
                "構件": "🟥 剪力牆 Shear Wall",
                "Family/Type": "RC-SW-300",
                "厚度": "300 mm",
                "高度": `${(height/1000).toFixed(1)} m`,
                "fc'": "280 kgf/cm²",
                "fy": "4200 kgf/cm²",
                "防火時效": "2 小時 (§70 承重牆)",
                "用途": "服務核側向勁度",
                "面": ["北面","南面","西面","東面"][idx] || "",
              }
            };
            sc.add(sw);
          });
        }

        // Add info to volume box too
        box.userData = {
          info: {
            "構件": "📦 量體 Volume",
            "名稱": v.name,
            "類型": TYPES.find(t => t.value === v.type)?.label || v.type,
            "用途": USE_TYPES[v.useType]?.label || v.useType,
            "樓層": `${v.startF<0?`B${Math.abs(v.startF)}F`:`${v.startF}F`} ~ ${v.endF}F`,
            "尺寸": `${w}mm × ${d}mm × ${(height/1000).toFixed(1)}m`,
          },
          volumeId: v.id,
        };

        meshMap.current[v.id] = box;
      });
    }

    // ═══ Columns (with tapering & fc') ═══
    if (show.columns && columns) {
      columns.forEach(cl => {
        if (cl.inCore) return;
        // Render column segment by segment using getColumnSize
        for (let f = cl.minF; f <= cl.maxF; f++) {
          if (f === 0) continue;
          const { dim, fc } = getColumnSize(f, totalAbove);
          const yBot = getFloorBottom(f, typicalH, exceptions);
          const yTop = getFloorTop(f, typicalH, exceptions);
          const h = yTop - yBot;
          if (h <= 0) continue;
          const colColor = fc >= 350 ? 0x6688dd : fc >= 280 ? 0x4488cc : 0x4477aa;
          const col = new THREE.Mesh(
            new THREE.BoxGeometry(dim, h, dim),
            new THREE.MeshPhongMaterial({ color: colColor })
          );
          col.position.set(cl.i * gridX, (yBot + yTop) / 2, cl.j * gridY);
          col.userData = {
            info: {
              "構件": "🟦 柱 Column",
              "Family/Type": `RC-C-${dim}×${dim}-fc${fc}`,
              "格點": `${String.fromCharCode(65+cl.i)}${cl.j+1}`,
              "樓層": f<0?`B${Math.abs(f)}F`:`${f}F`,
              "斷面": `${dim} × ${dim} mm`,
              "fc'": `${fc} kgf/cm²`,
              "fy": "4200 kgf/cm²",
              "防火時效": `${getFireRating(f, totalAbove, Math.abs(Math.min(...volumes.map(v=>v.startF),0)), "column")} 小時 (§70)`,
              "材料": "鋼筋混凝土 (RC)",
            }
          };
          sc.add(col);
        }
      });
    }

    // ═══ Beams ═══
    if (show.beams && beams) {
      const beamMat = new THREE.MeshPhongMaterial({ color:0xcc7744 });
      beams.forEach(b => {
        const w = b.dir === "X" ? b.length : b.B;
        const d = b.dir === "X" ? b.B : b.length;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, b.D, d), beamMat.clone());
        mesh.position.set(b.cx, b.cy, b.cz);
        mesh.userData = {
          info: {
            "構件": "🟧 梁 Beam",
            "Family/Type": b.type,
            "方向": `${b.dir} 向`,
            "樓層": b.floor<0?`B${Math.abs(b.floor)}F`:`${b.floor}F`,
            "斷面": `${b.B} × ${b.D} mm`,
            "跨距": `${b.span} mm`,
            "fc'": "280 kgf/cm²",
            "fy": "4200 kgf/cm²",
            "防火時效": `${getFireRating(b.floor, totalAbove, Math.abs(Math.min(...volumes.map(v=>v.startF),0)), "beam")} 小時 (§70)`,
            "材料": "鋼筋混凝土 (RC)",
          }
        };
        sc.add(mesh);
      });
    }

    // ═══ Slabs ═══
    if (show.slabs && slabs) {
      slabs.forEach(s => {
        const w = (s.x2 - s.x1) * gridX;
        const d = (s.y2 - s.y1) * gridY;
        if (w <= 0 || d <= 0) return;
        // Structural slab
        const slMat = new THREE.MeshPhongMaterial({
          color: 0x667788, transparent:true, opacity:0.55, side:THREE.DoubleSide
        });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, s.structThick, d), slMat);
        slab.position.set(
          s.x1 * gridX + w/2,
          s.elev - s.structThick / 2,
          s.y1 * gridY + d/2
        );
        slab.userData = {
          info: {
            "構件": "⬜ 樓板 Slab (結構)",
            "Family/Type": s.type,
            "樓層": s.floor<0?`B${Math.abs(s.floor)}F`:`${s.floor}F`,
            "結構厚度": `${s.structThick} mm`,
            "隔音層": s.soundLayer>0?`+ ${s.soundLayer} mm`:"無",
            "總厚度": `${s.totalThick} mm`,
            "用途": s.useType,
            "fc'": "280 kgf/cm²",
            "防火時效": `${getFireRating(s.floor, totalAbove, Math.abs(Math.min(...volumes.map(v=>v.startF),0)), "slab")} 小時 (§70)`,
            "隔音法規": s.soundLayer>0?"§46-6 ΔLw≥17dB":"-",
          }
        };
        sc.add(slab);
        // Sound insulation layer (if any)
        if (s.soundLayer > 0) {
          const siMat = new THREE.MeshPhongMaterial({
            color: 0xcc8855, transparent:true, opacity:0.5, side:THREE.DoubleSide
          });
          const si = new THREE.Mesh(new THREE.BoxGeometry(w, s.soundLayer, d), siMat);
          si.position.set(
            s.x1 * gridX + w/2,
            s.elev + s.soundLayer / 2,
            s.y1 * gridY + d/2
          );
          si.userData = {
            info: {
              "構件": "🟫 隔音層 Sound Insulation",
              "樓層": s.floor<0?`B${Math.abs(s.floor)}F`:`${s.floor}F`,
              "厚度": `${s.soundLayer} mm`,
              "組成": "橡膠緩衝材 8mm + 水泥砂漿 60mm",
              "法規依據": "建築技術規則 §46-6",
              "性能要求": "Ln,w ≤ 58 dB / ΔLw ≥ 17 dB",
              "用途": s.useType,
            }
          };
          sc.add(si);
        }
      });
    }

    // ─── 場景包圍球（用於 OrbitControls 距離限制與 reset）───
    const allTops = volumes.map(v => getVolumeElev(v, typicalH, exceptions).top);
    const allBottoms = volumes.map(v => getVolumeElev(v, typicalH, exceptions).bottom);
    const top = Math.max(...allTops, 0);
    const bottom = Math.min(...allBottoms, 0);
    const allH = top - bottom;
    const allW = Math.max(maxBX * gridX, maxBY * gridY);
    const mD = Math.max(allH, allW) || 30000;
    const cx0 = maxBX * gridX / 2, cz0 = maxBY * gridY / 2;
    const cy0 = (top + bottom) / 2;
    initialFitRef.current = { center: new THREE.Vector3(cx0, cy0, cz0), radius: mD / 2 };

    // ─── OrbitControls ───
    const controls = new OrbitControls(cam, ren.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.8;
    controls.screenSpacePanning = true;
    controls.minDistance = mD * 0.05;
    controls.maxDistance = mD * 8;
    controls.maxPolarAngle = Math.PI - 0.05; // 允許從低角度看，但避免完全翻過去
    controls.minPolarAngle = 0.05;
    controls.target.set(cx0, cy0, cz0);

    // 還原相機位置（如果之前存過），否則用預設視角
    if (camStateRef.current) {
      cam.position.copy(camStateRef.current.pos);
      controls.target.copy(camStateRef.current.tgt);
    } else {
      const r0 = mD * 1.8, t0 = Math.PI/4, p0 = Math.PI/5.5;
      cam.position.set(cx0 + r0*Math.sin(p0)*Math.cos(t0), cy0 + r0*Math.cos(p0), cz0 + r0*Math.sin(p0)*Math.sin(t0));
    }
    controls.update();
    controlsRef.current = controls;

    // 使用者開始操作 → 取消進行中的 zoom-fit tween
    controls.addEventListener("start", () => { tweenRef.current = null; });

    // ─── 動畫迴圈（含 zoom-fit tween）───
    function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
    function an() {
      af.current = requestAnimationFrame(an);
      const tw = tweenRef.current;
      if (tw) {
        const k = Math.min(1, (performance.now() - tw.t0) / tw.dur);
        const e = easeInOutCubic(k);
        cam.position.lerpVectors(tw.posFrom, tw.posTo, e);
        controls.target.lerpVectors(tw.tgtFrom, tw.tgtTo, e);
        if (k >= 1) tweenRef.current = null;
      }
      controls.update();
      ren.render(sc, cam);
    }
    an();

    // ─── 點擊：選取 + 高亮 + 自動 zoom fit ───
    const cv = ren.domElement;
    const ray = new THREE.Raycaster(), m2 = new THREE.Vector2();
    const downPos = { x:0, y:0, t:0 };
    const oDown = e => { downPos.x = e.clientX; downPos.y = e.clientY; downPos.t = performance.now(); };

    function highlightMesh(mesh) {
      // 還原前一個
      const prev = selectedMeshRef.current;
      if (prev && prev !== mesh && prev.material && prev.userData._origEmissive !== undefined) {
        prev.material.emissive.setHex(prev.userData._origEmissive);
        prev.material.emissiveIntensity = prev.userData._origEmissiveIntensity ?? 0;
        prev.userData._origEmissive = undefined;
      }
      // 高亮新的
      if (mesh && mesh.material && mesh.material.emissive) {
        if (mesh.userData._origEmissive === undefined) {
          mesh.userData._origEmissive = mesh.material.emissive.getHex();
          mesh.userData._origEmissiveIntensity = mesh.material.emissiveIntensity ?? 0;
        }
        mesh.material.emissive.setHex(0xffee00);
        mesh.material.emissiveIntensity = 0.55;
      }
      selectedMeshRef.current = mesh;
    }

    function zoomFitMesh(mesh) {
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) return;
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const fov = cam.fov * Math.PI / 180;
      const aspect = cam.aspect || 1;
      const fovEff = aspect < 1 ? 2 * Math.atan(Math.tan(fov/2) / aspect) : fov;
      const distNew = (sphere.radius / Math.sin(fovEff / 2)) * 1.6; // 1.6 = padding
      const dir = new THREE.Vector3().subVectors(cam.position, controls.target).normalize();
      if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.6, 0.5).normalize();
      tweenRef.current = {
        posFrom: cam.position.clone(),
        posTo: sphere.center.clone().addScaledVector(dir, distNew),
        tgtFrom: controls.target.clone(),
        tgtTo: sphere.center.clone(),
        t0: performance.now(),
        dur: 450,
      };
    }

    const oClick = e => {
      // 過濾拖曳（移動超過 5px 視為 orbit/pan，不觸發選取）
      const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
      if (dx*dx + dy*dy > 25) return;

      const r2 = cv.getBoundingClientRect();
      m2.x = ((e.clientX - r2.left) / r2.width) * 2 - 1;
      m2.y = -((e.clientY - r2.top) / r2.height) * 2 + 1;
      ray.setFromCamera(m2, cam);
      const selectable = [];
      sc.traverse(o => { if (o.isMesh && o.userData?.info) selectable.push(o); });
      const its = ray.intersectObjects(selectable);
      if (its.length > 0) {
        const hit = its[0].object;
        highlightMesh(hit);
        zoomFitMesh(hit);
        if (onSelectElement) onSelectElement(hit.userData.info);
        if (hit.userData.volumeId) onSelect(hit.userData.volumeId);
      }
    };

    cv.addEventListener("mousedown", oDown);
    cv.addEventListener("click", oClick);

    const oR = () => {
      cam.aspect = m.clientWidth/m.clientHeight;
      cam.updateProjectionMatrix();
      ren.setSize(m.clientWidth, m.clientHeight);
    };
    window.addEventListener("resize", oR);

    // 強制觸發一次 re-render 讓 overlay 按鈕能拿到 controlsRef
    forceRerender(n => n + 1);

    return () => {
      // 保存相機狀態跨 re-render
      camStateRef.current = { pos: cam.position.clone(), tgt: controls.target.clone() };
      cancelAnimationFrame(af.current);
      cv.removeEventListener("mousedown", oDown);
      cv.removeEventListener("click", oClick);
      window.removeEventListener("resize", oR);
      controls.dispose();
      controlsRef.current = null;
      selectedMeshRef.current = null;
      tweenRef.current = null;
      ren.dispose(); sc.clear();
    };
  }, [gridX, gridY, typicalH, exceptions, maxBX, maxBY, volumes, selected, dwall, columns, beams, slabs, totalAbove, show]);

  // ─── overlay 按鈕：手動 zoom in / out / reset ───
  function tweenTo(posTo, tgtTo, dur = 350) {
    const c = controlsRef.current; if (!c) return;
    tweenRef.current = {
      posFrom: c.object.position.clone(),
      posTo,
      tgtFrom: c.target.clone(),
      tgtTo,
      t0: performance.now(),
      dur,
    };
  }
  const zoomBy = factor => {
    const c = controlsRef.current; if (!c) return;
    const dir = new THREE.Vector3().subVectors(c.object.position, c.target);
    dir.multiplyScalar(factor);
    tweenTo(c.target.clone().add(dir), c.target.clone(), 200);
  };
  const onZoomIn = () => zoomBy(0.7);
  const onZoomOut = () => zoomBy(1.4);
  const onReset = () => {
    const c = controlsRef.current; const fit = initialFitRef.current; if (!c || !fit) return;
    const fov = c.object.fov * Math.PI / 180;
    const distNew = (fit.radius / Math.sin(fov / 2)) * 1.8;
    const dir = new THREE.Vector3().subVectors(c.object.position, c.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.6, 0.5).normalize();
    tweenTo(fit.center.clone().addScaledVector(dir, distNew), fit.center.clone(), 450);
    // 同時清掉選取高亮
    const prev = selectedMeshRef.current;
    if (prev && prev.material && prev.userData._origEmissive !== undefined) {
      prev.material.emissive.setHex(prev.userData._origEmissive);
      prev.material.emissiveIntensity = prev.userData._origEmissiveIntensity ?? 0;
      prev.userData._origEmissive = undefined;
    }
    selectedMeshRef.current = null;
  };

  const btn: React.CSSProperties = {
    width: 32, height: 32, background: "rgba(20,28,42,.92)", color: "#aaccee",
    border: "1px solid #2a4455", borderRadius: 4, cursor: "pointer",
    fontSize: 14, fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div ref={ref} style={{ width:"100%", height:"100%", cursor:"grab", position:"relative" }}>
      <div style={{ position:"absolute", top:8, right:8, zIndex:10, display:"flex", flexDirection:"column", gap:4 }}>
        <button title="放大 (Zoom in)" style={btn} onClick={onZoomIn}>＋</button>
        <button title="縮小 (Zoom out)" style={btn} onClick={onZoomOut}>−</button>
        <button title="重設視角 (Reset view)" style={btn} onClick={onReset}>⌂</button>
      </div>
    </div>
  );
}
