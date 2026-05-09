/**
 * Fire Rating Calculations
 * Per 建築技術規則建築設計施工編 §70
 *
 * Counted from top floor down (including basement floors).
 *
 * Layer counts:
 *   1-4 floors from top   →  1hr (column/beam/wall/slab), 0.5hr (roof)
 *   5-14 floors from top  →  2hr (column/beam/slab), 1hr (wall), 0.5hr (roof)
 *   15+ floors from top   →  3hr (column/beam), 2hr (slab/wall), 0.5hr (roof)
 */

import { floorsFromTop } from './floorHeight';

export type StructuralElement =
  | 'column'
  | 'beam'
  | 'slab'
  | 'wall'         // load-bearing wall
  | 'shearwall'    // = wall for fire purposes
  | 'roof'
  | 'dwall';       // diaphragm wall (basement)

/**
 * Get fire rating in hours per §70
 *
 * @param floor Floor number (positive=above, negative=basement, 0=GL)
 * @param totalAbove Total above-ground floors
 * @param element Type of structural element
 * @returns Fire rating in hours
 */
export function getFireRating(
  floor: number,
  totalAbove: number,
  element: StructuralElement
): number {
  // Diaphragm wall: typically 3hr (basement main structure)
  if (element === 'dwall') return 3;

  // Roof: 0.5hr regardless
  if (element === 'roof') return 0.5;

  const fromTop = floorsFromTop(floor, totalAbove);

  if (element === 'column' || element === 'beam') {
    if (fromTop <= 4) return 1;
    if (fromTop <= 14) return 2;
    return 3;
  }

  if (element === 'slab') {
    if (fromTop <= 4) return 1;
    return 2;  // 5+ all the same
  }

  if (element === 'wall' || element === 'shearwall') {
    if (fromTop <= 14) return 1;
    return 2;
  }

  return 1;
}

/**
 * Get fire rating zones for entire building
 * Returns the three zones with their floor ranges and ratings
 */
export interface FireZone {
  range: string;
  floorsFromTop: string;
  column: number;
  beam: number;
  slab: number;
  wall: number;
}

export function getFireZones(totalAbove: number, totalBelow: number): FireZone[] {
  const totalFloors = totalAbove + totalBelow;
  const zones: FireZone[] = [];

  // Zone 1: top 4 floors
  if (totalFloors >= 1) {
    const topFloor = totalAbove;
    const topMinus3 = Math.max(topFloor - 3, totalAbove - totalFloors + 1);
    zones.push({
      range: `${topMinus3}F~${topFloor}F`,
      floorsFromTop: '1-4',
      column: 1, beam: 1, slab: 1, wall: 1,
    });
  }

  // Zone 2: 5-14 from top
  if (totalFloors >= 5) {
    const upper = totalAbove - 4;
    const lower = Math.max(totalAbove - 13, -totalBelow + 1);
    if (upper >= lower) {
      zones.push({
        range: `${lower < 0 ? `B${Math.abs(lower)}F` : `${lower}F`}~${upper}F`,
        floorsFromTop: '5-14',
        column: 2, beam: 2, slab: 2, wall: 1,
      });
    }
  }

  // Zone 3: 15+ from top (includes basement)
  if (totalFloors >= 15) {
    const upper = totalAbove - 14;
    const lower = -totalBelow;
    zones.push({
      range: `${lower < 0 ? `B${Math.abs(lower)}F` : `${lower}F`}~${upper < 0 ? `B${Math.abs(upper)}F` : `${upper}F`}`,
      floorsFromTop: '15+',
      column: 3, beam: 3, slab: 2, wall: 2,
    });
  }

  return zones;
}
