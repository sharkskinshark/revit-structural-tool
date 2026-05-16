"""
Tests for 強柱弱梁 (SCWB) check.

Run: pytest tests/test_scwb.py -v
"""

import pytest
from struct_calc.quantity import Column, Beam, StructuralModel
from struct_calc.scwb import (
    column_moment_capacity_kNm,
    beam_moment_capacity_kNm,
    check_scwb,
    SCWB_RATIO_THRESHOLD,
)


# ─── Mn computations ─────────────────────────────────────────

class TestMomentCapacity:
    def test_column_700x700_fc350_in_reasonable_range(self):
        """700×700 fc=350 column → Mn around 700 kN·m order of magnitude.

        Sanity: ρ=2.5%, b=700, d=650, fy=412 MPa, fc'=34.3 MPa
        As ≈ 11,375 mm²; a ≈ As·fy/(0.85·fc'·b) ≈ 230 mm; Mn ≈ As·fy·(d-a/2)
        ≈ 11375 × 412 × (650-115) ≈ 2.5e9 N·mm = 2,500 kN·m
        """
        c = Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)
        mn = column_moment_capacity_kNm(c)
        assert 1500 < mn < 3500, f"Mn = {mn:.1f} 出乎意料"

    def test_column_smaller_section_lower_Mn(self):
        big = Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)
        small = Column(grid='A1', floor=1, width=400, depth=400, height=3300, fc=245)
        assert column_moment_capacity_kNm(big) > column_moment_capacity_kNm(small)

    def test_higher_fc_yields_higher_Mn(self):
        low = Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=210)
        high = Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=420)
        # Higher fc' allows smaller stress block → slightly more lever arm → more Mn
        assert column_moment_capacity_kNm(high) > column_moment_capacity_kNm(low)

    def test_beam_400x650_in_reasonable_range(self):
        """Typical 400×650 beam fc=280 → Mn order of ~500 kN·m.
        ρ=1.8%, b=400, d=580, fy=412, fc'=27.5
        As ≈ 4176 mm²; a ≈ 184 mm; Mn ≈ 4176 × 412 × (580-92) = 8.4e8 N·mm = 840 kN·m
        """
        b = Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280)
        mn = beam_moment_capacity_kNm(b)
        assert 400 < mn < 1200, f"Mn = {mn:.1f}"

    def test_threshold_constant(self):
        assert SCWB_RATIO_THRESHOLD == pytest.approx(1.2)


# ─── Joint check ─────────────────────────────────────────────

class TestJointCheck:
    def _two_floor_model(self, col_size=700, beam_b=400, beam_d=650, fc_col=350):
        """Two-floor model with 1 column line and 2 beams."""
        return StructuralModel(
            columns=[
                Column(grid='A1', floor=1, width=col_size, depth=col_size,
                       height=3300, fc=fc_col),
                Column(grid='A1', floor=2, width=col_size, depth=col_size,
                       height=3300, fc=fc_col),
            ],
            beams=[
                Beam(direction='X', floor=1, span=8000, width=beam_b, depth=beam_d, fc=280),
                Beam(direction='Y', floor=1, span=7000, width=beam_b, depth=beam_d, fc=280),
            ],
        )

    def test_strong_column_passes(self):
        m = self._two_floor_model(col_size=800, beam_b=400, beam_d=600)
        result = check_scwb(m)
        # Joint at floor=1 (with 2 beams) should pass
        joint_f1 = next(j for j in result.joints if j.floor == 1)
        assert joint_f1.passes
        assert joint_f1.ratio >= 1.2

    def test_weak_column_fails(self):
        # Tiny column 400×400 fc=210 with hefty beams 500×800 fc=350
        m = StructuralModel(
            columns=[
                Column(grid='A1', floor=1, width=400, depth=400, height=3300, fc=210),
                Column(grid='A1', floor=2, width=400, depth=400, height=3300, fc=210),
            ],
            beams=[
                Beam(direction='X', floor=1, span=8000, width=500, depth=800, fc=350),
                Beam(direction='Y', floor=1, span=7000, width=500, depth=800, fc=350),
            ],
        )
        result = check_scwb(m)
        joint_f1 = next(j for j in result.joints if j.floor == 1)
        assert not joint_f1.passes
        assert joint_f1.ratio < 1.2

    def test_top_floor_no_col_above_still_checks(self):
        m = self._two_floor_model()
        result = check_scwb(m)
        # Floor 2 has col_below but no col_above → ΣMnc = single column Mn
        joint_f2 = next(j for j in result.joints if j.floor == 2)
        joint_f1 = next(j for j in result.joints if j.floor == 1)
        # Top joint Mnc should be roughly half of mid-joint
        assert joint_f2.sum_Mnc_kNm < joint_f1.sum_Mnc_kNm

    def test_floor_with_no_beams_trivially_passes(self):
        m = StructuralModel(columns=[
            Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)
        ])
        result = check_scwb(m)
        assert result.joints[0].sum_Mnb_kNm == 0
        assert result.joints[0].passes  # ratio = inf


class TestSCWBSummary:
    def test_pass_rate_when_all_pass(self):
        m = StructuralModel(
            columns=[Column(grid='A1', floor=1, width=900, depth=900, height=3300, fc=420)],
            beams=[Beam(direction='X', floor=1, span=8000, width=300, depth=400, fc=210)],
        )
        result = check_scwb(m)
        assert result.pass_rate == 1.0
        assert result.failing == 0
        assert result.failing_floors == []

    def test_pass_rate_when_all_fail(self):
        m = StructuralModel(
            columns=[Column(grid='A1', floor=1, width=300, depth=300, height=3300, fc=210)],
            beams=[Beam(direction='X', floor=1, span=8000, width=600, depth=900, fc=420)],
        )
        result = check_scwb(m)
        assert result.pass_rate == 0.0
        assert 1 in result.failing_floors

    def test_to_dict_serializable(self):
        m = StructuralModel(
            columns=[Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)],
            beams=[Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280)],
        )
        d = check_scwb(m).to_dict()
        assert 'total_joints' in d
        assert 'pass_rate' in d
        assert isinstance(d['joints'], list)


class TestFloorSkipZero:
    """Floor numbering skips 0 (B1F → 1F directly)."""
    def test_b1f_to_1f_continuity(self):
        m = StructuralModel(
            columns=[
                Column(grid='A1', floor=-1, width=700, depth=700, height=3300, fc=350),
                Column(grid='A1', floor=1,  width=700, depth=700, height=3300, fc=350),
            ],
            beams=[
                Beam(direction='X', floor=-1, span=8000, width=400, depth=650, fc=280),
            ],
        )
        result = check_scwb(m)
        # B1F joint should see col above (1F), so its sum_Mnc has 2 cols
        joint_b1 = next(j for j in result.joints if j.floor == -1)
        joint_1 = next(j for j in result.joints if j.floor == 1)
        assert joint_b1.sum_Mnc_kNm > joint_1.sum_Mnc_kNm
