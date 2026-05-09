"""
Seismic Analysis (Equivalent Lateral Force Method)

Reference: 建築物耐震設計規範 (民國113年版)

Workflow:
    1. Determine SDS, SD1 by site location (data/seismic-zones.json)
    2. Apply site class amplification (Fa, Fv)
    3. Compute fundamental period T
    4. Get design spectral acceleration SaD
    5. Calculate base shear V
    6. Distribute V vertically -> Fx per floor
"""

from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional


StructureSystem = Literal['RC', 'S', 'SRC']


@dataclass
class SeismicParams:
    """Site-specific seismic parameters."""
    SS: float       # Short-period spectral acceleration (PGA)
    S1: float       # 1-sec period spectral acceleration
    SDS: float      # Design SS = Fa × SS
    SD1: float      # Design SD1 = Fv × S1
    site_class: int = 2
    near_fault: bool = False


def load_seismic_data(data_path: Optional[Path] = None) -> dict:
    """Load seismic zones from JSON."""
    if data_path is None:
        data_path = Path(__file__).parents[3] / 'data' / 'seismic-zones.json'
    with open(data_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_site_seismic(location: str, data: dict) -> SeismicParams:
    """Look up seismic parameters for a location."""
    zones = data.get('zones', {})
    if location not in zones:
        # fallback to Taipei
        location = '臺北市'
    z = zones[location]
    return SeismicParams(
        SS=z['SS'], S1=z['S1'],
        SDS=z['SDS'], SD1=z['SD1'],
        site_class=z.get('site_class', 2),
        near_fault=z.get('near_fault', False),
    )


def approximate_period(total_h_m: float, system: StructureSystem = 'RC') -> float:
    """T = Ct × H^0.75"""
    Ct = 0.085 if system == 'S' else 0.07
    return Ct * (total_h_m ** 0.75)


def design_spectral_acceleration(SDS: float, SD1: float, T: float) -> float:
    """Get SaD from response spectrum (simplified)."""
    T0 = 0.2 * SD1 / SDS if SDS > 0 else 0
    Ts = SD1 / SDS if SDS > 0 else 0

    if T <= T0:
        return SDS * (0.4 + 3 * T / Ts)
    elif T <= Ts:
        return SDS
    else:
        return SD1 / T


def base_shear(
    SaD: float,
    importance: float,
    weight_tf: float,
    R: float = 4.8,
    alpha_y: float = 1.0,
) -> float:
    """V = SaD × I × W / (1.4 × R × αy) (in tf)"""
    return (SaD * importance * weight_tf) / (1.4 * R * alpha_y)


def vertical_distribution(
    V_tf: float,
    weights_tf: list[float],
    heights_m: list[float],
    period_s: float,
) -> list[float]:
    """Fx = V × wi × hi^k / Σ"""
    if period_s <= 0.5:
        k = 1.0
    elif period_s >= 2.5:
        k = 2.0
    else:
        k = 1 + (period_s - 0.5) / 2.0

    denom = sum(w * (h ** k) for w, h in zip(weights_tf, heights_m))
    if denom == 0:
        return [0.0] * len(weights_tf)
    return [V_tf * w * (h ** k) / denom for w, h in zip(weights_tf, heights_m)]
