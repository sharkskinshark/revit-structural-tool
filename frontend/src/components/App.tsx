import React, { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { downloadDesignJson } from "../lib/exportDesign";

const COLORS = ["#3b6ea5","#5a8c5a","#a5783b","#8b5aa5","#a53b5e","#3ba5a5","#7a7a3b","#5a3b8b"];
const TYPES = [
  { value:"basement", label:"地下室", desc:"地下開挖範圍" },
  { value:"podium", label:"裙樓", desc:"低矮基座量體" },
  { value:"tower", label:"塔樓", desc:"主要高層量體" },
  { value:"core", label:"服務核", desc:"電梯/樓梯/管道間" },
  { value:"setback", label:"退縮量體", desc:"露臺退縮或局部量體" },
];

const DEFAULT_VOLUMES = [
  { id:1, name:"地下室", type:"basement", color:"#6b5b4a", startF:-3, endF:0, x1:0, x2:6, y1:0, y2:5, opacity:0.18, useType:"parking" },
  { id:2, name:"裙樓", type:"podium", color:"#4a6b8a", startF:1, endF:5, x1:0, x2:6, y1:0, y2:5, opacity:0.3, useType:"commercial" },
  { id:3, name:"塔樓A", type:"tower", color:"#4a8a6b", startF:6, endF:22, x1:1, x2:4, y1:1, y2:4, opacity:0.32, useType:"residential" },
  { id:4, name:"服務核", type:"core", color:"#aa6644", startF:-3, endF:22, x1:2, x2:3, y1:2, y2:3, opacity:0.5, useType:"core" },
];

const DEFAULT_EXCEPTIONS = [
  { floor:-1, height:4500, label:"機房/水箱/配電" },
  { floor:1, height:5000, label:"大廳挑高" },
  { floor:2, height:4500, label:"商場挑高" },
];

const USE_TYPES = {
  residential: { label:"住宅", needSI: true, slabStruct: 150, fc: 280 },
  commercial: { label:"商業", needSI: true, slabStruct: 150, fc: 280 },
  office: { label:"辦公", needSI: false, slabStruct: 150, fc: 280 },
  parking: { label:"停車", needSI: false, slabStruct: 200, fc: 280 },
  core: { label:"服務核", needSI: false, slabStruct: 0, fc: 280 },
};

// ═══════════════════════════════════════════════════════
// WIND ZONES (建築物耐風設計規範 - 50年回歸期基本設計風速)
// ═══════════════════════════════════════════════════════
const WIND_ZONES = {
  "47.5": { v: 47.5, label: "極強風區 47.5 m/s", areas: ["花蓮市","吉安鄉","恆春鎮","滿州鄉"] },
  "42.5": { v: 42.5, label: "強風區 42.5 m/s", areas: ["臺北市","基隆市","新北市部分","宜蘭沿海","花蓮部分"] },
  "37.5": { v: 37.5, label: "一般風區 37.5 m/s", areas: ["臺中","臺南","高雄等中西部"] },
  "32.5": { v: 32.5, label: "弱風區 32.5 m/s", areas: ["內陸盆地"] },
};

function getWindForLocation(location) {
  if (!location) return WIND_ZONES["37.5"];
  if (location.includes("花蓮市") || location.includes("吉安")) return WIND_ZONES["47.5"];
  if (location.includes("臺北") || location.includes("基隆") || location.includes("新北市-淡水")) return WIND_ZONES["42.5"];
  return WIND_ZONES["37.5"];
}

// ═══════════════════════════════════════════════════════
// FIRE RATING (建築技術規則 §70 - 自頂層起算)
// ═══════════════════════════════════════════════════════
function getFireRating(floor, totalAbove, totalBelow, element) {
  // floor in our convention: positive=above, negative=basement
  // Convert to "floors from top" - including basement
  let floorsFromTop;
  if (floor > 0) floorsFromTop = totalAbove - floor + 1;
  else if (floor < 0) floorsFromTop = totalAbove + Math.abs(floor);
  else return 0;
  
  // Per §70: column/beam: 1/2/3hr; slab: 1/2/2hr; wall: 1/1/2hr; roof: 0.5hr
  if (element === "column" || element === "beam") {
    if (floorsFromTop <= 4) return 1;
    if (floorsFromTop <= 14) return 2;
    return 3;
  } else if (element === "slab") {
    if (floorsFromTop <= 4) return 1;
    return 2;
  } else if (element === "wall") {
    if (floorsFromTop <= 14) return 1;
    return 2;
  }
  return 1;
}

// ═══════════════════════════════════════════════════════
// WIND/SEISMIC FORCE ESTIMATION (簡化版)
// ═══════════════════════════════════════════════════════
function estimateDesignForces(volumes, gridX, gridY, typicalH, exceptions, windV, structureSystem = "RC") {
  const maxFloor = Math.max(...volumes.map(v => v.endF), 0);
  const minFloor = Math.min(...volumes.map(v => v.startF), 0);
  const totalH = maxFloor > 0 ? getFloorBottom(maxFloor, typicalH, exceptions) + getH(maxFloor, typicalH, exceptions) : 0;
  const totalH_m = totalH / 1000;
  
  // Average plan dimensions (from largest volume)
  const sorted = [...volumes].sort((a,b) => 
    ((b.x2-b.x1)*(b.y2-b.y1)) - ((a.x2-a.x1)*(a.y2-a.y1))
  );
  const main = sorted[0] || { x1:0, x2:6, y1:0, y2:5 };
  const W_m = (main.x2 - main.x1) * gridX / 1000;
  const D_m = (main.y2 - main.y1) * gridY / 1000;
  
  // Basic wind pressure q = 0.06 * V^2 (kgf/m²) → /102 for kN/m²
  const q_kgfm2 = 0.06 * windV * windV;
  const q_kNm2 = q_kgfm2 / 102;
  // Design wind force (simplified: G*Cf*q*A, G=2.0 typical, Cf=1.3)
  const Cf = 1.3, G = 2.0;
  const totalAreaW = totalH_m * W_m;
  const totalAreaD = totalH_m * D_m;
  const windForceX_kN = q_kNm2 * Cf * G * totalAreaW;
  const windForceY_kN = q_kNm2 * Cf * G * totalAreaD;
  
  // Building weight estimate: 1.0 tf/m² × area × floors
  const totalArea = W_m * D_m;
  const totalFloors = volumes.reduce((max, v) => Math.max(max, v.endF - v.startF + 1), 1);
  const totalWeight_tf = totalArea * 1.0 * totalFloors;
  
  // Approximate period
  const Ct = structureSystem === "S" ? 0.085 : 0.07;
  const T = Ct * Math.pow(totalH_m, 0.75);
  
  return {
    windV, q_kgfm2: Math.round(q_kgfm2), q_kNm2: Math.round(q_kNm2 * 100) / 100,
    windForceX_kN: Math.round(windForceX_kN), windForceY_kN: Math.round(windForceY_kN),
    totalH_m: Math.round(totalH_m * 10) / 10,
    plan_W_m: W_m, plan_D_m: D_m,
    totalWeight_tf: Math.round(totalWeight_tf),
    period_T: Math.round(T * 100) / 100,
    aspectRatio: (totalH_m / Math.min(W_m, D_m)).toFixed(2),
  };
}

let nextId = 10;

// ═══════════════════════════════════════════════════════
// FLOOR HEIGHT CALCULATIONS
// ═══════════════════════════════════════════════════════
function getH(floor, typicalH, exceptions) {
  if (floor === 0) return 0;
  const exc = exceptions.find(e => e.floor === floor);
  return exc ? exc.height : typicalH;
}

function getFloorBottom(floor, typicalH, exceptions) {
  if (floor === 0) return 0;
  if (floor >= 1) {
    let e = 0;
    for (let f = 1; f < floor; f++) e += getH(f, typicalH, exceptions);
    return e;
  } else {
    let e = 0;
    for (let f = -1; f >= floor; f--) e -= getH(f, typicalH, exceptions);
    return e;
  }
}

function getFloorTop(floor, typicalH, exceptions) {
  if (floor === 0) return 0;
  return getFloorBottom(floor, typicalH, exceptions) + getH(floor, typicalH, exceptions);
}

function getVolumeElev(v, typicalH, exceptions) {
  let bottom, top;
  if (v.startF < 0 && v.endF === 0) {
    bottom = getFloorBottom(v.startF, typicalH, exceptions);
    top = 0;
  } else if (v.startF >= 1) {
    bottom = getFloorBottom(v.startF, typicalH, exceptions);
    top = getFloorBottom(v.endF, typicalH, exceptions) + getH(v.endF, typicalH, exceptions);
  } else if (v.startF < 0 && v.endF >= 1) {
    bottom = getFloorBottom(v.startF, typicalH, exceptions);
    top = getFloorBottom(v.endF, typicalH, exceptions) + getH(v.endF, typicalH, exceptions);
  } else {
    bottom = getFloorBottom(v.startF, typicalH, exceptions);
    top = getFloorBottom(v.endF, typicalH, exceptions);
  }
  return { bottom, top, height: top - bottom };
}

// ═══════════════════════════════════════════════════════
// STRUCTURAL ELEMENT GENERATION
// ═══════════════════════════════════════════════════════
function ru(v, s) { return Math.ceil(v / s) * s; }

// COLUMNS: derived from volume coverage at each grid intersection
function generateColumns(volumes, maxBX, maxBY) {
  const cols = [];
  for (let i = 0; i <= maxBX; i++) {
    for (let j = 0; j <= maxBY; j++) {
      let minF = Infinity, maxF = -Infinity, inCore = false;
      volumes.forEach(v => {
        if (i >= v.x1 && i <= v.x2 && j >= v.y1 && j <= v.y2) {
          minF = Math.min(minF, v.startF);
          maxF = Math.max(maxF, v.endF);
          if (v.type === "core") inCore = true;
        }
      });
      if (minF === Infinity) continue;
      cols.push({ i, j, minF, maxF, inCore });
    }
  }
  return cols;
}

// COLUMN TAPERING: simplified - 3 zones based on floors
function getColumnSize(floor, totalAboveFloors, ss = "RC") {
  // Group floors: lower (B+1F~3F), middle (4F~midpoint), upper
  const above = totalAboveFloors;
  let dim, fc;
  if (floor < 0 || floor <= 3) {
    dim = above >= 20 ? 800 : above >= 10 ? 700 : 600;
    fc = 350;
  } else if (floor <= Math.ceil(above * 0.6)) {
    dim = above >= 20 ? 700 : above >= 10 ? 650 : 550;
    fc = 280;
  } else {
    dim = above >= 20 ? 600 : above >= 10 ? 550 : 500;
    fc = 245;
  }
  return { dim, fc };
}

// BEAMS: at each floor of each volume, place beams along grid lines
function generateBeams(volumes, gridX, gridY, typicalH, exceptions, seismicLevel = "中等") {
  const beamMap = new Map();
  const depthRatio = seismicLevel === "特殊" ? 10 : seismicLevel === "中等" ? 12 : 14;
  
  volumes.forEach(v => {
    if (v.type === "core") return; // shear walls, not regular beams
    
    for (let f = v.startF; f <= v.endF; f++) {
      if (f === 0) continue;
      // Beams at top of each floor
      const elev = f > 0 ? getFloorTop(f, typicalH, exceptions) : getFloorTop(f, typicalH, exceptions);
      
      // X-direction beams (running along X axis, between Y-direction columns)
      for (let j = v.y1; j <= v.y2; j++) {
        for (let i = v.x1; i < v.x2; i++) {
          const span = gridX;
          const D = ru(span / depthRatio, 50);
          const B = ru(Math.max(D * 0.5, 300), 50);
          const key = `X-${i}-${j}-${f}`;
          if (beamMap.has(key)) continue;
          beamMap.set(key, {
            dir: "X", i, j, floor: f, elev, span, B, D,
            family: "RC-MB",
            type: `RC-MB-${B}x${D}`,
            // Position
            cx: (i + 0.5) * gridX,
            cy: elev - D / 2,
            cz: j * gridY,
            length: span,
            volType: v.type,
          });
        }
      }
      // Y-direction beams
      for (let i = v.x1; i <= v.x2; i++) {
        for (let j = v.y1; j < v.y2; j++) {
          const span = gridY;
          const D = ru(span / depthRatio, 50);
          const B = ru(Math.max(D * 0.5, 300), 50);
          const key = `Y-${i}-${j}-${f}`;
          if (beamMap.has(key)) continue;
          beamMap.set(key, {
            dir: "Y", i, j, floor: f, elev, span, B, D,
            family: "RC-MB",
            type: `RC-MB-${B}x${D}`,
            cx: i * gridX,
            cy: elev - D / 2,
            cz: (j + 0.5) * gridY,
            length: span,
            volType: v.type,
          });
        }
      }
    }
  });
  
  return Array.from(beamMap.values());
}

// SLABS: at each floor of each volume
function generateSlabs(volumes, gridX, gridY, typicalH, exceptions) {
  const slabMap = new Map();
  
  volumes.forEach(v => {
    if (v.type === "core") return;
    const useType = USE_TYPES[v.useType] || USE_TYPES.commercial;
    const structThick = useType.slabStruct;
    const soundLayer = useType.needSI ? 68 : 0;
    const totalThick = structThick + soundLayer;
    
    for (let f = v.startF; f <= v.endF; f++) {
      if (f === 0) continue;
      const elev = getFloorTop(f, typicalH, exceptions);
      const key = `${v.x1}-${v.x2}-${v.y1}-${v.y2}-${f}`;
      if (slabMap.has(key)) continue;
      const typeStr = soundLayer > 0
        ? `RC-Slab-${structThick}-SI${soundLayer}`
        : `RC-Slab-${structThick}`;
      slabMap.set(key, {
        floor: f, elev, x1: v.x1, x2: v.x2, y1: v.y1, y2: v.y2,
        structThick, soundLayer, totalThick,
        useType: useType.label,
        family: "RC-Slab",
        type: typeStr,
        volType: v.type,
      });
    }
  });
  
  return Array.from(slabMap.values());
}

// DIAPHRAGM WALL
function calculateDwall(volumes, typicalH, exceptions) {
  const basements = volumes.filter(v => v.type === "basement");
  if (basements.length === 0) return null;
  const minFloor = Math.min(...basements.map(v => v.startF));
  const depthMm = Math.abs(getFloorBottom(minFloor, typicalH, exceptions));
  const depth = depthMm / 1000;
  let thickness, note;
  if (depth <= 10) { thickness = 600; note = "淺開挖，單層支撐"; }
  else if (depth <= 15) { thickness = 800; note = "中深度，2~3層支撐"; }
  else if (depth <= 20) { thickness = 1000; note = "深開挖，多層支撐"; }
  else { thickness = 1200; note = "超深開挖，特殊工法"; }
  const x1 = Math.min(...basements.map(b => b.x1));
  const x2 = Math.max(...basements.map(b => b.x2));
  const y1 = Math.min(...basements.map(b => b.y1));
  const y2 = Math.max(...basements.map(b => b.y2));
  return { thickness, depth, depthMm, note, x1, x2, y1, y2, minFloor, type: `RC-DW-${thickness}` };
}

// FAMILY/TYPE INVENTORY for Revit
function generateFamilyTypes(columns, beams, slabs, dwall, hasCore, totalAbove) {
  // Columns - derive sizes by floor zone
  const colTypes = new Map();
  const allCols = columns.filter(c => !c.inCore);
  allCols.forEach(c => {
    for (let f = c.minF; f <= c.maxF; f++) {
      if (f === 0) continue;
      const { dim, fc } = getColumnSize(f, totalAbove);
      const t = `RC-C-${dim}x${dim}-fc${fc}`;
      if (!colTypes.has(t)) colTypes.set(t, { type: t, count: 0, dim, fc });
      colTypes.get(t).count++;
    }
  });
  
  const beamTypes = new Map();
  beams.forEach(b => {
    if (!beamTypes.has(b.type)) beamTypes.set(b.type, { type: b.type, count: 0, B: b.B, D: b.D });
    beamTypes.get(b.type).count++;
  });
  
  const slabTypes = new Map();
  slabs.forEach(s => {
    if (!slabTypes.has(s.type)) slabTypes.set(s.type, { type: s.type, count: 0, structThick: s.structThick, soundLayer: s.soundLayer });
    slabTypes.get(s.type).count++;
  });
  
  return {
    columns: Array.from(colTypes.values()).sort((a, b) => b.dim - a.dim),
    beams: Array.from(beamTypes.values()),
    slabs: Array.from(slabTypes.values()),
    walls: [
      ...(dwall ? [{ type: dwall.type, count: 1, thickness: dwall.thickness, role: "連續壁" }] : []),
      ...(hasCore ? [{ type: "RC-SW-300", count: 4, thickness: 300, role: "服務核剪力牆" }] : []),
    ],
  };
}

function detectTransferIssues(volumes) {
  const issues = [];
  const towers = volumes.filter(v => v.type === "tower");
  const podiums = volumes.filter(v => v.type === "podium");
  towers.forEach(t => {
    podiums.forEach(p => {
      if (t.startF > p.endF + 1) return;
      if (t.x1 < p.x1 || t.x2 > p.x2 || t.y1 < p.y1 || t.y2 > p.y2) {
        issues.push(`${t.name} 超出 ${p.name} → 需轉換層 (約${p.endF}F)`);
      }
    });
  });
  return issues;
}

// ═══════════════════════════════════════════════════════
// 3D SCENE
// ═══════════════════════════════════════════════════════
function Scene3D({ gridX, gridY, typicalH, exceptions, maxBX, maxBY, volumes, selected, onSelect, onSelectElement, dwall, columns, beams, slabs, totalAbove, show }) {
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

// ═══════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════
const S = {
  inp: { width:"100%", padding:"4px 6px", background:"#151528", color:"#ddd", border:"1px solid #2a2a44", borderRadius:3, fontSize:11, boxSizing:"border-box" },
  lbl: { display:"block", fontSize:9, color:"#6688aa", marginBottom:1, marginTop:6 },
};

function VolumeCard({ vol, isSelected, onClick, onChange, onDelete, maxBX, maxBY, typicalH, exceptions }) {
  const set = (k, isNum) => e => onChange({ ...vol, [k]: isNum ? Number(e.target.value) : e.target.value });
  const isCore = vol.type === "core";
  const { height } = getVolumeElev(vol, typicalH, exceptions);
  return (
    <div onClick={onClick} style={{
      background: isSelected ? "#1a1a33" : "#111122",
      border: isSelected ? "2px solid #ffdd44" : (isCore ? "1px solid #884422" : "1px solid #2a2a44"),
      borderRadius:6, padding:8, marginBottom:6, cursor:"pointer",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:2, background:vol.color }} />
          <span style={{ fontSize:12, fontWeight:700, color: isSelected ? "#ffdd44" : (isCore ? "#ee8866" : "#ccc") }}>
            {isCore && "🔲 "}{vol.name}
          </span>
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete(vol.id); }}
          style={{ background:"none", border:"none", color:"#664444", cursor:"pointer", fontSize:14 }}>✕</button>
      </div>

      {isSelected && (
        <div style={{ marginTop:6 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 8px" }}>
            <div><label style={S.lbl}>名稱</label>
              <input style={S.inp} value={vol.name} onChange={set("name", false)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>類型</label>
              <select style={S.inp} value={vol.type} onChange={set("type", false)} onClick={e => e.stopPropagation()}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label style={S.lbl}>用途</label>
              <select style={S.inp} value={vol.useType || "commercial"} onChange={set("useType", false)} onClick={e => e.stopPropagation()}>
                {Object.entries(USE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div></div>
            <div><label style={S.lbl}>起始樓層</label>
              <input style={S.inp} type="number" min={-10} max={50} value={vol.startF} onChange={set("startF", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>結束樓層</label>
              <input style={S.inp} type="number" min={-10} max={80} value={vol.endF} onChange={set("endF", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>X起始跨</label>
              <input style={S.inp} type="number" min={0} max={maxBX} value={vol.x1} onChange={set("x1", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>X結束跨</label>
              <input style={S.inp} type="number" min={0} max={maxBX} value={vol.x2} onChange={set("x2", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>Y起始跨</label>
              <input style={S.inp} type="number" min={0} max={maxBY} value={vol.y1} onChange={set("y1", true)} onClick={e => e.stopPropagation()} /></div>
            <div><label style={S.lbl}>Y結束跨</label>
              <input style={S.inp} type="number" min={0} max={maxBY} value={vol.y2} onChange={set("y2", true)} onClick={e => e.stopPropagation()} /></div>
          </div>
          <div style={{ fontSize:9, color:"#ccaa66", marginTop:6 }}>實際總高: {(height/1000).toFixed(2)}m</div>
        </div>
      )}

      {!isSelected && (
        <div style={{ fontSize:10, color:"#778" }}>
          {vol.startF < 0 ? `B${Math.abs(vol.startF)}F` : `${vol.startF}F`}~{vol.endF}F ・ {USE_TYPES[vol.useType]?.label || ""} ・ {(height/1000).toFixed(1)}m
        </div>
      )}
    </div>
  );
}

function FloorHeightEditor({ typicalH, setTypicalH, exceptions, setExceptions }) {
  const update = (i, k, v) => setExceptions(exs => exs.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const remove = i => setExceptions(exs => exs.filter((_, idx) => idx !== i));
  const add = () => setExceptions(exs => [...exs, { floor: 1, height: 4500, label: "新挑高層" }]);
  const sorted = [...exceptions].sort((a, b) => a.floor - b.floor);
  const sortedIndices = sorted.map(e => exceptions.indexOf(e));

  return (
    <div>
      <label style={S.lbl}>典型樓高 (mm)</label>
      <input style={S.inp} type="number" step={100} value={typicalH} onChange={e=>setTypicalH(Number(e.target.value))} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8, marginBottom:4 }}>
        <span style={{ fontSize:10, color:"#6688aa", fontWeight:600 }}>例外樓層</span>
        <button onClick={add} style={{ padding:"2px 6px", fontSize:9, background:"#1a3344", color:"#88bbcc", border:"1px solid #2a4455", borderRadius:2, cursor:"pointer" }}>+ 新增</button>
      </div>
      {sorted.map((e, di) => {
        const i = sortedIndices[di];
        const fl = e.floor;
        const lbl = fl < 0 ? `B${Math.abs(fl)}F` : `${fl}F`;
        return (
          <div key={i} style={{ background:"#181828", borderRadius:3, padding:5, marginBottom:3, border:"1px solid #2a2a44" }}>
            <div style={{ display:"grid", gridTemplateColumns:"38px 60px 1fr 18px", gap:4, alignItems:"center" }}>
              <input style={{...S.inp, padding:"2px 4px", fontSize:10, textAlign:"center"}}
                type="number" min={-10} max={50} value={e.floor} onChange={ev => update(i, "floor", Number(ev.target.value))} />
              <input style={{...S.inp, padding:"2px 4px", fontSize:10}}
                type="number" step={100} value={e.height} onChange={ev => update(i, "height", Number(ev.target.value))} />
              <input style={{...S.inp, padding:"2px 4px", fontSize:9}}
                value={e.label} onChange={ev => update(i, "label", ev.target.value)} placeholder="說明" />
              <button onClick={() => remove(i)} style={{ background:"none", border:"none", color:"#664444", cursor:"pointer", fontSize:11, padding:0 }}>✕</button>
            </div>
            <div style={{ fontSize:8, color:"#556", marginTop:1 }}>{lbl}: {e.height}mm</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// FAMILY/TYPE PANEL
// ═══════════════════════════════════════════════════════
function FamilyTypePanel({ families }) {
  const Section = ({ title, items, color, icon, render }) => (
    <div style={{ marginBottom:8 }}>
      <div style={{ color, fontSize:11, fontWeight:600, marginBottom:4 }}>{icon} {title} ({items.length} types)</div>
      {items.map((it, i) => (
        <div key={i} style={{
          background:"#181828", padding:"4px 6px", borderRadius:3, marginBottom:2, fontSize:10,
          border:"1px solid #2a2a44",
        }}>
          <div style={{ color:"#ccc", fontFamily:"monospace" }}>{it.type}</div>
          <div style={{ color:"#778", fontSize:9 }}>{render(it)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ fontSize:11, color:"#aabbcc", fontWeight:600, marginBottom:6 }}>
        🏗 Revit Family/Type 預覽
      </div>
      <div style={{ fontSize:9, color:"#556", marginBottom:8, lineHeight:"1.4" }}>
        以下為將生成到 Revit 的構件類型，搬到 Claude Code 後可自動建立 pyRevit 腳本
      </div>
      <Section title="柱 Column" icon="🟦" color="#88aacc" items={families.columns}
        render={it => `${it.dim}×${it.dim}mm, fc'=${it.fc} kgf/cm² (${it.count} 處)`} />
      <Section title="梁 Beam" icon="🟧" color="#cc8866" items={families.beams}
        render={it => `${it.B}×${it.D}mm (${it.count} 條)`} />
      <Section title="樓板 Slab" icon="⬜" color="#aabbaa" items={families.slabs}
        render={it => `結構${it.structThick}mm${it.soundLayer>0?` + 隔音${it.soundLayer}mm`:""} (${it.count} 片)`} />
      {families.walls.length > 0 && (
        <Section title="牆 Wall" icon="🟥" color="#cc8888" items={families.walls}
          render={it => `${it.thickness}mm - ${it.role} (${it.count} 處)`} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
function SummaryPanel({ volumes, gridX, gridY, typicalH, exceptions, dwall, transferIssues, families, totalAbove, selectedElement, location, windZone, designForces, seismicSDS, seismicSD1 }) {
  const cores = volumes.filter(v => v.type === "core");
  const towers = volumes.filter(v => v.type === "tower");
  const maxFloor = Math.max(...volumes.map(v => v.endF), 0);
  const minFloor = Math.min(...volumes.map(v => v.startF), 0);
  const totalH = maxFloor > 0 ? getFloorBottom(maxFloor, typicalH, exceptions) + getH(maxFloor, typicalH, exceptions) : 0;

  const R = ({l,v,c}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid #1a1a2a"}}>
      <span style={{color:"#667",fontSize:10}}>{l}</span>
      <span style={{color:c||"#ccc",fontSize:10,fontWeight:500}}>{v}</span>
    </div>
  );

  return (
    <div style={{ padding:10, overflowY:"auto", height:"100%" }}>
      {/* SELECTED ELEMENT - prominent display */}
      {selectedElement && (
        <div style={{
          background:"linear-gradient(135deg, #2a2238 0%, #1a1a3a 100%)",
          borderRadius:6, padding:10, marginBottom:10,
          border:"2px solid #ffdd44", boxShadow:"0 0 12px rgba(255,221,68,.15)"
        }}>
          <div style={{ color:"#ffdd44", fontSize:11, fontWeight:700, marginBottom:6, letterSpacing:1 }}>
            🔍 選取構件規格
          </div>
          {Object.entries(selectedElement).map(([k, v]) => (
            <div key={k} style={{
              display:"flex", justifyContent:"space-between", padding:"3px 0",
              borderBottom:"1px solid rgba(255,221,68,.1)", gap:8
            }}>
              <span style={{ color:"#aabbcc", fontSize:10, flexShrink:0 }}>{k}</span>
              <span style={{ color:"#ffeecc", fontSize:10, fontWeight:500, textAlign:"right",
                fontFamily: k==="Family/Type" ? "monospace" : "inherit" }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize:9, color:"#776644", marginTop:6, fontStyle:"italic" }}>
            點擊其他構件可切換顯示
          </div>
        </div>
      )}

      <div style={{ fontSize:13, fontWeight:700, color:"#88aacc", marginBottom:10, letterSpacing:1 }}>📊 量體摘要</div>

      {/* DESIGN TARGETS - core structural KPIs */}
      <div style={{
        background:"linear-gradient(135deg, #1a2a3a 0%, #1a1a3a 100%)",
        borderRadius:6, padding:9, marginBottom:8,
        border:"1px solid #2a4466"
      }}>
        <div style={{ color:"#66bbee", fontSize:11, fontWeight:700, marginBottom:6 }}>
          🎯 結構設計核心目標
        </div>
        <div style={{ borderTop:"1px solid #1a2a3a", paddingTop:4 }}>
          <div style={{ color:"#cc7766", fontSize:10, fontWeight:600, marginTop:3, marginBottom:3 }}>💨 抗風</div>
          <R l="工址" v={location} c="#aabbcc"/>
          <R l="基本設計風速" v={`${windZone.v} m/s`} c="#ddaa66"/>
          <R l="風速壓 q" v={`${designForces.q_kgfm2} kgf/m² (${designForces.q_kNm2} kN/m²)`}/>
          <R l="風力 X 向" v={`≈ ${designForces.windForceX_kN} kN`}/>
          <R l="風力 Y 向" v={`≈ ${designForces.windForceY_kN} kN`}/>
          <R l="迎風面 W×H" v={`${designForces.plan_W_m}×${designForces.totalH_m}m`}/>

          <div style={{ color:"#ee6666", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🌐 抗震</div>
          <R l="設計地震" v="475年回歸期" c="#aabbcc"/>
          <R l="SDS" v={seismicSDS.toFixed(2)} c="#ddaa66"/>
          <R l="SD1" v={seismicSD1.toFixed(2)} c="#ddaa66"/>
          <R l="基本振動週期 T" v={`${designForces.period_T} s`}/>
          <R l="高寬比 H/B" v={designForces.aspectRatio} c={parseFloat(designForces.aspectRatio) > 4 ? "#ee8866" : "#ccc"}/>
          <R l="總重 W" v={`≈ ${designForces.totalWeight_tf} tf`}/>

          <div style={{ color:"#ddbb44", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🔥 防火 (§70)</div>
          <R l="頂層~第4層" v="柱/梁 1hr｜板 1hr"/>
          <R l="第5~14層" v="柱/梁 2hr｜板 2hr"/>
          <R l="第15層以下" v="柱/梁 3hr｜板 2hr" c="#ddaa66"/>
          <div style={{ fontSize:9, color:"#778", marginTop:3, fontStyle:"italic" }}>
            ※ 含地下層數，自頂層起算
          </div>

          <div style={{ color:"#aaeeaa", fontSize:10, fontWeight:600, marginTop:8, marginBottom:3 }}>🧱 fc' 分區</div>
          <R l="B+1F~3F" v="fc'=350 kgf/cm²" c="#aaccaa"/>
          <R l="中段樓層" v="fc'=280 kgf/cm²"/>
          <R l="上段樓層" v="fc'=245 kgf/cm²"/>
        </div>
      </div>

      <div style={{ background:"#151528", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #2a2a44" }}>
        <R l="總高度" v={`${(totalH/1000).toFixed(1)}m / ${maxFloor}F`} />
        <R l="開挖深度" v={dwall ? `${dwall.depth.toFixed(1)}m / B${Math.abs(minFloor)}F` : "無"} />
        <R l="塔樓" v={towers.length ? `${towers.length}個` : "無"} />
        <R l="服務核" v={cores.length ? `${cores.length}個` : "無 ⚠"} c={cores.length === 0 ? "#cc8844" : "#ccc"} />
      </div>

      {dwall && (
        <div style={{ background:"#221c14", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #553322" }}>
          <div style={{ color:"#ccaa66", fontSize:11, fontWeight:600, marginBottom:4 }}>🧱 連續壁</div>
          <R l="厚度" v={`${dwall.thickness}mm`} c="#ddbb77" />
          <R l="深度" v={`${dwall.depth.toFixed(1)}m`} />
          <div style={{ color:"#aa8855", fontSize:9, marginTop:4 }}>{dwall.note}</div>
        </div>
      )}

      {transferIssues.length > 0 && (
        <div style={{ background:"#2a1818", borderRadius:5, padding:8, marginBottom:8, border:"1px solid #663333" }}>
          <div style={{ color:"#ee6666", fontSize:11, fontWeight:600, marginBottom:4 }}>🔴 結構轉換</div>
          {transferIssues.map((w,i) => <div key={i} style={{ color:"#cc8888", fontSize:10, marginBottom:2 }}>• {w}</div>)}
        </div>
      )}

      <FamilyTypePanel families={families} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function App() {
  const [gridX, setGridX] = useState(8000);
  const [gridY, setGridY] = useState(7000);
  const [typicalH, setTypicalH] = useState(3300);
  const [exceptions, setExceptions] = useState(DEFAULT_EXCEPTIONS);
  const [maxBX, setMaxBX] = useState(6);
  const [maxBY, setMaxBY] = useState(5);
  const [volumes, setVolumes] = useState(DEFAULT_VOLUMES);
  const [selId, setSelId] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [activeTab, setActiveTab] = useState("volumes");
  const [show, setShow] = useState({ volumes:true, columns:true, beams:true, slabs:true, dwall:true });
  const [location, setLocation] = useState("臺北市");
  const [seismicSDS, setSeismicSDS] = useState(0.66);
  const [seismicSD1, setSeismicSD1] = useState(0.385);

  const totalAbove = useMemo(() => Math.max(...volumes.map(v => v.endF), 0), [volumes]);
  const dwall = useMemo(() => calculateDwall(volumes, typicalH, exceptions), [volumes, typicalH, exceptions]);
  const columns = useMemo(() => generateColumns(volumes, maxBX, maxBY), [volumes, maxBX, maxBY]);
  const beams = useMemo(() => generateBeams(volumes, gridX, gridY, typicalH, exceptions), [volumes, gridX, gridY, typicalH, exceptions]);
  const slabs = useMemo(() => generateSlabs(volumes, gridX, gridY, typicalH, exceptions), [volumes, gridX, gridY, typicalH, exceptions]);
  const transferIssues = useMemo(() => detectTransferIssues(volumes), [volumes]);
  const hasCore = useMemo(() => volumes.some(v => v.type === "core"), [volumes]);
  const families = useMemo(() => generateFamilyTypes(columns, beams, slabs, dwall, hasCore, totalAbove), [columns, beams, slabs, dwall, hasCore, totalAbove]);
  const windZone = useMemo(() => getWindForLocation(location), [location]);
  const designForces = useMemo(() => estimateDesignForces(volumes, gridX, gridY, typicalH, exceptions, windZone.v), [volumes, gridX, gridY, typicalH, exceptions, windZone]);

  const updateVol = (updated) => setVolumes(vs => vs.map(v => v.id === updated.id ? updated : v));
  const deleteVol = (id) => { setVolumes(vs => vs.filter(v => v.id !== id)); if (selId === id) setSelId(null); };
  const addVol = (type) => {
    const id = nextId++;
    const t = TYPES.find(t => t.value === type);
    const defaults = {
      basement: { startF:-2, endF:0, x1:0, x2:maxBX, y1:0, y2:maxBY, opacity:0.18, useType:"parking" },
      podium: { startF:1, endF:4, x1:0, x2:maxBX, y1:0, y2:maxBY, opacity:0.3, useType:"commercial" },
      tower: { startF:5, endF:15, x1:1, x2:maxBX-1, y1:1, y2:maxBY-1, opacity:0.32, useType:"residential" },
      core: { startF:-2, endF:15, x1:Math.floor(maxBX/2), x2:Math.floor(maxBX/2)+1, y1:Math.floor(maxBY/2), y2:Math.floor(maxBY/2)+1, opacity:0.5, useType:"core" },
      setback: { startF:10, endF:15, x1:2, x2:maxBX-2, y1:1, y2:maxBY-1, opacity:0.4, useType:"residential" },
    };
    const d = defaults[type] || defaults.tower;
    const colors = { core:"#aa6644" };
    const color = colors[type] || COLORS[volumes.length % COLORS.length];
    setVolumes(vs => [...vs, { id, name:`${t?.label||type}${id}`, type, color, ...d }]);
    setSelId(id);
  };

  const handleExport = () => {
    downloadDesignJson({
      project: { name: "Untitled", location, structureSystem: "RC" },
      designParams: {
        windV: windZone.v,
        windZone: windZone.label,
        SDS: seismicSDS,
        SD1: seismicSD1,
        importance: 1.0,
        siteClass: 2,
        seismicLevel: "中等",
      },
      geometry: { gridX, gridY, maxBX, maxBY, typicalH, exceptions, totalAbove },
      volumes, columns, beams, slabs, dwall, families,
    });
  };

  const tabBtn = (id, label) => (
    <button onClick={() => setActiveTab(id)} style={{
      flex:1, padding:"5px 4px", border:"none", cursor:"pointer", fontSize:10, fontWeight:600,
      background: activeTab === id ? "#1a1a3e" : "#0d0d18",
      color: activeTab === id ? "#88ccaa" : "#555",
      borderBottom: activeTab === id ? "2px solid #88ccaa" : "2px solid transparent"
    }}>{label}</button>
  );

  const showBtn = (k, label, color) => (
    <button onClick={() => setShow(s => ({...s, [k]: !s[k]}))} style={{
      padding:"3px 7px", border:"1px solid "+(show[k]?color:"#333"), borderRadius:3, cursor:"pointer",
      fontSize:9, background: show[k] ? "rgba(13,13,24,.85)" : "#0d0d18",
      color: show[k] ? color : "#444", fontWeight:600,
    }}>{label}</button>
  );

  return (
    <div style={{
      width:"100vw", height:"100vh", display:"grid", gridTemplateColumns:"280px 1fr 260px",
      background:"#0d0d18", color:"#e0e0e0", fontFamily:"'SF Mono','Noto Sans TC',monospace", overflow:"hidden",
    }}>
      <div style={{ borderRight:"1px solid #1e1e33", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ padding:"6px 10px", background:"#151528", borderBottom:"1px solid #1e1e33", display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#88ccaa", letterSpacing:1 }}>
            🧊 量體 + 結構系統 v4
          </span>
          <button onClick={handleExport} title="匯出 design.json（給 calc-engine / pyRevit 用）" style={{
            padding:"4px 10px", border:"1px solid #2a4455", borderRadius:3, cursor:"pointer",
            fontSize:10, fontWeight:600, background:"#1a3344", color:"#88ccee",
          }}>📥 匯出</button>
        </div>
        <div style={{ display:"flex", borderBottom:"1px solid #1e1e33" }}>
          {tabBtn("volumes","量體")}
          {tabBtn("heights","樓高")}
          {tabBtn("grid","柱網")}
          {tabBtn("design","設計")}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {activeTab === "grid" && (
            <>
              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginBottom:4 }}>基礎柱網</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 6px" }}>
                <div><label style={S.lbl}>X跨距(mm)</label><input style={S.inp} type="number" step={500} value={gridX} onChange={e=>setGridX(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>Y跨距(mm)</label><input style={S.inp} type="number" step={500} value={gridY} onChange={e=>setGridY(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>X最大跨數</label><input style={S.inp} type="number" min={1} max={20} value={maxBX} onChange={e=>setMaxBX(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>Y最大跨數</label><input style={S.inp} type="number" min={1} max={20} value={maxBY} onChange={e=>setMaxBY(Number(e.target.value))}/></div>
              </div>
            </>
          )}

          {activeTab === "design" && (
            <>
              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginBottom:4 }}>🌍 工址設定</div>
              <label style={S.lbl}>位置（影響風速與震區）</label>
              <select style={S.inp} value={location} onChange={e=>setLocation(e.target.value)}>
                <optgroup label="台北/北部沿海 (42.5 m/s)">
                  <option>臺北市</option>
                  <option>新北市-淡水區</option>
                  <option>基隆市</option>
                </optgroup>
                <optgroup label="花蓮/恆春 (47.5 m/s)">
                  <option>花蓮縣-花蓮市</option>
                  <option>花蓮縣-吉安鄉</option>
                  <option>屏東縣-恆春鎮</option>
                </optgroup>
                <optgroup label="一般地區 (37.5 m/s)">
                  <option>桃園市</option>
                  <option>新竹市</option>
                  <option>臺中市</option>
                  <option>臺南市</option>
                  <option>高雄市</option>
                </optgroup>
              </select>

              <div style={{ fontSize:10, color:"#6688aa", fontWeight:600, marginTop:10, marginBottom:4 }}>🌐 耐震參數 (民國113年版)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 6px" }}>
                <div><label style={S.lbl}>SDS (短週期)</label><input style={S.inp} type="number" step={0.01} value={seismicSDS} onChange={e=>setSeismicSDS(Number(e.target.value))}/></div>
                <div><label style={S.lbl}>SD1 (1秒週期)</label><input style={S.inp} type="number" step={0.01} value={seismicSD1} onChange={e=>setSeismicSD1(Number(e.target.value))}/></div>
              </div>
              <div style={{ fontSize:9, color:"#556", marginTop:6, lineHeight:"1.4" }}>
                📖 範例值（依工址查表 2-1）：<br/>
                臺北盆地: SDS=0.66, SD1=0.385<br/>
                花蓮市: SDS=0.96, SD1=0.585<br/>
                臺中市: SDS=0.77, SD1=0.42<br/>
                高雄市: SDS=0.66, SD1=0.385
              </div>

              <div style={{ background:"#1a2a3a", borderRadius:5, padding:8, marginTop:10, border:"1px solid #2a4466" }}>
                <div style={{ color:"#88bbcc", fontSize:10, fontWeight:600, marginBottom:4 }}>🎯 設計目標檢核</div>
                <div style={{ fontSize:9, color:"#aabbcc", lineHeight:"1.6" }}>
                  • 50年回歸期風速 → 不致嚴重損壞<br/>
                  • 475年回歸期地震 → 不致倒塌<br/>
                  • 30年回歸期中小地震 → 維持彈性<br/>
                  • 防火時效 (§70) → 維持構造完整<br/>
                  • 高寬比 H/B {parseFloat(designForces.aspectRatio) > 4 ? "⚠️ >4，須留意風壓" : "✓ ≤4，常規設計"}
                </div>
              </div>
            </>
          )}
          {activeTab === "heights" && (
            <FloorHeightEditor typicalH={typicalH} setTypicalH={setTypicalH} exceptions={exceptions} setExceptions={setExceptions} />
          )}
          {activeTab === "volumes" && (
            <>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                {TYPES.map(t => (
                  <button key={t.value} onClick={() => addVol(t.value)}
                    style={{ padding:"4px 8px", border:"1px solid #333", borderRadius:3, cursor:"pointer",
                      fontSize:10, background:"#151528", color: t.value==="core"?"#ee8866":"#8aa" }}>
                    + {t.label}
                  </button>
                ))}
              </div>
              {volumes.map(v => (
                <VolumeCard key={v.id} vol={v} isSelected={selId === v.id}
                  onClick={() => setSelId(selId === v.id ? null : v.id)}
                  onChange={updateVol} onDelete={deleteVol} maxBX={maxBX} maxBY={maxBY}
                  typicalH={typicalH} exceptions={exceptions} />
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:8, right:8, zIndex:10, background:"rgba(13,13,24,.85)",
          padding:"4px 8px", borderRadius:3, fontSize:9, color:"#555" }}>
          拖曳旋轉｜滾輪縮放｜點擊選取
        </div>
        {/* Visibility toggles */}
        <div style={{ position:"absolute", top:8, left:8, zIndex:10, display:"flex", gap:4, flexWrap:"wrap", maxWidth:400 }}>
          {showBtn("volumes","量體","#88ccaa")}
          {showBtn("columns","柱","#88bbee")}
          {showBtn("beams","梁","#cc8866")}
          {showBtn("slabs","樓板","#aabbaa")}
          {showBtn("dwall","連續壁","#ddaa66")}
        </div>
        <div style={{ position:"absolute", bottom:8, left:8, zIndex:10, background:"rgba(13,13,24,.9)",
          padding:6, borderRadius:4, fontSize:9, display:"flex", gap:10, flexWrap:"wrap" }}>
          <span style={{color:"#88bbee"}}>■ 柱 (依fc'分色)</span>
          <span style={{color:"#cc7744"}}>■ 梁</span>
          <span style={{color:"#667788"}}>■ 結構樓板</span>
          <span style={{color:"#cc8855"}}>■ 隔音層 (§46-6)</span>
          <span style={{color:"#cc6644"}}>■ 剪力牆</span>
          <span style={{color:"#aa7755"}}>■ 連續壁</span>
        </div>
        <Scene3D gridX={gridX} gridY={gridY} typicalH={typicalH} exceptions={exceptions}
          maxBX={maxBX} maxBY={maxBY} volumes={volumes} selected={selId}
          onSelect={setSelId} onSelectElement={setSelectedElement}
          dwall={dwall} columns={columns} beams={beams} slabs={slabs} totalAbove={totalAbove} show={show} />
      </div>

      <div style={{ borderLeft:"1px solid #1e1e33", overflow:"hidden" }}>
        <SummaryPanel volumes={volumes} gridX={gridX} gridY={gridY}
          typicalH={typicalH} exceptions={exceptions}
          dwall={dwall} transferIssues={transferIssues} families={families}
          totalAbove={totalAbove} selectedElement={selectedElement}
          location={location} windZone={windZone} designForces={designForces}
          seismicSDS={seismicSDS} seismicSD1={seismicSD1} />
      </div>
    </div>
  );
}
