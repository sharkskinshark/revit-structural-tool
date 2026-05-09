/**
 * Type definitions for the structural pre-review tool
 */

export type StructureSystem = 'RC' | 'S' | 'SRC';

export type VolumeType = 'basement' | 'podium' | 'tower' | 'core' | 'setback';

export type UseType = 'residential' | 'commercial' | 'office' | 'parking' | 'core';

// ─────────── Volume Definition ───────────
export interface Volume {
  id: number;
  name: string;
  type: VolumeType;
  useType: UseType;
  color: string;
  startF: number;       // start floor (negative = basement, positive = above ground)
  endF: number;         // end floor (0 = GL for basement volumes)
  x1: number;           // grid X start
  x2: number;           // grid X end
  y1: number;           // grid Y start
  y2: number;           // grid Y end
  opacity: number;
}

// ─────────── Floor Height ───────────
export interface FloorException {
  floor: number;        // floor index (-1 = B1F, 1 = 1F, 2 = 2F, etc.)
  height: number;       // height in mm
  label: string;        // descriptive label
}

// ─────────── Structural Elements ───────────
export interface ColumnLine {
  i: number;            // grid index X
  j: number;            // grid index Y
  minF: number;
  maxF: number;
  inCore: boolean;
}

export interface ColumnInstance {
  i: number;
  j: number;
  floor: number;
  dim: number;          // mm (square column)
  fc: number;           // kgf/cm²
  fireRating: number;   // hours
  axialLoad?: number;   // tf (calculated)
  family: string;       // e.g., "RC-C-700×700-fc350"
}

export interface Beam {
  dir: 'X' | 'Y';
  i: number;
  j: number;
  floor: number;
  elev: number;         // mm absolute elevation
  span: number;         // mm
  B: number;            // width mm
  D: number;            // depth mm
  fireRating: number;
  family: string;       // e.g., "RC-MB-400×650"
  cx: number;
  cy: number;
  cz: number;
  length: number;
  volType: VolumeType;
}

export interface Slab {
  floor: number;
  elev: number;
  x1: number; x2: number;
  y1: number; y2: number;
  structThick: number;  // mm
  soundLayer: number;   // mm (sound insulation per §46-6)
  totalThick: number;   // mm
  useType: string;
  fireRating: number;
  family: string;
  volType: VolumeType;
}

export interface DiaphragmWall {
  thickness: number;    // mm
  depth: number;        // m
  depthMm: number;
  note: string;
  x1: number; x2: number;
  y1: number; y2: number;
  minFloor: number;
  type: string;         // e.g., "RC-DW-800"
  fireRating: number;
}

// ─────────── Design Parameters ───────────
export interface DesignParams {
  location: string;
  windV: number;        // m/s
  windZone: string;
  SDS: number;
  SD1: number;
  importance: number;   // I
  siteClass: 1 | 2 | 3;
  structureSystem: StructureSystem;
}

export interface DesignForces {
  windV: number;
  q_kgfm2: number;
  q_kNm2: number;
  windForceX_kN: number;
  windForceY_kN: number;
  totalH_m: number;
  plan_W_m: number;
  plan_D_m: number;
  totalWeight_tf: number;
  period_T: number;
  aspectRatio: string;
}

// ─────────── Family/Type Inventory ───────────
export interface FamilyType {
  type: string;
  count: number;
  [key: string]: any;
}

export interface FamilyInventory {
  columns: FamilyType[];
  beams: FamilyType[];
  slabs: FamilyType[];
  walls: FamilyType[];
}

// ─────────── Quantity Takeoff ───────────
export interface ConcreteVolume {
  fc: number;           // kgf/cm²
  member: string;       // 'column', 'beam', 'slab', etc.
  volume_m3: number;
  floors?: string[];    // applicable floor labels
}

export interface RebarTonnage {
  member: string;
  ratio: number;        // reinforcement ratio
  concrete_m3: number;
  rebar_tons: number;
}

export interface CostEstimate {
  concrete: number;     // NTD
  rebar: number;
  steel: number;
  formwork: number;
  diaphragmWall: number;
  total: number;
  perSqm: number;       // NTD per m²
}

// ─────────── Export to Revit (JSON) ───────────
export interface RevitExport {
  project: {
    location: string;
    seismic: { SS: number; S1: number; SDS: number; SD1: number };
    siteClass: number;
    importanceFactor: number;
  };
  grids: {
    X: number[];        // mm positions
    Y: number[];
  };
  levels: Array<{
    name: string;
    elevation: number;  // mm
    height: number;     // mm
  }>;
  columns: Array<{
    grid: string;       // "A1"
    levels: string[];   // ["B3F", "RF"]
    family: string;
    type: string;
    width: number; depth: number;
    fc: number; fy: number;
    fireRating: number;
  }>;
  beams: Beam[];
  slabs: Slab[];
  walls: Array<{
    type: 'shearwall' | 'dwall';
    family: string;
    thickness: number;
    levels: string[];
    fc: number; fy: number;
    fireRating: number;
  }>;
}
