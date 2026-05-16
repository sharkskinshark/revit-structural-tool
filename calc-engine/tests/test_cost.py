"""
Tests for cost estimation helpers (formwork_area, estimate_cost, cost_per_floor_area).

Run: pytest tests/test_cost.py -v
"""

import pytest
from struct_calc.quantity import (
    Column, Beam, Slab, ShearWall, DiaphragmWall, StructuralModel, takeoff,
)
from struct_calc.cost import (
    formwork_area, estimate_cost, cost_per_floor_area, DEFAULT_PRICES,
)


# ─── Formwork area calculation ────────────────────────────────

class TestFormworkArea:
    def test_empty_model(self):
        assert formwork_area(StructuralModel()) == 0.0

    def test_single_column(self):
        """Column 700×700×3300 → 2(700+700)*3300 mm² = 9.24 m²"""
        m = StructuralModel(columns=[
            Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)
        ])
        assert formwork_area(m) == pytest.approx(9.24, abs=0.01)

    def test_single_beam(self):
        """Beam 400×650 × 8000 → (400+1300)*8000 mm² = 13.6 m²"""
        m = StructuralModel(beams=[
            Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280)
        ])
        assert formwork_area(m) == pytest.approx(13.6, abs=0.01)

    def test_single_slab_uses_area_directly(self):
        """Slab area 100 m² → formwork = 100 m² (bottom face only)"""
        m = StructuralModel(slabs=[
            Slab(floor=1, area=100.0, struct_thickness=150, sound_layer=0, fc=280)
        ])
        assert formwork_area(m) == pytest.approx(100.0)

    def test_single_shear_wall(self):
        """Wall 8000×3300×300 → 2*8000*3300 mm² = 52.8 m² (both faces)"""
        m = StructuralModel(shear_walls=[
            ShearWall(length=8000, height=3300, thickness=300, fc=280)
        ])
        assert formwork_area(m) == pytest.approx(52.8, abs=0.01)

    def test_single_diaphragm_wall(self):
        """D-wall perimeter 60000 × depth 4800 → 288 m² (inner face only)"""
        m = StructuralModel(diaphragm_walls=[
            DiaphragmWall(perimeter=60000, depth=4800, thickness=600, fc=280)
        ])
        assert formwork_area(m) == pytest.approx(288.0, abs=0.1)

    def test_combined_model_sums(self):
        m = StructuralModel(
            columns=[Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)],
            beams=[Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280)],
            slabs=[Slab(floor=1, area=100.0, struct_thickness=150, sound_layer=0, fc=280)],
        )
        # 9.24 + 13.6 + 100 = 122.84
        assert formwork_area(m) == pytest.approx(122.84, abs=0.01)

    def test_dwall_only_inner_face(self):
        """Dwall perimeter × depth (NOT 2×) — outer face cast against soil"""
        m = StructuralModel(diaphragm_walls=[
            DiaphragmWall(perimeter=100000, depth=10000, thickness=800, fc=280)
        ])
        # If we mistakenly counted 2 faces it'd be 2000 m²; correct is 1000 m²
        assert formwork_area(m) == pytest.approx(1000.0, abs=0.1)


# ─── estimate_cost ────────────────────────────────────────────

class TestEstimateCost:
    def _basic_model(self):
        return StructuralModel(
            columns=[
                Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350),
                Column(grid='A1', floor=2, width=700, depth=700, height=3300, fc=350),
            ],
            slabs=[
                Slab(floor=1, area=100.0, struct_thickness=150, sound_layer=0, fc=280),
                Slab(floor=2, area=100.0, struct_thickness=150, sound_layer=0, fc=280),
            ],
        )

    def test_concrete_cost_uses_fc_prices(self):
        model = self._basic_model()
        qto = takeoff(model)
        cost = estimate_cost(qto)

        # 2 cols × 0.7 × 0.7 × 3.3 = 3.234 m³ × 4000 (fc350) = 12,936 NTD
        # 2 slabs × 100 × 0.15 = 30 m³ × 3500 (fc280) = 105,000 NTD
        assert cost.concrete[350] == pytest.approx(12936, abs=10)
        assert cost.concrete[280] == pytest.approx(105000, abs=10)

    def test_grand_total_sums_categories(self):
        model = self._basic_model()
        qto = takeoff(model)
        cost = estimate_cost(qto, formwork_area_m2=200, diaphragm_wall_volume_m3=10)

        manual = (
            cost.concrete_total
            + cost.rebar
            + cost.steel
            + cost.diaphragm_wall
            + cost.formwork
        )
        assert cost.grand_total == pytest.approx(manual)

    def test_formwork_zero_means_no_formwork_cost(self):
        model = self._basic_model()
        qto = takeoff(model)
        cost = estimate_cost(qto, formwork_area_m2=0)
        assert cost.formwork == 0

    def test_custom_prices_override_default(self):
        model = self._basic_model()
        qto = takeoff(model)
        custom = dict(DEFAULT_PRICES)
        custom['rebar_per_ton'] = 50000  # double
        cost = estimate_cost(qto, prices=custom)
        # rebar should reflect the override
        default = estimate_cost(qto)
        assert cost.rebar > default.rebar


# ─── cost_per_floor_area ──────────────────────────────────────

class TestCostPerFloorArea:
    def test_zero_area_returns_zero(self):
        from struct_calc.cost import CostBreakdown
        out = cost_per_floor_area(CostBreakdown(), 0)
        assert out == {'per_m2': 0, 'per_ping': 0}

    def test_per_ping_is_per_m2_times_3_3(self):
        from struct_calc.cost import CostBreakdown
        cb = CostBreakdown(formwork=1_000_000)
        out = cost_per_floor_area(cb, 100)
        assert out['per_m2'] == pytest.approx(10000, abs=1)
        assert out['per_ping'] == pytest.approx(33058, abs=10)
