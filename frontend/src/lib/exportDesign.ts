/**
 * Export design.json — frontend → calc-engine / pyRevit interchange format.
 *
 * See docs/design-schema.md for the spec (version 1.0).
 *
 * Responsibilities:
 *   - Expand segment-form columns to per-floor instances (option a)
 *   - Derive shear walls from core volumes
 *   - Compute levels from typical+exceptions
 *   - Convert frontend's camelCase to schema's snake_case
 *   - Trigger browser download via Blob
 */

import type { Volume, FloorException } from '../types';
import { getFloorBottom, getFloorHeight, floorLabel } from './floorHeight';
import { getColumnSize } from './structural';
import { getFireRating } from './fireRating';

const SCHEMA_VERSION = '1.0';
const EXPORTER = 'frontend@0.1.0';

export interface ExportInput {
  project: {
    name: string;
    location: string;
    structureSystem: 'RC' | 'S' | 'SRC';
  };
  designParams: {
    windV: number;
    windZone: string;
    SDS: number;
    SD1: number;
    importance: number;
    siteClass: 1 | 2 | 3;
    seismicLevel: '特殊' | '中等' | '普通';
  };
  geometry: {
    gridX: number;
    gridY: number;
    maxBX: number;
    maxBY: number;
    typicalH: number;
    exceptions: FloorException[];
    totalAbove: number;
  };
  volumes: Volume[];
  // Frontend-generated structures (loosely typed to mirror existing App.tsx)
  columns: any[];   // segment form: [{ i, j, minF, maxF, inCore }]
  beams: any[];     // already per-floor
  slabs: any[];     // already per-floor
  dwall: any | null;
  families: any;    // from generateFamilyTypes()
}

const SHEAR_WALL_THICKNESS = 300;
const DEFAULT_FY = 4200;

// ─── helpers ──────────────────────────────────────────────────

function gridLabel(i: number, j: number): string {
  return `${String.fromCharCode(65 + i)}${j + 1}`;
}

function totalBelowFromVolumes(volumes: Volume[]): number {
  const minStart = Math.min(...volumes.map(v => v.startF), 0);
  return Math.abs(Math.min(minStart, 0));
}

// ─── builders ─────────────────────────────────────────────────

function buildLevels(volumes: Volume[], typicalH: number, exceptions: FloorException[]) {
  const allFloors = new Set<number>();
  volumes.forEach(v => {
    for (let f = v.startF; f <= v.endF; f++) {
      if (f === 0) continue;
      allFloors.add(f);
    }
  });
  return Array.from(allFloors).sort((a, b) => a - b).map(f => ({
    name: floorLabel(f),
    elevation_mm: getFloorBottom(f, typicalH, exceptions),
    height_mm: getFloorHeight(f, typicalH, exceptions),
    floor: f,
  }));
}

function expandColumns(
  columns: any[],
  totalAbove: number,
  typicalH: number,
  exceptions: FloorException[],
) {
  const out: any[] = [];
  columns.forEach(c => {
    if (c.inCore) return;  // core columns are not placed (replaced by shear walls)
    for (let f = c.minF; f <= c.maxF; f++) {
      if (f === 0) continue;
      const { dim, fc } = getColumnSize(f, totalAbove);
      out.push({
        grid: gridLabel(c.i, c.j),
        i: c.i,
        j: c.j,
        floor: f,
        width_mm: dim,
        depth_mm: dim,
        height_mm: getFloorHeight(f, typicalH, exceptions),
        fc,
        fy: DEFAULT_FY,
        family_type: `RC-C-${dim}×${dim}-fc${fc}`,
        fire_rating_hr: getFireRating(f, totalAbove, 'column'),
        in_core: false,
      });
    }
  });
  return out;
}

function transformBeams(beams: any[], totalAbove: number) {
  return beams.map(b => ({
    dir: b.dir,
    i: b.i,
    j: b.j,
    floor: b.floor,
    elev_mm: b.elev,
    span_mm: b.span,
    B_mm: b.B,
    D_mm: b.D,
    fc: 280,
    fy: DEFAULT_FY,
    family_type: `RC-MB-${b.B}×${b.D}`,
    fire_rating_hr: getFireRating(b.floor, totalAbove, 'beam'),
    vol_type: b.volType,
  }));
}

function transformSlabs(slabs: any[], gridX: number, gridY: number, totalAbove: number) {
  return slabs.map(s => {
    const area_mm2 = (s.x2 - s.x1) * gridX * (s.y2 - s.y1) * gridY;
    return {
      floor: s.floor,
      elev_mm: s.elev,
      x1: s.x1, x2: s.x2, y1: s.y1, y2: s.y2,
      area_m2: area_mm2 / 1e6,
      struct_thickness_mm: s.structThick,
      sound_layer_mm: s.soundLayer,
      total_thickness_mm: s.totalThick,
      fc: 280,
      use_type: s.useType,
      family_type: s.soundLayer > 0
        ? `RC-Slab-${s.structThick}-SI${s.soundLayer}`
        : `RC-Slab-${s.structThick}`,
      fire_rating_hr: getFireRating(s.floor, totalAbove, 'slab'),
      vol_type: s.volType,
    };
  });
}

function buildShearWalls(
  volumes: Volume[],
  gridX: number,
  gridY: number,
  typicalH: number,
  exceptions: FloorException[],
  totalAbove: number,
) {
  const out: any[] = [];
  const cores = volumes.filter(v => v.type === 'core');
  cores.forEach(v => {
    const w = (v.x2 - v.x1) * gridX;
    const d = (v.y2 - v.y1) * gridY;
    for (let f = v.startF; f <= v.endF; f++) {
      if (f === 0) continue;
      const h = getFloorHeight(f, typicalH, exceptions);
      const fr = getFireRating(f, totalAbove, 'shearwall');
      const base = {
        core_volume_id: v.id,
        floor: f,
        height_mm: h,
        thickness_mm: SHEAR_WALL_THICKNESS,
        fc: 280,
        fy: DEFAULT_FY,
        family_type: `RC-SW-${SHEAR_WALL_THICKNESS}`,
        fire_rating_hr: fr,
      };
      out.push({ ...base, face: 'north', length_mm: w });
      out.push({ ...base, face: 'south', length_mm: w });
      out.push({ ...base, face: 'west',  length_mm: d - 2 * SHEAR_WALL_THICKNESS });
      out.push({ ...base, face: 'east',  length_mm: d - 2 * SHEAR_WALL_THICKNESS });
    }
  });
  return out;
}

function transformDwall(dwall: any | null, gridX: number, gridY: number) {
  if (!dwall) return null;
  const w = (dwall.x2 - dwall.x1) * gridX;
  const d = (dwall.y2 - dwall.y1) * gridY;
  const perimeter = 2 * (w + d);
  return {
    perimeter_mm: perimeter,
    depth_mm: dwall.depthMm,
    depth_m: dwall.depthMm / 1000,
    thickness_mm: dwall.thickness,
    fc: 280,
    family_type: `RC-DW-${dwall.thickness}`,
    x1: dwall.x1, x2: dwall.x2, y1: dwall.y1, y2: dwall.y2,
    min_floor: dwall.minFloor,
    note: dwall.note,
  };
}

function transformFamilyInventory(families: any) {
  return {
    columns: (families.columns || []).map((c: any) => ({
      type: c.type,
      count: c.count,
      width_mm: c.dim,
      depth_mm: c.dim,
      fc: c.fc,
    })),
    beams: (families.beams || []).map((b: any) => ({
      type: b.type,
      count: b.count,
      B_mm: b.B,
      D_mm: b.D,
    })),
    slabs: (families.slabs || []).map((s: any) => ({
      type: s.type,
      count: s.count,
      struct_thickness_mm: s.structThick,
      sound_layer_mm: s.soundLayer,
    })),
    walls: (families.walls || []).map((w: any) => ({
      type: w.type,
      count: w.count,
      thickness_mm: w.thickness,
      role: w.role,
    })),
  };
}

// ─── main ─────────────────────────────────────────────────────

export function buildDesignJson(input: ExportInput) {
  const { project, designParams, geometry, volumes, columns, beams, slabs, dwall, families } = input;
  const { gridX, gridY, maxBX, maxBY, typicalH, exceptions, totalAbove } = geometry;

  const totalBelow = totalBelowFromVolumes(volumes);

  return {
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    exported_by: EXPORTER,

    project: {
      name: project.name || 'Untitled',
      location: project.location,
      structure_system: project.structureSystem,
    },

    design_params: {
      wind_v_ms: designParams.windV,
      wind_zone: designParams.windZone,
      SDS: designParams.SDS,
      SD1: designParams.SD1,
      importance: designParams.importance,
      site_class: designParams.siteClass,
      seismic_level: designParams.seismicLevel,
    },

    geometry: {
      grid_x_mm: gridX,
      grid_y_mm: gridY,
      max_bx: maxBX,
      max_by: maxBY,
      typical_height_mm: typicalH,
      floor_exceptions: exceptions.map(e => ({
        floor: e.floor,
        height_mm: e.height,
        label: e.label,
      })),
      levels: buildLevels(volumes, typicalH, exceptions),
      total_floors_above: totalAbove,
      total_floors_below: totalBelow,
    },

    volumes: volumes.map(v => ({
      id: v.id,
      name: v.name,
      type: v.type,
      use_type: v.useType,
      start_floor: v.startF,
      end_floor: v.endF,
      x1: v.x1, x2: v.x2, y1: v.y1, y2: v.y2,
    })),

    structure: {
      columns: expandColumns(columns, totalAbove, typicalH, exceptions),
      beams: transformBeams(beams, totalAbove),
      slabs: transformSlabs(slabs, gridX, gridY, totalAbove),
      shear_walls: buildShearWalls(volumes, gridX, gridY, typicalH, exceptions, totalAbove),
      diaphragm_wall: transformDwall(dwall, gridX, gridY),
    },

    family_inventory: transformFamilyInventory(families),
  };
}

// ─── browser download trigger ─────────────────────────────────

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function downloadDesignJson(input: ExportInput): void {
  const data = buildDesignJson(input);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = (input.project.name || 'untitled').replace(/[^\w-]+/g, '_');
  const filename = `design-${safeName}-${timestamp()}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke to allow some browsers to start the download
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
