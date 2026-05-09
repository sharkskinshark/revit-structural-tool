/**
 * Structural sizing calculations
 * Empirical formulas for design-phase pre-sizing
 *
 * NOT a substitute for licensed structural engineer's calculations.
 */

import type { StructureSystem, Volume } from '../types';
import { getFloorBottom } from './floorHeight';

/**
 * Round up to next multiple of step
 */
export const roundUp = (v: number, step: number = 50): number =>
  Math.ceil(v / step) * step;

// ═══════════════════════════════════════════════════
// COLUMN SIZING (with tapering)
// ═══════════════════════════════════════════════════

export interface ColumnSize {
  dim: number;     // mm (square section)
  fc: number;      // kgf/cm²
}

/**
 * Get column size based on floor position
 * Tapering: lower floors larger, upper floors smaller
 * fc' zoning: B+1F~3F = 350, middle = 280, upper = 245
 */
export function getColumnSize(
  floor: number,
  totalAboveFloors: number,
  _system: StructureSystem = 'RC'
): ColumnSize {
  const above = totalAboveFloors;
  let dim: number;
  let fc: number;

  if (floor < 0 || floor <= 3) {
    // Lower zone: B+1F~3F, highest cumulative load
    dim = above >= 20 ? 800 : above >= 10 ? 700 : 600;
    fc = 350;
  } else if (floor <= Math.ceil(above * 0.6)) {
    // Middle zone
    dim = above >= 20 ? 700 : above >= 10 ? 650 : 550;
    fc = 280;
  } else {
    // Upper zone: lighter load
    dim = above >= 20 ? 600 : above >= 10 ? 550 : 500;
    fc = 245;
  }

  return { dim, fc };
}

// ═══════════════════════════════════════════════════
// BEAM SIZING (by span)
// ═══════════════════════════════════════════════════

export interface BeamSize {
  B: number;       // width mm
  D: number;       // depth mm
}

export type SeismicLevel = '特殊' | '中等' | '普通';

/**
 * Get beam size from span
 * Special seismic: D = L/10
 * Moderate: D = L/12
 * Normal: D = L/14
 */
export function getBeamSize(
  span: number,
  seismicLevel: SeismicLevel = '中等'
): BeamSize {
  const ratio = seismicLevel === '特殊' ? 10 :
                seismicLevel === '中等' ? 12 : 14;

  const D = roundUp(span / ratio, 50);
  const B = roundUp(Math.max(D * 0.5, 300), 50);
  return { B, D };
}

/**
 * Get secondary beam size
 */
export function getSecondaryBeamSize(shortSpan: number): BeamSize {
  const D = roundUp(shortSpan / 16, 50);
  const B = roundUp(Math.max(D * 0.45, 250), 50);
  return { B, D };
}

// ═══════════════════════════════════════════════════
// SLAB THICKNESS
// ═══════════════════════════════════════════════════

export interface SlabConfig {
  structThick: number;
  soundLayer: number;     // §46-6 sound insulation
  totalThick: number;
}

/**
 * Get slab configuration based on use type
 */
export function getSlabConfig(useType: string): SlabConfig {
  const configs: Record<string, SlabConfig> = {
    residential: { structThick: 150, soundLayer: 68, totalThick: 218 },
    commercial:  { structThick: 150, soundLayer: 68, totalThick: 218 },
    office:      { structThick: 150, soundLayer: 0,  totalThick: 150 },
    parking:     { structThick: 200, soundLayer: 0,  totalThick: 200 },
  };
  return configs[useType] || configs.commercial;
}

/**
 * Get slab thickness from span (rough estimate)
 * One-way: t = L/24
 * Two-way: t = L/30
 */
export function getSlabThicknessFromSpan(
  shortSpan: number,
  isOneWay: boolean = false
): number {
  const t = isOneWay ? shortSpan / 24 : shortSpan / 30;
  return Math.max(roundUp(t, 10), 150);
}

// ═══════════════════════════════════════════════════
// DIAPHRAGM WALL
// ═══════════════════════════════════════════════════

export interface DiaphragmWallSpec {
  thickness: number;
  note: string;
}

/**
 * Diaphragm wall thickness from excavation depth
 */
export function getDiaphragmWallThickness(depthM: number): DiaphragmWallSpec {
  if (depthM <= 10) return { thickness: 600, note: '淺開挖，單層支撐' };
  if (depthM <= 15) return { thickness: 800, note: '中深度，2~3層支撐' };
  if (depthM <= 20) return { thickness: 1000, note: '深開挖，多層支撐' };
  return { thickness: 1200, note: '超深開挖，特殊工法' };
}

// ═══════════════════════════════════════════════════
// REVIT FAMILY/TYPE NAMING
// ═══════════════════════════════════════════════════

export const RevitNaming = {
  column: (W: number, D: number, fc: number) =>
    `RC-C-${W}×${D}-fc${fc}`,
  mainBeam: (B: number, D: number) =>
    `RC-MB-${B}×${D}`,
  secondaryBeam: (B: number, D: number) =>
    `RC-SB-${B}×${D}`,
  slab: (t: number, sl?: number) =>
    sl && sl > 0 ? `RC-Slab-${t}-SI${sl}` : `RC-Slab-${t}`,
  shearWall: (t: number) =>
    `RC-SW-${t}`,
  diaphragmWall: (t: number) =>
    `RC-DW-${t}`,
  steelColumn: (W: number, D: number, fy: number) =>
    `STL-C-BOX-${W}×${D}-${fy}`,
  steelBeam: (D: number, B: number, tw: number, tf: number) =>
    `STL-B-H-${D}×${B}×${tw}×${tf}`,
};
