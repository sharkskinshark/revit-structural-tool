/**
 * Seismic and wind analysis (simplified)
 * Based on Taiwan codes:
 * - 建築物耐震設計規範 (民國113年版)
 * - 建築物耐風設計規範
 */

import type { StructureSystem } from '../types';

// ═══════════════════════════════════════════════════
// SEISMIC (Equivalent Lateral Force Method)
// ═══════════════════════════════════════════════════

/**
 * Approximate fundamental period
 * T = Ct × H^0.75
 * Ct: 0.07 (RC), 0.085 (Steel), 0.07 (SRC)
 */
export function approximatePeriod(
  totalH_m: number,
  system: StructureSystem = 'RC'
): number {
  const Ct = system === 'S' ? 0.085 : 0.07;
  return Ct * Math.pow(totalH_m, 0.75);
}

/**
 * Design spectral acceleration SaD
 * Simplified: takes the smaller of SDS or SD1/T
 */
export function designSpectralAcceleration(
  SDS: number,
  SD1: number,
  T: number
): number {
  if (T <= 0.2 * SD1 / SDS) {
    return SDS * (0.4 + 3 * T / (0.2 * SD1 / SDS));
  } else if (T <= SD1 / SDS) {
    return SDS;
  } else {
    return SD1 / T;
  }
}

/**
 * Base shear V = SaD × I × W / (1.4 × R × αy)
 *
 * @param SaD Spectral acceleration
 * @param I Importance factor (1.0~1.5)
 * @param W Total weight (tf)
 * @param R Response modification factor
 * @param alphaY Allowable ductility
 */
export function baseShear(
  SaD: number,
  I: number,
  W: number,
  R: number = 4.8,        // RC moment frame typical
  alphaY: number = 1.0
): number {
  return (SaD * I * W) / (1.4 * R * alphaY);
}

/**
 * Vertical force distribution
 * Fx = V × wx × hx^k / Σ(wi × hi^k)
 *
 * @param V Base shear (tf)
 * @param weights Per-floor weight (tf)
 * @param heights Per-floor cumulative height (m)
 * @param T Fundamental period (s)
 */
export function verticalDistribution(
  V: number,
  weights: number[],
  heights: number[],
  T: number
): number[] {
  // k: 1 for T≤0.5, 2 for T≥2.5, interpolate between
  const k = T <= 0.5 ? 1 : T >= 2.5 ? 2 : 1 + (T - 0.5) / 2;

  const denominator = weights.reduce(
    (sum, w, i) => sum + w * Math.pow(heights[i], k),
    0
  );

  return weights.map((w, i) =>
    V * w * Math.pow(heights[i], k) / denominator
  );
}

// ═══════════════════════════════════════════════════
// WIND
// ═══════════════════════════════════════════════════

/**
 * Wind pressure q = 0.06 V² (kgf/m²)
 * V in m/s
 */
export function windPressure(V_ms: number): { kgfm2: number; kNm2: number } {
  const kgfm2 = 0.06 * V_ms * V_ms;
  const kNm2 = kgfm2 / 102;  // 1 kgf/m² ≈ 0.0098 kN/m²
  return { kgfm2, kNm2 };
}

/**
 * Total wind force on a face
 * F = q × Cf × G × A
 *
 * @param q Wind pressure (kN/m²)
 * @param area Projected area (m²)
 * @param Cf Force coefficient (default 1.3)
 * @param G Gust factor (default 2.0)
 */
export function windForce(
  q_kNm2: number,
  area_m2: number,
  Cf: number = 1.3,
  G: number = 2.0
): number {
  return q_kNm2 * Cf * G * area_m2;  // kN
}

// ═══════════════════════════════════════════════════
// HIGH-LEVEL DESIGN FORCE ESTIMATE
// ═══════════════════════════════════════════════════

export interface DesignForceResult {
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

export interface BuildingGeometry {
  totalH_m: number;
  W_m: number;       // plan width
  D_m: number;       // plan depth
  totalArea_m2: number;
  totalFloors: number;
}

/**
 * Estimate design forces for the building
 */
export function estimateDesignForces(
  geo: BuildingGeometry,
  windV: number,
  system: StructureSystem = 'RC',
  unitWeight_tfm2: number = 1.0
): DesignForceResult {
  const q = windPressure(windV);
  const areaW = geo.totalH_m * geo.W_m;
  const areaD = geo.totalH_m * geo.D_m;

  const Fx = windForce(q.kNm2, areaW);
  const Fy = windForce(q.kNm2, areaD);

  const W_total = geo.totalArea_m2 * unitWeight_tfm2 * geo.totalFloors;
  const T = approximatePeriod(geo.totalH_m, system);

  return {
    windV,
    q_kgfm2: Math.round(q.kgfm2),
    q_kNm2: Math.round(q.kNm2 * 100) / 100,
    windForceX_kN: Math.round(Fx),
    windForceY_kN: Math.round(Fy),
    totalH_m: Math.round(geo.totalH_m * 10) / 10,
    plan_W_m: geo.W_m,
    plan_D_m: geo.D_m,
    totalWeight_tf: Math.round(W_total),
    period_T: Math.round(T * 100) / 100,
    aspectRatio: (geo.totalH_m / Math.min(geo.W_m, geo.D_m)).toFixed(2),
  };
}
