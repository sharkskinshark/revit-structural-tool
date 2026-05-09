"""
Tests for design.json loader.

Run: pytest tests/test_from_json.py -v
"""

import json
from pathlib import Path

import pytest

from struct_calc.from_json import (
    load_design,
    model_from_design,
    project_info_from_design,
    family_inventory_from_design,
    SchemaVersionError,
    SUPPORTED_MAJOR,
)
from struct_calc.quantity import takeoff


FIXTURE = Path(__file__).parent / 'fixtures' / 'sample_design.json'


@pytest.fixture
def sample_design():
    return load_design(FIXTURE)


# ─── Schema version handling ──────────────────────────────────

class TestSchemaVersion:
    def test_supported_major_is_one(self):
        assert SUPPORTED_MAJOR == 1

    def test_load_valid_fixture(self, sample_design):
        assert sample_design['schema_version'] == '1.0'

    def test_missing_version_raises(self, tmp_path):
        bad = tmp_path / 'bad.json'
        bad.write_text(json.dumps({'foo': 'bar'}), encoding='utf-8')
        with pytest.raises(SchemaVersionError, match='Missing schema_version'):
            load_design(bad)

    def test_wrong_major_raises(self, tmp_path):
        bad = tmp_path / 'bad.json'
        bad.write_text(json.dumps({'schema_version': '2.0'}), encoding='utf-8')
        with pytest.raises(SchemaVersionError, match='Unsupported schema'):
            load_design(bad)

    def test_minor_version_accepted(self, tmp_path):
        # Minor versions within same major must be accepted (backward compat)
        ok = tmp_path / 'ok.json'
        ok.write_text(json.dumps({'schema_version': '1.5'}), encoding='utf-8')
        # No raise — load returns the dict
        out = load_design(ok)
        assert out['schema_version'] == '1.5'

    def test_invalid_version_string_raises(self, tmp_path):
        bad = tmp_path / 'bad.json'
        bad.write_text(json.dumps({'schema_version': 'abc'}), encoding='utf-8')
        with pytest.raises(SchemaVersionError, match='Invalid'):
            load_design(bad)


# ─── Conversion to StructuralModel ────────────────────────────

class TestModelConversion:
    def test_columns_count_matches(self, sample_design):
        model = model_from_design(sample_design)
        assert len(model.columns) == 3

    def test_columns_fields_mapped(self, sample_design):
        model = model_from_design(sample_design)
        c = model.columns[0]
        assert c.grid == 'A1'
        assert c.floor == -1
        assert c.width == 700
        assert c.depth == 700
        assert c.height == 3300
        assert c.fc == 350

    def test_beams_count_and_directions(self, sample_design):
        model = model_from_design(sample_design)
        assert len(model.beams) == 2
        dirs = sorted(b.direction for b in model.beams)
        assert dirs == ['X', 'Y']

    def test_slabs_preserve_sound_layer(self, sample_design):
        model = model_from_design(sample_design)
        assert all(s.sound_layer == 68 for s in model.slabs)

    def test_shear_walls_count(self, sample_design):
        model = model_from_design(sample_design)
        assert len(model.shear_walls) == 4

    def test_diaphragm_wall_present(self, sample_design):
        model = model_from_design(sample_design)
        assert len(model.diaphragm_walls) == 1
        d = model.diaphragm_walls[0]
        assert d.perimeter == 60000
        assert d.thickness == 600


# ─── Project info extraction ──────────────────────────────────

class TestProjectInfo:
    def test_project_basics(self, sample_design):
        info = project_info_from_design(sample_design)
        assert info['project_name'] == 'Tiny Test Building'
        assert info['location'] == '臺北市'
        assert info['structure_system'] == 'RC'

    def test_floor_count(self, sample_design):
        info = project_info_from_design(sample_design)
        assert info['total_floors'] == 2
        assert info['total_floors_below'] == 1

    def test_total_area_summed_from_slabs(self, sample_design):
        info = project_info_from_design(sample_design)
        # Two 224 m² slabs
        assert info['total_floor_area_m2'] == pytest.approx(448.0, abs=0.1)

    def test_design_params(self, sample_design):
        info = project_info_from_design(sample_design)
        assert info['design_wind_speed'] == 42.5
        assert info['SDS'] == 0.66
        assert info['SD1'] == 0.385


# ─── Family inventory reshape ─────────────────────────────────

class TestFamilyInventory:
    def test_categories_present(self, sample_design):
        inv = family_inventory_from_design(sample_design)
        assert '柱' in inv
        assert '梁' in inv
        assert '樓板' in inv
        assert '牆' in inv

    def test_columns_count(self, sample_design):
        inv = family_inventory_from_design(sample_design)
        assert inv['柱'][0]['count'] == 3
        assert 'RC-C-700' in inv['柱'][0]['type']


# ─── End-to-end: design.json → takeoff ────────────────────────

class TestEndToEnd:
    def test_takeoff_runs(self, sample_design):
        model = model_from_design(sample_design)
        qto = takeoff(model)
        # Sanity: should have non-zero concrete in fc=280 (beams + slabs + walls)
        assert qto.concrete_by_fc.fc_280 > 0
        # And in fc=350 (columns)
        assert qto.concrete_by_fc.fc_350 > 0

    def test_column_volume_correct(self, sample_design):
        """3 columns × 0.7 × 0.7 × 3.3 = 4.851 m³ → fc_350"""
        model = model_from_design(sample_design)
        qto = takeoff(model)
        assert qto.concrete_by_fc.fc_350 == pytest.approx(4.851, abs=0.01)

    def test_total_concrete_positive(self, sample_design):
        model = model_from_design(sample_design)
        qto = takeoff(model)
        assert qto.concrete_total_m3 > 0

    def test_rebar_total_positive(self, sample_design):
        model = model_from_design(sample_design)
        qto = takeoff(model)
        assert qto.rebar.total > 0
