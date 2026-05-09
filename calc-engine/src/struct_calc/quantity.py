"""
Material Quantity Takeoff

Calculates concrete volumes, rebar tonnage, and steel tonnage from
structural element definitions.

Reference: HANDOFF.md - Phase 2 Section "用量計算需求"
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
from pydantic import BaseModel, Field


REBAR_DENSITY_KG_M3 = 7850
STEEL_DENSITY_KG_M3 = 7850

# Empirical reinforcement ratios (from prices.json)
DEFAULT_REBAR_RATIOS = {
    'column':         0.025,   # 2.5%
    'main_beam':      0.018,
    'secondary_beam': 0.015,
    'slab':           0.006,
    'shear_wall':     0.008,
    'diaphragm_wall': 0.012,
    'foundation':     0.015,
}


# ═══════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════

class Column(BaseModel):
    """Single column instance."""
    grid: str            # "A1", "B2", etc.
    floor: int           # negative=basement
    width: float         # mm
    depth: float         # mm
    height: float        # mm
    fc: int              # kgf/cm² (210/245/280/350/420)


class Beam(BaseModel):
    """Single beam instance."""
    direction: Literal['X', 'Y']
    floor: int
    span: float          # mm
    width: float         # B mm
    depth: float         # D mm
    fc: int = 280
    is_main: bool = True


class Slab(BaseModel):
    """Slab instance covering an area."""
    floor: int
    area: float          # m²
    struct_thickness: float    # mm (RC structure)
    sound_layer: float = 0     # mm (§46-6 sound insulation)
    fc: int = 280


class ShearWall(BaseModel):
    """Shear wall (vertical RC wall in service core)."""
    length: float        # mm
    height: float        # mm
    thickness: float     # mm
    fc: int = 280


class DiaphragmWall(BaseModel):
    """Basement perimeter diaphragm wall."""
    perimeter: float     # mm
    depth: float         # mm
    thickness: float     # mm
    fc: int = 280


class StructuralModel(BaseModel):
    """Complete structural model."""
    columns: list[Column] = Field(default_factory=list)
    beams: list[Beam] = Field(default_factory=list)
    slabs: list[Slab] = Field(default_factory=list)
    shear_walls: list[ShearWall] = Field(default_factory=list)
    diaphragm_walls: list[DiaphragmWall] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════
# CONCRETE VOLUME CALCULATION
# ═══════════════════════════════════════════════════════

@dataclass
class ConcreteByFc:
    """Concrete volumes grouped by fc' strength."""
    fc_210: float = 0.0
    fc_245: float = 0.0
    fc_280: float = 0.0
    fc_350: float = 0.0
    fc_420: float = 0.0

    @property
    def total(self) -> float:
        return self.fc_210 + self.fc_245 + self.fc_280 + self.fc_350 + self.fc_420

    def add(self, fc: int, volume: float):
        attr = f'fc_{fc}'
        if hasattr(self, attr):
            setattr(self, attr, getattr(self, attr) + volume)
        else:
            raise ValueError(f"Unknown fc strength: {fc}")

    def to_dict(self) -> dict:
        return {
            'fc_210': round(self.fc_210, 1),
            'fc_245': round(self.fc_245, 1),
            'fc_280': round(self.fc_280, 1),
            'fc_350': round(self.fc_350, 1),
            'fc_420': round(self.fc_420, 1),
            'total':  round(self.total, 1),
        }


def column_volume(c: Column) -> float:
    """Single column volume in m³"""
    return (c.width * c.depth * c.height) / 1e9


def beam_volume(b: Beam) -> float:
    """Single beam volume in m³"""
    return (b.width * b.depth * b.span) / 1e9


def slab_volume(s: Slab) -> float:
    """Slab volume (structural part only) in m³"""
    return s.area * (s.struct_thickness / 1000)


def shear_wall_volume(sw: ShearWall) -> float:
    """Shear wall volume in m³"""
    return (sw.length * sw.height * sw.thickness) / 1e9


def diaphragm_wall_volume(dw: DiaphragmWall) -> float:
    """Diaphragm wall volume in m³"""
    return (dw.perimeter * dw.depth * dw.thickness) / 1e9


def calculate_concrete_volumes(model: StructuralModel) -> dict[str, ConcreteByFc]:
    """
    Calculate concrete volumes grouped by structural element type and fc' strength.

    Returns:
        dict mapping element type -> ConcreteByFc
    """
    result = {
        'columns':         ConcreteByFc(),
        'beams':           ConcreteByFc(),
        'slabs':           ConcreteByFc(),
        'shear_walls':     ConcreteByFc(),
        'diaphragm_walls': ConcreteByFc(),
    }

    for c in model.columns:
        result['columns'].add(c.fc, column_volume(c))

    for b in model.beams:
        result['beams'].add(b.fc, beam_volume(b))

    for s in model.slabs:
        result['slabs'].add(s.fc, slab_volume(s))

    for sw in model.shear_walls:
        result['shear_walls'].add(sw.fc, shear_wall_volume(sw))

    for dw in model.diaphragm_walls:
        result['diaphragm_walls'].add(dw.fc, diaphragm_wall_volume(dw))

    return result


# ═══════════════════════════════════════════════════════
# REBAR TONNAGE
# ═══════════════════════════════════════════════════════

@dataclass
class RebarSummary:
    """Rebar tonnage by member type."""
    columns: float = 0.0
    main_beams: float = 0.0
    secondary_beams: float = 0.0
    slabs: float = 0.0
    shear_walls: float = 0.0
    diaphragm_walls: float = 0.0

    @property
    def total(self) -> float:
        return (self.columns + self.main_beams + self.secondary_beams +
                self.slabs + self.shear_walls + self.diaphragm_walls)

    def to_dict(self) -> dict:
        return {
            'columns':         round(self.columns, 1),
            'main_beams':      round(self.main_beams, 1),
            'secondary_beams': round(self.secondary_beams, 1),
            'slabs':           round(self.slabs, 1),
            'shear_walls':     round(self.shear_walls, 1),
            'diaphragm_walls': round(self.diaphragm_walls, 1),
            'total':           round(self.total, 1),
        }


def calculate_rebar_tonnage(
    concrete_volumes: dict[str, ConcreteByFc],
    ratios: dict[str, float] | None = None
) -> RebarSummary:
    """
    Estimate rebar tonnage from concrete volumes using reinforcement ratios.

    formula: rebar_tons = volume × ratio × 7850 kg/m³ / 1000

    Args:
        concrete_volumes: From calculate_concrete_volumes()
        ratios: Custom reinforcement ratios (optional)
    """
    r = ratios or DEFAULT_REBAR_RATIOS

    summary = RebarSummary()
    summary.columns = (
        concrete_volumes['columns'].total * r['column'] * REBAR_DENSITY_KG_M3 / 1000
    )
    summary.main_beams = (
        concrete_volumes['beams'].total * r['main_beam'] * REBAR_DENSITY_KG_M3 / 1000
    )
    # Note: For more accuracy, separate main/secondary beams in model
    summary.slabs = (
        concrete_volumes['slabs'].total * r['slab'] * REBAR_DENSITY_KG_M3 / 1000
    )
    summary.shear_walls = (
        concrete_volumes['shear_walls'].total * r['shear_wall'] * REBAR_DENSITY_KG_M3 / 1000
    )
    summary.diaphragm_walls = (
        concrete_volumes['diaphragm_walls'].total * r['diaphragm_wall']
        * REBAR_DENSITY_KG_M3 / 1000
    )

    return summary


def rebar_density_per_m3(rebar: RebarSummary, total_concrete_m3: float) -> float:
    """
    Calculate average rebar density (kg/m³ concrete).
    Typical RC building: 120~180 kg/m³.
    """
    if total_concrete_m3 == 0:
        return 0.0
    return rebar.total * 1000 / total_concrete_m3


# ═══════════════════════════════════════════════════════
# QUANTITY TAKEOFF (top-level)
# ═══════════════════════════════════════════════════════

@dataclass
class QuantityTakeoff:
    """Complete quantity takeoff result."""
    concrete_by_member: dict[str, ConcreteByFc] = field(default_factory=dict)
    concrete_total_m3: float = 0.0
    concrete_by_fc: ConcreteByFc = field(default_factory=ConcreteByFc)
    rebar: RebarSummary = field(default_factory=RebarSummary)
    rebar_density_kg_m3: float = 0.0

    def to_dict(self) -> dict:
        return {
            'concrete_by_member': {
                k: v.to_dict() for k, v in self.concrete_by_member.items()
            },
            'concrete_total_m3': round(self.concrete_total_m3, 1),
            'concrete_by_fc': self.concrete_by_fc.to_dict(),
            'rebar_tons': self.rebar.to_dict(),
            'rebar_density_kg_m3': round(self.rebar_density_kg_m3, 1),
        }


def takeoff(model: StructuralModel) -> QuantityTakeoff:
    """
    Run complete quantity takeoff on a structural model.
    """
    concrete = calculate_concrete_volumes(model)

    # Aggregate concrete by fc'
    by_fc = ConcreteByFc()
    total = 0.0
    for member_volumes in concrete.values():
        by_fc.fc_210 += member_volumes.fc_210
        by_fc.fc_245 += member_volumes.fc_245
        by_fc.fc_280 += member_volumes.fc_280
        by_fc.fc_350 += member_volumes.fc_350
        by_fc.fc_420 += member_volumes.fc_420
        total += member_volumes.total

    rebar = calculate_rebar_tonnage(concrete)

    return QuantityTakeoff(
        concrete_by_member=concrete,
        concrete_total_m3=total,
        concrete_by_fc=by_fc,
        rebar=rebar,
        rebar_density_kg_m3=rebar_density_per_m3(rebar, total),
    )
