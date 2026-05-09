"""
Tests for fire rating calculations per §70.

Run: pytest tests/test_fire_rating.py -v
"""

import pytest
from struct_calc.fire_rating import (
    floors_from_top,
    get_fire_rating,
)


class TestFloorsFromTop:
    """Test 'floors from top' index calculation."""

    def test_top_floor_is_first(self):
        # 22F building, 22F is 1st from top
        assert floors_from_top(22, 22) == 1

    def test_basement_count(self):
        # 22F + B3F: top=22, B1F is 23rd from top
        assert floors_from_top(-1, 22) == 23
        assert floors_from_top(-3, 22) == 25


class TestColumnFireRating:
    """Per §70: column 1hr/2hr/3hr by floors-from-top zone."""

    def test_top_4_floors_1hr(self):
        # 22F building, 22F (1st from top) -> 1hr
        assert get_fire_rating(22, 22, 'column') == 1
        # 19F (4th from top) -> 1hr
        assert get_fire_rating(19, 22, 'column') == 1

    def test_5_to_14_2hr(self):
        # 18F (5th from top) -> 2hr
        assert get_fire_rating(18, 22, 'column') == 2
        # 9F (14th from top) -> 2hr
        assert get_fire_rating(9, 22, 'column') == 2

    def test_15plus_3hr(self):
        # 8F (15th from top) -> 3hr
        assert get_fire_rating(8, 22, 'column') == 3
        # 1F -> 3hr (22nd from top)
        assert get_fire_rating(1, 22, 'column') == 3
        # B3F -> 3hr (25th from top)
        assert get_fire_rating(-3, 22, 'column') == 3


class TestBeamFireRating:
    """Beam follows same zones as column."""

    def test_beam_top_floors(self):
        assert get_fire_rating(22, 22, 'beam') == 1

    def test_beam_basement(self):
        assert get_fire_rating(-3, 22, 'beam') == 3


class TestSlabFireRating:
    """Slab: 1hr/2hr/2hr (no 3hr zone)."""

    def test_slab_top_4_floors_1hr(self):
        assert get_fire_rating(22, 22, 'slab') == 1
        assert get_fire_rating(19, 22, 'slab') == 1

    def test_slab_5plus_always_2hr(self):
        # Critical: even for 15+ from top, slab is still 2hr (not 3hr like column/beam)
        assert get_fire_rating(8, 22, 'slab') == 2
        assert get_fire_rating(-3, 22, 'slab') == 2


class TestWallFireRating:
    """Wall: 1hr/1hr/2hr - different breakpoint at 14 (not 4)."""

    def test_wall_first_14_1hr(self):
        # 1-14 from top = 1hr
        assert get_fire_rating(22, 22, 'wall') == 1
        assert get_fire_rating(9, 22, 'wall') == 1

    def test_wall_15plus_2hr(self):
        assert get_fire_rating(8, 22, 'wall') == 2
        assert get_fire_rating(-3, 22, 'wall') == 2


class TestSpecialElements:
    def test_dwall_always_3hr(self):
        """Diaphragm wall: 3hr regardless of position."""
        assert get_fire_rating(-3, 22, 'dwall') == 3
        assert get_fire_rating(-1, 5, 'dwall') == 3

    def test_roof_always_half_hour(self):
        assert get_fire_rating(22, 22, 'roof') == 0.5
        assert get_fire_rating(5, 5, 'roof') == 0.5


class TestSmallBuildings:
    """Buildings with only 4 floors should all be 1hr."""

    def test_4_story_building_all_1hr(self):
        for f in [1, 2, 3, 4]:
            assert get_fire_rating(f, 4, 'column') == 1
            assert get_fire_rating(f, 4, 'beam') == 1
            assert get_fire_rating(f, 4, 'slab') == 1
            assert get_fire_rating(f, 4, 'wall') == 1

    def test_with_basement_low_rise(self):
        """4 above + 1 below = 5 total. From top: 1F=4, B1F=5."""
        # 1F is 4th from top -> still 1hr (column/beam)
        assert get_fire_rating(1, 4, 'column') == 1
        # B1F is 5th from top -> 2hr (column/beam)
        assert get_fire_rating(-1, 4, 'column') == 2
