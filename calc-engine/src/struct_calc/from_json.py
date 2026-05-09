"""
Load design.json (schema 1.0) → StructuralModel.

See docs/design-schema.md for the spec.
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Union

from .quantity import Column, Beam, Slab, ShearWall, DiaphragmWall, StructuralModel


SUPPORTED_MAJOR = 1


class SchemaVersionError(ValueError):
    """Raised when design.json schema major version is incompatible."""


def _check_version(version_str: str) -> None:
    try:
        major = int(str(version_str).split('.')[0])
    except (ValueError, AttributeError):
        raise SchemaVersionError(f"Invalid schema_version: {version_str!r}")
    if major != SUPPORTED_MAJOR:
        raise SchemaVersionError(
            f"Unsupported schema major version: {version_str} "
            f"(this calc-engine handles {SUPPORTED_MAJOR}.x)"
        )


def load_design(path: Union[str, Path]) -> dict:
    """Load and validate design.json. Returns the raw dict.

    Raises SchemaVersionError if the schema_version is missing or
    its major version is not supported.
    """
    p = Path(path)
    with p.open(encoding='utf-8') as f:
        data = json.load(f)
    if 'schema_version' not in data:
        raise SchemaVersionError("Missing schema_version field")
    _check_version(data['schema_version'])
    return data


def model_from_design(design: dict) -> StructuralModel:
    """Convert a design.json dict into a StructuralModel."""
    structure = design.get('structure', {})

    columns = [
        Column(
            grid=c['grid'],
            floor=c['floor'],
            width=c['width_mm'],
            depth=c['depth_mm'],
            height=c['height_mm'],
            fc=c['fc'],
        )
        for c in structure.get('columns', [])
    ]

    beams = [
        Beam(
            direction=b['dir'],
            floor=b['floor'],
            span=b['span_mm'],
            width=b['B_mm'],
            depth=b['D_mm'],
            fc=b.get('fc', 280),
            is_main=True,
        )
        for b in structure.get('beams', [])
    ]

    slabs = [
        Slab(
            floor=s['floor'],
            area=s['area_m2'],
            struct_thickness=s['struct_thickness_mm'],
            sound_layer=s.get('sound_layer_mm', 0),
            fc=s.get('fc', 280),
        )
        for s in structure.get('slabs', [])
    ]

    shear_walls = [
        ShearWall(
            length=w['length_mm'],
            height=w['height_mm'],
            thickness=w['thickness_mm'],
            fc=w.get('fc', 280),
        )
        for w in structure.get('shear_walls', [])
    ]

    dwall_dict = structure.get('diaphragm_wall')
    diaphragm_walls = []
    if dwall_dict:
        diaphragm_walls.append(DiaphragmWall(
            perimeter=dwall_dict['perimeter_mm'],
            depth=dwall_dict['depth_mm'],
            thickness=dwall_dict['thickness_mm'],
            fc=dwall_dict.get('fc', 280),
        ))

    return StructuralModel(
        columns=columns,
        beams=beams,
        slabs=slabs,
        shear_walls=shear_walls,
        diaphragm_walls=diaphragm_walls,
    )


def project_info_from_design(design: dict) -> dict:
    """Extract project info in the format report.export_excel() expects."""
    p = design.get('project', {})
    dp = design.get('design_params', {})
    g = design.get('geometry', {})

    # Floor-area sum (from slabs) and total height (from highest level)
    slabs = design.get('structure', {}).get('slabs', [])
    total_area = sum(s.get('area_m2', 0) for s in slabs)

    levels = g.get('levels', [])
    max_top = 0.0
    if levels:
        max_top = max(
            (lvl.get('elevation_mm', 0) + lvl.get('height_mm', 0))
            for lvl in levels
        )

    return {
        'project_name': p.get('name', 'Untitled'),
        'location': p.get('location', ''),
        'structure_system': p.get('structure_system', 'RC'),
        'total_floors': g.get('total_floors_above', 0),
        'total_floors_below': g.get('total_floors_below', 0),
        'total_height_m': round(max_top / 1000, 2),
        'total_floor_area_m2': round(total_area, 1),
        'design_wind_speed': dp.get('wind_v_ms', 0),
        'wind_zone': dp.get('wind_zone', ''),
        'SDS': dp.get('SDS', 0),
        'SD1': dp.get('SD1', 0),
        'importance_factor': dp.get('importance', 1.0),
        'site_class': dp.get('site_class', 2),
        'seismic_level': dp.get('seismic_level', '中等'),
    }


def family_inventory_from_design(design: dict) -> dict:
    """Reshape family_inventory for report.export_excel()."""
    fi = design.get('family_inventory', {})
    out: dict = {}
    if fi.get('columns'):
        out['柱'] = [
            {'type': c['type'], 'count': c['count'],
             'note': f"{c.get('width_mm','')}×{c.get('depth_mm','')} fc{c.get('fc','')}"}
            for c in fi['columns']
        ]
    if fi.get('beams'):
        out['梁'] = [
            {'type': b['type'], 'count': b['count'],
             'note': f"{b.get('B_mm','')}×{b.get('D_mm','')}"}
            for b in fi['beams']
        ]
    if fi.get('slabs'):
        out['樓板'] = [
            {'type': s['type'], 'count': s['count'],
             'note': f"t={s.get('struct_thickness_mm','')}, SI={s.get('sound_layer_mm', 0)}"}
            for s in fi['slabs']
        ]
    if fi.get('walls'):
        out['牆'] = [
            {'type': w['type'], 'count': w['count'],
             'note': w.get('role', '')}
            for w in fi['walls']
        ]
    return out
