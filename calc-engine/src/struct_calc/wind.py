"""
Wind Analysis

Reference: 建築物耐風設計規範 (50-year recurrence)
"""

from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class WindParams:
    """Wind design parameters for a location."""
    V_ms: float        # Basic design wind speed
    label: str
    importance: float = 1.0


def load_wind_data(data_path: Optional[Path] = None) -> dict:
    """Load wind zones from JSON."""
    if data_path is None:
        data_path = Path(__file__).parents[3] / 'data' / 'wind-zones.json'
    with open(data_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_wind_for_location(location: str, data: Optional[dict] = None) -> WindParams:
    """Look up wind speed for a location."""
    if data is None:
        data = load_wind_data()

    zones = data.get('zones', {})
    for zone_key, zone in zones.items():
        if any(area in location or location in area for area in zone.get('areas', [])):
            return WindParams(V_ms=zone['speed_ms'], label=zone['label'])

    # Default to general area (37.5 m/s)
    return WindParams(V_ms=37.5, label='一般風區（預設）')


def wind_pressure(V_ms: float) -> tuple[float, float]:
    """
    Basic wind pressure.
    q = 0.06 × V² (kgf/m²) where V in m/s
    Returns: (kgf/m², kN/m²)
    """
    q_kgfm2 = 0.06 * V_ms * V_ms
    q_kNm2 = q_kgfm2 / 102.0
    return q_kgfm2, q_kNm2


def wind_force(
    q_kNm2: float,
    area_m2: float,
    Cf: float = 1.3,
    G: float = 2.0,
) -> float:
    """
    Total wind force on a face.
    F = q × Cf × G × A (kN)
    """
    return q_kNm2 * Cf * G * area_m2


def wind_force_on_building(
    V_ms: float,
    plan_W_m: float,
    plan_D_m: float,
    total_H_m: float,
) -> dict:
    """
    Calculate total wind force on building (X and Y directions).
    """
    _, q_kNm2 = wind_pressure(V_ms)
    area_W = total_H_m * plan_W_m
    area_D = total_H_m * plan_D_m

    Fx = wind_force(q_kNm2, area_W)
    Fy = wind_force(q_kNm2, area_D)

    return {
        'V_ms': V_ms,
        'q_kgfm2': round(0.06 * V_ms * V_ms, 1),
        'q_kNm2': round(q_kNm2, 2),
        'force_X_kN': round(Fx, 0),
        'force_Y_kN': round(Fy, 0),
        'area_W_m2': round(area_W, 1),
        'area_D_m2': round(area_D, 1),
    }
