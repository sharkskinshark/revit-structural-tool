"""
強柱弱梁（Strong-Column-Weak-Beam, SCWB）design-phase check.

ACI 318-21 §18.7.3.2 / 建築物耐震設計規範:
    ΣMnc ≥ (6/5) ΣMnb at each beam-column joint

This module provides a *design-phase* approximation:
- Pure-flexure Mn for both columns and beams (no axial load consideration)
- Standard reinforcement ratios assumed (column 2.5%, beam 1.8%)
- At each (grid, floor) joint, sum of column Mn (above + below the joint)
  vs sum of typical beam Mn at that level (X-dir + Y-dir)

WARNING: This is a coarse design-phase screening tool. It does NOT replace:
- Proper interaction-diagram analysis with actual axial loads
- Detailed reinforcement layout
- Licensed structural engineer's certification
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict

from .quantity import StructuralModel, Column, Beam


# ─── Design assumptions ───────────────────────────────────────

RHO_COLUMN = 0.025          # 2.5% reinforcement (typical RC column)
RHO_BEAM_MAIN = 0.018       # 1.8% main beam
COVER_COL_MM = 50           # clear cover, columns
COVER_BEAM_MM = 70          # clear cover, beams
FY_KGF_CM2 = 4200           # SD420W
SCWB_RATIO_THRESHOLD = 6.0 / 5.0   # 1.2

# Unit conversion: 1 kgf/cm² = 0.0980665 MPa
KGFCM2_TO_MPA = 0.0980665


def _to_mpa(stress_kgfcm2: float) -> float:
    return stress_kgfcm2 * KGFCM2_TO_MPA


# ─── Moment capacity (pure flexure) ────────────────────────────

def column_moment_capacity_kNm(c: Column) -> float:
    """Pure-flexure Mn for a rectangular RC column (kN·m).

    Mn = As · fy · (d - a/2)  with  a = (As · fy) / (0.85 · fc' · b)
    """
    fc_mpa = _to_mpa(c.fc)
    fy_mpa = _to_mpa(FY_KGF_CM2)
    d = c.depth - COVER_COL_MM      # mm
    b = c.width                     # mm
    As = RHO_COLUMN * b * d         # mm²
    a = (As * fy_mpa) / (0.85 * fc_mpa * b)
    Mn_Nmm = As * fy_mpa * (d - a / 2)
    return Mn_Nmm / 1e6             # N·mm → kN·m


def beam_moment_capacity_kNm(beam: Beam) -> float:
    """Pure-flexure Mn for a rectangular RC beam (kN·m)."""
    fc_mpa = _to_mpa(beam.fc)
    fy_mpa = _to_mpa(FY_KGF_CM2)
    d = beam.depth - COVER_BEAM_MM
    bw = beam.width
    As = RHO_BEAM_MAIN * bw * d
    a = (As * fy_mpa) / (0.85 * fc_mpa * bw)
    Mn_Nmm = As * fy_mpa * (d - a / 2)
    return Mn_Nmm / 1e6


# ─── Joint check ──────────────────────────────────────────────

@dataclass
class JointCheck:
    grid: str
    floor: int
    sum_Mnc_kNm: float        # column above + column below
    sum_Mnb_kNm: float        # 2 × typical beam at this floor
    ratio: float              # ΣMnc / ΣMnb
    passes: bool              # ratio ≥ 1.2

    def to_dict(self) -> dict:
        return {
            'grid': self.grid,
            'floor': self.floor,
            'sum_Mnc_kNm': round(self.sum_Mnc_kNm, 1),
            'sum_Mnb_kNm': round(self.sum_Mnb_kNm, 1),
            'ratio': round(self.ratio, 3),
            'passes': self.passes,
        }


@dataclass
class SCWBSummary:
    joints: list[JointCheck] = field(default_factory=list)
    failing_floors: list[int] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.joints)

    @property
    def passing(self) -> int:
        return sum(1 for j in self.joints if j.passes)

    @property
    def failing(self) -> int:
        return self.total - self.passing

    @property
    def pass_rate(self) -> float:
        return self.passing / self.total if self.total > 0 else 1.0

    def to_dict(self) -> dict:
        return {
            'total_joints': self.total,
            'passing': self.passing,
            'failing': self.failing,
            'pass_rate': round(self.pass_rate, 3),
            'failing_floors': self.failing_floors,
            'joints': [j.to_dict() for j in self.joints],
        }


def _next_floor_skip_zero(f: int) -> int:
    """Return f+1, skipping 0 (B1F → 1F directly)."""
    return f + 2 if f == -1 else f + 1


def check_scwb(model: StructuralModel) -> SCWBSummary:
    """Run 強柱弱梁 ratio check on every (grid, floor) joint.

    Joint definition: located at the TOP of floor f (where the floor's
    beams sit). At this joint:
      col_below = column at floor f (extends down to its bottom)
      col_above = column at next floor up (extends up; may be absent at top)

    Beams: averaged Mn of all beams at this floor, multiplied by 2 to
    represent 2 perpendicular beams framing the joint (X + Y).
    """
    # Index columns by (grid, floor)
    col_by_loc = {(c.grid, c.floor): c for c in model.columns}

    # Average Mnb per floor
    beams_by_floor: dict[int, list[Beam]] = {}
    for b in model.beams:
        beams_by_floor.setdefault(b.floor, []).append(b)
    avg_mnb_by_floor: dict[int, float] = {}
    for floor, blist in beams_by_floor.items():
        if blist:
            mns = [beam_moment_capacity_kNm(b) for b in blist]
            avg_mnb_by_floor[floor] = sum(mns) / len(mns)

    joints: list[JointCheck] = []
    for (grid, floor), col in col_by_loc.items():
        sum_mnc = column_moment_capacity_kNm(col)
        col_above = col_by_loc.get((grid, _next_floor_skip_zero(floor)))
        if col_above is not None:
            sum_mnc += column_moment_capacity_kNm(col_above)

        # Beams at the TOP of this floor (= the joint level)
        avg_mnb = avg_mnb_by_floor.get(floor, 0.0)
        sum_mnb = 2 * avg_mnb

        if sum_mnb > 0:
            ratio = sum_mnc / sum_mnb
        else:
            ratio = float('inf')   # no beam at this joint → trivially passes

        joints.append(JointCheck(
            grid=grid, floor=floor,
            sum_Mnc_kNm=sum_mnc, sum_Mnb_kNm=sum_mnb,
            ratio=ratio,
            passes=ratio >= SCWB_RATIO_THRESHOLD,
        ))

    failing_floors = sorted({j.floor for j in joints if not j.passes})

    return SCWBSummary(joints=joints, failing_floors=failing_floors)
