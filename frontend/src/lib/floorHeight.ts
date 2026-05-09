/**
 * Floor height calculations
 * Handles elevation calculation with support for floors of varying heights
 */

import type { FloorException } from '../types';

/**
 * Get height of a specific floor
 * @param floor Floor number (negative = basement, positive = above ground)
 * @param typicalH Typical floor height in mm
 * @param exceptions Array of exception floors with custom heights
 */
export function getFloorHeight(
  floor: number,
  typicalH: number,
  exceptions: FloorException[]
): number {
  if (floor === 0) return 0;
  const exc = exceptions.find(e => e.floor === floor);
  return exc ? exc.height : typicalH;
}

/**
 * Get bottom elevation of a floor relative to GL (ground level)
 * Positive = above GL, Negative = below GL
 */
export function getFloorBottom(
  floor: number,
  typicalH: number,
  exceptions: FloorException[]
): number {
  if (floor === 0) return 0;

  if (floor >= 1) {
    let elev = 0;
    for (let f = 1; f < floor; f++) {
      elev += getFloorHeight(f, typicalH, exceptions);
    }
    return elev;
  } else {
    let elev = 0;
    for (let f = -1; f >= floor; f--) {
      elev -= getFloorHeight(f, typicalH, exceptions);
    }
    return elev;
  }
}

/**
 * Get top elevation of a floor
 */
export function getFloorTop(
  floor: number,
  typicalH: number,
  exceptions: FloorException[]
): number {
  if (floor === 0) return 0;
  return getFloorBottom(floor, typicalH, exceptions) +
         getFloorHeight(floor, typicalH, exceptions);
}

/**
 * Format floor number to label
 * -3 -> "B3F", 0 -> "GL", 1 -> "1F", 22 -> "22F"
 */
export function floorLabel(floor: number): string {
  if (floor === 0) return 'GL';
  if (floor < 0) return `B${Math.abs(floor)}F`;
  return `${floor}F`;
}

/**
 * Convert floor index to "from top" position
 * Used for fire rating calculation per §70
 */
export function floorsFromTop(
  floor: number,
  totalAbove: number
): number {
  if (floor > 0) return totalAbove - floor + 1;
  if (floor < 0) return totalAbove + Math.abs(floor);
  return 0;
}
