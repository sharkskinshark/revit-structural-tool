"""
Cost Estimation

Calculates structural cost based on quantity takeoff and reference unit prices.

Reference: data/prices.json
Disclaimer: Prices are reference values. Verify with current market quotes.
"""

from __future__ import annotations
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .quantity import QuantityTakeoff, ConcreteByFc, RebarSummary, StructuralModel


# Default prices (NTD) - sync with data/prices.json
DEFAULT_PRICES = {
    'concrete': {
        210: 3200,
        245: 3300,
        280: 3500,
        350: 4000,
        420: 4500,
    },
    'rebar_per_ton': 28000,
    'steel_per_ton': 55000,
    'diaphragm_wall_per_m3': 10500,
    'formwork_per_m2': 800,
}


@dataclass
class CostBreakdown:
    """Detailed cost breakdown by category."""
    concrete: dict[int, float] = field(default_factory=dict)  # fc -> NTD
    concrete_total: float = 0.0
    rebar: float = 0.0
    steel: float = 0.0
    diaphragm_wall: float = 0.0
    formwork: float = 0.0

    @property
    def grand_total(self) -> float:
        return (self.concrete_total + self.rebar + self.steel +
                self.diaphragm_wall + self.formwork)

    def to_dict(self) -> dict:
        return {
            'concrete_by_fc': {f'fc_{k}': round(v, 0) for k, v in self.concrete.items()},
            'concrete_total': round(self.concrete_total, 0),
            'rebar': round(self.rebar, 0),
            'steel': round(self.steel, 0),
            'diaphragm_wall': round(self.diaphragm_wall, 0),
            'formwork': round(self.formwork, 0),
            'grand_total': round(self.grand_total, 0),
        }


def load_prices(prices_path: Optional[Path] = None) -> dict:
    """Load prices from JSON file, fallback to defaults."""
    if prices_path and prices_path.exists():
        with open(prices_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Convert to internal format
        return {
            'concrete': {
                210: data['concrete']['fc_210']['price_per_m3'],
                245: data['concrete']['fc_245']['price_per_m3'],
                280: data['concrete']['fc_280']['price_per_m3'],
                350: data['concrete']['fc_350']['price_per_m3'],
                420: data['concrete']['fc_420']['price_per_m3'],
            },
            'rebar_per_ton': data['rebar']['general']['price_per_ton'],
            'steel_per_ton': data['steel']['structural']['price_per_ton'],
            'diaphragm_wall_per_m3': data['specialty']['diaphragm_wall']['price_per_m3'],
            'formwork_per_m2': data['formwork']['general']['price_per_m2'],
        }
    return DEFAULT_PRICES


def estimate_cost(
    takeoff: QuantityTakeoff,
    diaphragm_wall_volume_m3: float = 0.0,
    formwork_area_m2: float = 0.0,
    steel_tons: float = 0.0,
    prices: Optional[dict] = None,
) -> CostBreakdown:
    """
    Estimate total structural cost from quantity takeoff.

    Args:
        takeoff: Quantity takeoff result
        diaphragm_wall_volume_m3: Total D-wall volume
        formwork_area_m2: Total formwork area (estimate from member surfaces)
        steel_tons: Total steel tonnage (for SRC/S structures)
        prices: Custom prices (optional)
    """
    p = prices or DEFAULT_PRICES
    breakdown = CostBreakdown()

    # Concrete by fc'
    by_fc = takeoff.concrete_by_fc
    for fc_value, vol_attr in [
        (210, 'fc_210'), (245, 'fc_245'), (280, 'fc_280'),
        (350, 'fc_350'), (420, 'fc_420')
    ]:
        vol = getattr(by_fc, vol_attr)
        cost = vol * p['concrete'][fc_value]
        breakdown.concrete[fc_value] = cost
        breakdown.concrete_total += cost

    # Rebar
    breakdown.rebar = takeoff.rebar.total * p['rebar_per_ton']

    # Steel (SRC/S structures only)
    breakdown.steel = steel_tons * p['steel_per_ton']

    # Diaphragm wall
    breakdown.diaphragm_wall = diaphragm_wall_volume_m3 * p['diaphragm_wall_per_m3']

    # Formwork
    breakdown.formwork = formwork_area_m2 * p['formwork_per_m2']

    return breakdown


def formwork_area(model: StructuralModel) -> float:
    """Total formwork area in m² (sum of cast-against-form surfaces).

    Per-member rules (mm based, returned in m²):
      - Column:        perimeter × height          (lateral; top/bottom shared with slab)
      - Beam:          (B + 2D) × span             (bottom + 2 sides; top cast with slab)
      - Slab:          area                        (bottom only; top is finish)
      - Shear wall:    2 × length × height         (both faces; interior wall)
      - Diaphragm wall: perimeter × depth          (inner face only; outer cast against soil)

    Note: This is design-phase estimate. Actual formwork includes corners,
    openings, edge beams, ramps, etc. — usually 5-15% higher.
    """
    total_mm2 = 0.0
    for c in model.columns:
        total_mm2 += 2 * (c.width + c.depth) * c.height
    for b in model.beams:
        total_mm2 += (b.width + 2 * b.depth) * b.span
    for sw in model.shear_walls:
        total_mm2 += 2 * sw.length * sw.height
    for dw in model.diaphragm_walls:
        total_mm2 += dw.perimeter * dw.depth

    # Slab area is already in m² in our model
    slab_area_m2 = sum(s.area for s in model.slabs)

    return total_mm2 / 1e6 + slab_area_m2


def cost_per_floor_area(
    breakdown: CostBreakdown,
    total_floor_area_m2: float,
    ping_to_m2: float = 3.30578
) -> dict:
    """
    Calculate cost per square meter and per ping (Taiwanese unit).
    """
    if total_floor_area_m2 == 0:
        return {'per_m2': 0, 'per_ping': 0}

    per_m2 = breakdown.grand_total / total_floor_area_m2
    per_ping = per_m2 * ping_to_m2

    return {
        'total_floor_area_m2': total_floor_area_m2,
        'total_floor_area_ping': round(total_floor_area_m2 / ping_to_m2, 1),
        'per_m2': round(per_m2, 0),
        'per_ping': round(per_ping, 0),
    }
