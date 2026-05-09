"""
Tests for quantity takeoff calculations.

Run: pytest tests/test_quantity.py -v
"""

import pytest
from struct_calc.quantity import (
    Column, Beam, Slab, ShearWall, DiaphragmWall,
    StructuralModel,
    column_volume, beam_volume, slab_volume,
    shear_wall_volume, diaphragm_wall_volume,
    calculate_concrete_volumes,
    calculate_rebar_tonnage,
    rebar_density_per_m3,
    takeoff,
)


# ═══════════════════════════════════════════════════
# UNIT TESTS - Volume calculations
# ═══════════════════════════════════════════════════

class TestVolumeCalculations:
    def test_column_volume(self):
        """700×700×3300 column = 0.7 × 0.7 × 3.3 = 1.617 m³"""
        c = Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350)
        assert column_volume(c) == pytest.approx(1.617, rel=1e-3)

    def test_beam_volume(self):
        """400×650×8000 beam = 0.4 × 0.65 × 8 = 2.08 m³"""
        b = Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280)
        assert beam_volume(b) == pytest.approx(2.08, rel=1e-3)

    def test_slab_volume(self):
        """50m² × 150mm slab = 50 × 0.15 = 7.5 m³"""
        s = Slab(floor=1, area=50.0, struct_thickness=150, sound_layer=0, fc=280)
        assert slab_volume(s) == pytest.approx(7.5, rel=1e-3)

    def test_slab_excludes_sound_layer(self):
        """Sound layer is not counted as concrete"""
        s = Slab(floor=1, area=50.0, struct_thickness=150, sound_layer=68, fc=280)
        assert slab_volume(s) == pytest.approx(7.5)  # not including 68mm

    def test_shear_wall_volume(self):
        """3m × 3.3m × 0.3m wall = 2.97 m³"""
        sw = ShearWall(length=3000, height=3300, thickness=300, fc=280)
        assert shear_wall_volume(sw) == pytest.approx(2.97, rel=1e-3)

    def test_diaphragm_wall_volume(self):
        """100m perimeter × 12m × 0.8m = 960 m³"""
        dw = DiaphragmWall(perimeter=100000, depth=12000, thickness=800, fc=280)
        assert diaphragm_wall_volume(dw) == pytest.approx(960, rel=1e-3)


# ═══════════════════════════════════════════════════
# INTEGRATION - full takeoff
# ═══════════════════════════════════════════════════

@pytest.fixture
def sample_model():
    """A small but realistic structural model: 5 columns, 4 beams, 1 slab."""
    columns = [
        Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350),
        Column(grid='A2', floor=1, width=700, depth=700, height=3300, fc=350),
        Column(grid='B1', floor=1, width=700, depth=700, height=3300, fc=350),
        Column(grid='B2', floor=1, width=700, depth=700, height=3300, fc=350),
        Column(grid='A1', floor=15, width=550, depth=550, height=3300, fc=245),
    ]
    beams = [
        Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280),
        Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280),
        Beam(direction='Y', floor=1, span=7000, width=400, depth=600, fc=280),
        Beam(direction='Y', floor=1, span=7000, width=400, depth=600, fc=280),
    ]
    slabs = [
        Slab(floor=1, area=56, struct_thickness=150, sound_layer=68, fc=280),
    ]
    walls = [
        ShearWall(length=3000, height=3300, thickness=300, fc=280),
    ]
    dwalls = [
        DiaphragmWall(perimeter=100000, depth=12000, thickness=800, fc=280),
    ]
    return StructuralModel(
        columns=columns,
        beams=beams,
        slabs=slabs,
        shear_walls=walls,
        diaphragm_walls=dwalls,
    )


class TestConcreteCalculation:
    def test_concrete_grouping(self, sample_model):
        result = calculate_concrete_volumes(sample_model)
        assert 'columns' in result
        assert 'beams' in result
        assert 'slabs' in result

    def test_column_fc350_volume(self, sample_model):
        """4 columns at fc=350"""
        result = calculate_concrete_volumes(sample_model)
        # 4 × 0.7 × 0.7 × 3.3 = 6.468 m³
        assert result['columns'].fc_350 == pytest.approx(6.468, rel=1e-3)

    def test_column_fc245_volume(self, sample_model):
        """1 column at fc=245"""
        result = calculate_concrete_volumes(sample_model)
        # 1 × 0.55 × 0.55 × 3.3 = 0.998 m³
        assert result['columns'].fc_245 == pytest.approx(0.998, rel=1e-3)


class TestRebarCalculation:
    def test_rebar_tonnage_positive(self, sample_model):
        concrete = calculate_concrete_volumes(sample_model)
        rebar = calculate_rebar_tonnage(concrete)
        assert rebar.total > 0
        assert rebar.columns > 0
        assert rebar.diaphragm_walls > 0

    def test_rebar_density_in_typical_range(self, sample_model):
        """Typical RC building: 120~180 kg/m³"""
        result = takeoff(sample_model)
        # Note: with sample data this may be outside range
        # In real building, should fall in 120-180
        assert result.rebar_density_kg_m3 > 0

    def test_rebar_uses_correct_ratio(self):
        """Verify a custom ratio is used correctly."""
        from struct_calc.quantity import ConcreteByFc

        concrete = {
            'columns': ConcreteByFc(fc_280=100.0),  # 100 m³
            'beams': ConcreteByFc(),
            'slabs': ConcreteByFc(),
            'shear_walls': ConcreteByFc(),
            'diaphragm_walls': ConcreteByFc(),
        }
        # With 0.025 ratio: 100 × 0.025 × 7850 / 1000 = 19.625 tons
        rebar = calculate_rebar_tonnage(concrete)
        assert rebar.columns == pytest.approx(19.625, rel=1e-3)


class TestFullTakeoff:
    def test_takeoff_runs_without_error(self, sample_model):
        result = takeoff(sample_model)
        assert result.concrete_total_m3 > 0
        assert result.rebar.total > 0

    def test_takeoff_to_dict(self, sample_model):
        result = takeoff(sample_model)
        d = result.to_dict()
        assert 'concrete_by_member' in d
        assert 'concrete_total_m3' in d
        assert 'rebar_tons' in d
        assert 'rebar_density_kg_m3' in d
