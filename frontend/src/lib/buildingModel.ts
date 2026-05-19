/**
 * Building model — constants + pure calculation/generation functions.
 *
 * Extracted from App.tsx during the component split. These are the
 * functions the 3D view and panels actually consume (loosely typed,
 * migrated as-is from the claude.ai prototype).
 *
 * Note: src/lib/{structural,floorHeight,fireRating,seismicWind}.ts hold
 * a separate, typed copy used by exportDesign.ts. The two are kept
 * independent on purpose — unifying them is a later task.
 */

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════
export const COLORS = ["#3b6ea5","#5a8c5a","#a5783b","#8b5aa5","#a53b5e","#3ba5a5","#7a7a3b","#5a3b8b"];

export const TYPES = [
  { value:"basement", label:"地下室", desc:"地下開挖範圍" },
  { value:"podium", label:"裙樓", desc:"低矮基座量體" },
  { value:"tower", label:"塔樓", desc:"主要高層量體" },
  { value:"core", label:"服務核", desc:"電梯/樓梯/管道間" },
  { value:"setback", label:"退縮量體", desc:"露臺退縮或局部量體" },
];

export const DEFAULT_VOLUMES = [
  { id:1, name:"地下室", type:"basement", color:"#6b5b4a", startF:-3, endF:0, x1:0, x2:6, y1:0, y2:5, opacity:0.18, useType:"parking" },
  { id:2, name:"裙樓", type:"podium", color:"#4a6b8a", startF:1, endF:5, x1:0, x2:6, y1:0, y2:5, opacity:0.3, useType:"commercial" },
  { id:3, name:"塔樓A", type:"tower", color:"#4a8a6b", startF:6, endF:22, x1:1, x2:4, y1:1, y2:4, opacity:0.32, useType:"residential" },
  { id:4, name:"服務核", type:"core", color:"#aa6644", startF:-3, endF:22, x1:2, x2:3, y1:2, y2:3, opacity:0.5, useType:"core" },
];

export const DEFAULT_EXCEPTIONS = [
  { floor:-1, height:4500, label:"機房/水箱/配電" },
  { floor:1, height:5000, label:"大廳挑高" },
  { floor:2, height:4500, label:"商場挑高" },
];

export const USE_TYPES = {
  residential: { label:"住宅", needSI: true, slabStruct: 150, fc: 280 },
  commercial: { label:"商業", needSI: true, slabStruct: 150, fc: 280 },
  office: { label:"辦公", needSI: false, slabStruct: 150, fc: 280 },
  parking: { label:"停車", needSI: false, slabStruct: 200, fc: 280 },
  core: { label:"服務核", needSI: false, slabStruct: 0, fc: 280 },
};

// ═══════════════════════════════════════════════════════
// WIND ZONES (建築物耐風設計規範 - 50年回歸期基本設計風速)
// ═══════════════════════════════════════════════════════
export const WIND_ZONES = {
  "47.5": { v: 47.5, label: "極強風區 47.5 m/s", areas: ["花蓮市","吉安鄉","恆春鎮","滿州鄉"] },
  "42.5": { v: 42.5, label: "強風區 42.5 m/s", areas: ["臺北市","基隆市","新北市部分","宜蘭沿海","花蓮部分"] },
  "37.5": { v: 37.5, label: "一般風區 37.5 m/s", areas: ["臺中","臺南","高雄等中西部"] },
  "32.5": { v: 32.5, label: "弱風區 32.5 m/s", areas: ["內陸盆地"] },
};

export function getWindForLocation(location) {
  if (!location) return WIND_ZONES["37.5"];
  if (location.includes("花蓮市") || location.includes("吉安")) return WIND_ZONES["47.5"];
  if (location.includes("臺北") || location.includes("基隆") || location.includes("新北市-淡水")) return WIND_ZONES["42.5"];
  return WIND_ZONES["37.5"];
}

// ═══════════════════════════════════════════════════════
// FIRE RATING (建築技術規則 §70 - 自頂層起算)
// ═══════════════════════════════════════════════════════
export function getFireRating(floor, totalAbove, totalBelow, element) {
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
export function estimateDesignForces(volumes, gridX, gridY, typicalH, exceptions, windV, structureSystem = "RC") {
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

// ═══════════════════════════════════════════════════════
// FLOOR HEIGHT CALCULATIONS
// ═══════════════════════════════════════════════════════
export function getH(floor, typicalH, exceptions) {
  if (floor === 0) return 0;
  const exc = exceptions.find(e => e.floor === floor);
  return exc ? exc.height : typicalH;
}

export function getFloorBottom(floor, typicalH, exceptions) {
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

export function getFloorTop(floor, typicalH, exceptions) {
  if (floor === 0) return 0;
  return getFloorBottom(floor, typicalH, exceptions) + getH(floor, typicalH, exceptions);
}

export function getVolumeElev(v, typicalH, exceptions) {
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
export function ru(v, s) { return Math.ceil(v / s) * s; }

// COLUMNS: derived from volume coverage at each grid intersection
export function generateColumns(volumes, maxBX, maxBY) {
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
export function getColumnSize(floor, totalAboveFloors, ss = "RC") {
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
export function generateBeams(volumes, gridX, gridY, typicalH, exceptions, seismicLevel = "中等") {
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
            type: `RC-MB-${B}×${D}`,
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
            type: `RC-MB-${B}×${D}`,
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
export function generateSlabs(volumes, gridX, gridY, typicalH, exceptions) {
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
export function calculateDwall(volumes, typicalH, exceptions) {
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
export function generateFamilyTypes(columns, beams, slabs, dwall, hasCore, totalAbove) {
  // Columns - derive sizes by floor zone
  const colTypes = new Map();
  const allCols = columns.filter(c => !c.inCore);
  allCols.forEach(c => {
    for (let f = c.minF; f <= c.maxF; f++) {
      if (f === 0) continue;
      const { dim, fc } = getColumnSize(f, totalAbove);
      // 用 × (U+00D7) 與 exportDesign / docs/design-schema.md 一致，
      // 否則 family_inventory 與柱 entry 的 family_type 對不上
      const t = `RC-C-${dim}×${dim}-fc${fc}`;
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

export function detectTransferIssues(volumes) {
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
