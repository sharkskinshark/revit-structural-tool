"""
Fire Rating

Per 建築技術規則建築設計施工編 §70

Counted from top floor down (including basement floors).
"""

from __future__ import annotations
from typing import Literal


ElementType = Literal['column', 'beam', 'slab', 'wall', 'shearwall', 'roof', 'dwall']


def floors_from_top(floor: int, total_above: int) -> int:
    """
    Convert floor number to "from top" position.
    floor: positive=above, negative=basement, 0=GL
    """
    if floor > 0:
        return total_above - floor + 1
    elif floor < 0:
        return total_above + abs(floor)
    return 0


def get_fire_rating(
    floor: int,
    total_above: int,
    element: ElementType,
) -> float:
    """
    Get fire rating in hours per §70.

    Returns:
        hours: 0.5, 1, 2, or 3
    """
    # Diaphragm wall: 3hr (basement main structure)
    if element == 'dwall':
        return 3

    # Roof: 0.5hr
    if element == 'roof':
        return 0.5

    from_top = floors_from_top(floor, total_above)

    if element in ('column', 'beam'):
        if from_top <= 4:
            return 1
        if from_top <= 14:
            return 2
        return 3

    if element == 'slab':
        if from_top <= 4:
            return 1
        return 2  # 5+ all the same

    if element in ('wall', 'shearwall'):
        if from_top <= 14:
            return 1
        return 2

    return 1
