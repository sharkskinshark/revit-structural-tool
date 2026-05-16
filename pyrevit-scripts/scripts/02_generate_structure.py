# -*- coding: utf-8 -*-
"""
02_generate_structure.py
========================
讀取前端工具匯出的 design.json (schema 1.0)，在 Revit 中自動建立：
  1. 樓層 Levels
  2. 軸網 Grids（X 軸用字母 A/B/C…，Y 軸用數字 1/2/3…）
  3. 結構柱 Family Type（duplicate 一個 base 矩形 RC 柱 family）
  4. 結構柱實例（在格點交點逐樓層放置）

梁 / 樓板 / 牆 為 sketch-based 建立，較複雜，列為後續 TODO。

輸入：
    output/design.json   （schema 1.0，見 docs/design-schema.md）

執行：
    在 pyRevit 環境中執行（pyRevit ribbon 或 console）

前置需求：
    專案中需已載入「至少一個矩形結構柱 family」作為 base，
    例如 M_Concrete-Rectangular Column。腳本會 duplicate 它並改 b/h 參數。

注意：
    - Revit 內部單位為英尺，腳本內已處理 mm↔ft 轉換
    - 所有變更包在單一 Transaction，失敗自動 rollback
    - 執行前請先備份 .rvt 檔
"""

import json
import os

try:
    from pyrevit import revit, DB, forms
except ImportError:
    print("Must run inside pyRevit environment")
    raise SystemExit


# ═══════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════

MM_TO_FT = 1.0 / 304.8
SCHEMA_MAJOR = 1


def mm_to_ft(mm):
    """Convert millimeters to Revit's internal unit (feet)."""
    return mm * MM_TO_FT


def load_design(path='output/design.json'):
    """Load design.json and verify the schema major version."""
    if not os.path.exists(path):
        forms.alert('找不到 design.json，請先從前端工具點「匯出」產生，'
                    '並放到 {0}'.format(path), exitscript=True)
    with open(path, 'r') as f:
        data = json.load(f)

    version = data.get('schema_version', '')
    try:
        major = int(str(version).split('.')[0])
    except (ValueError, AttributeError):
        major = 0
    if major != SCHEMA_MAJOR:
        forms.alert('design.json schema 版本不符：{0}\n'
                    '本腳本支援 {1}.x'.format(version, SCHEMA_MAJOR),
                    exitscript=True)
    return data


def validate_design(design):
    """Check required fields exist before touching Revit. Returns list of problems."""
    problems = []
    geom = design.get('geometry', {})
    if not geom:
        problems.append('缺少 geometry 區塊')
    else:
        for key in ('grid_x_mm', 'grid_y_mm', 'max_bx', 'max_by'):
            if key not in geom:
                problems.append('geometry 缺少 {0}'.format(key))
        if not geom.get('levels'):
            problems.append('geometry.levels 為空')
    structure = design.get('structure', {})
    if not structure.get('columns'):
        problems.append('structure.columns 為空（沒有柱可放置）')
    if not design.get('family_inventory', {}).get('columns'):
        problems.append('family_inventory.columns 為空（無法建立柱類型）')
    return problems


# ═══════════════════════════════════════════════════════
# LEVELS
# ═══════════════════════════════════════════════════════

def create_levels(doc, geometry):
    """Create levels from geometry.levels [{name, elevation_mm, height_mm, floor}].

    Existing levels with the same name are reused (not duplicated).
    Returns (created_count, level_map) where level_map maps name -> Level element.
    """
    existing = {}
    for lvl in DB.FilteredElementCollector(doc).OfClass(DB.Level):
        existing[lvl.Name] = lvl

    level_map = {}
    created = 0
    for lvl_def in geometry.get('levels', []):
        name = lvl_def['name']
        if name in existing:
            level_map[name] = existing[name]
            continue
        elevation = mm_to_ft(lvl_def['elevation_mm'])
        new_level = DB.Level.Create(doc, elevation)
        try:
            new_level.Name = name
        except Exception:
            pass  # name clash — keep Revit's auto name
        level_map[name] = new_level
        existing[name] = new_level
        created += 1
    return created, level_map


# ═══════════════════════════════════════════════════════
# GRIDS
# ═══════════════════════════════════════════════════════

def create_grids(doc, geometry):
    """Create X and Y grids from grid spacing + bay counts.

    X-axis grids (vertical lines, varying X) → lettered A, B, C…
    Y-axis grids (horizontal lines, varying Y) → numbered 1, 2, 3…
    This matches the column grid label convention "A1" = letter(i) + number(j+1).
    """
    gx = mm_to_ft(geometry['grid_x_mm'])
    gy = mm_to_ft(geometry['grid_y_mm'])
    nx = int(geometry['max_bx'])
    ny = int(geometry['max_by'])
    pad = mm_to_ft(2000)  # extend grid lines slightly beyond the building

    x_lo, x_hi = -pad, gx * nx + pad
    y_lo, y_hi = -pad, gy * ny + pad
    created = 0

    # X-axis grids: vertical lines at x = i*gx, labelled A, B, C…
    for i in range(nx + 1):
        x = i * gx
        line = DB.Line.CreateBound(DB.XYZ(x, y_lo, 0), DB.XYZ(x, y_hi, 0))
        grid = DB.Grid.Create(doc, line)
        try:
            grid.Name = chr(65 + i) if i < 26 else 'X{0}'.format(i)
        except Exception:
            pass  # name clash — keep auto name
        created += 1

    # Y-axis grids: horizontal lines at y = j*gy, labelled 1, 2, 3…
    for j in range(ny + 1):
        y = j * gy
        line = DB.Line.CreateBound(DB.XYZ(x_lo, y, 0), DB.XYZ(x_hi, y, 0))
        grid = DB.Grid.Create(doc, line)
        try:
            grid.Name = str(j + 1)
        except Exception:
            pass
        created += 1

    return created


# ═══════════════════════════════════════════════════════
# COLUMN FAMILY TYPES
# ═══════════════════════════════════════════════════════

def find_base_column_symbol(doc):
    """Find a structural-column FamilySymbol to use as the duplication base.

    Prefers a name containing 'Concrete' / '混凝土' / 'Rectangular'; otherwise
    returns the first structural column type found.
    """
    symbols = list(
        DB.FilteredElementCollector(doc)
        .OfCategory(DB.BuiltInCategory.OST_StructuralColumns)
        .WhereElementIsElementType()
    )
    if not symbols:
        return None

    preferred = ('concrete', '混凝土', 'rectangular', '矩形')
    for sym in symbols:
        try:
            name = DB.Element.Name.GetValue(sym).lower()
        except Exception:
            name = ''
        if any(p in name for p in preferred):
            return sym
    return symbols[0]


def _set_section_param(symbol, names, value_ft):
    """Try a list of candidate parameter names; set the first writable match."""
    for pname in names:
        p = symbol.LookupParameter(pname)
        if p is not None and not p.IsReadOnly:
            try:
                p.Set(value_ft)
                return True
            except Exception:
                continue
    return False


def create_column_types(doc, family_inventory):
    """Duplicate the base column family once per unique type in family_inventory.

    Type names follow the schema, e.g. 'RC-C-700×700-fc350'.
    Section dimensions are set via the 'b' / 'h' parameters (common in the
    metric rectangular concrete column family). Returns name -> FamilySymbol.
    """
    base = find_base_column_symbol(doc)
    if base is None:
        forms.alert('專案中找不到任何結構柱 family。\n'
                    '請先載入一個矩形 RC 柱 family（例如 '
                    'M_Concrete-Rectangular Column）再執行。',
                    exitscript=True)

    # Index existing symbols so we don't create duplicates
    existing = {}
    for sym in (DB.FilteredElementCollector(doc)
                .OfCategory(DB.BuiltInCategory.OST_StructuralColumns)
                .WhereElementIsElementType()):
        try:
            existing[DB.Element.Name.GetValue(sym)] = sym
        except Exception:
            pass

    type_map = {}
    created = 0
    for col_type in family_inventory.get('columns', []):
        tname = col_type['type']
        if tname in existing:
            type_map[tname] = existing[tname]
            continue

        new_sym = base.Duplicate(tname)
        w_ft = mm_to_ft(col_type['width_mm'])
        d_ft = mm_to_ft(col_type['depth_mm'])
        # Parameter names vary by family/locale — try the common ones
        _set_section_param(new_sym, ['b', 'Width', '寬度', 'b（寬度）'], w_ft)
        _set_section_param(new_sym, ['h', 'Depth', 'Height', '深度', 'h（深度）'], d_ft)

        # Record fc' as a type comment (full material wiring is out of scope)
        try:
            tc = new_sym.get_Parameter(DB.BuiltInParameter.ALL_MODEL_TYPE_COMMENTS)
            if tc is not None and not tc.IsReadOnly:
                tc.Set("fc'={0} kgf/cm2".format(col_type.get('fc', '')))
        except Exception:
            pass

        type_map[tname] = new_sym
        existing[tname] = new_sym
        created += 1

    return created, type_map


# ═══════════════════════════════════════════════════════
# PLACE COLUMNS
# ═══════════════════════════════════════════════════════

def place_columns(doc, design, level_map, type_map):
    """Place one structural column instance per (grid point, floor) entry.

    Each column entry in schema 1.0 is a per-floor segment. We place a
    Revit column at grid point (i, j) with base = that floor's level and
    top = the next floor's level (skipping floor 0).

    Returns (placed, skipped).
    """
    geometry = design['geometry']
    gx = mm_to_ft(geometry['grid_x_mm'])
    gy = mm_to_ft(geometry['grid_y_mm'])

    # floor number -> level name
    name_by_floor = {}
    for lvl_def in geometry.get('levels', []):
        if 'floor' in lvl_def:
            name_by_floor[lvl_def['floor']] = lvl_def['name']

    def next_floor(f):
        """f+1, skipping 0 (B1F → 1F directly)."""
        return f + 2 if f == -1 else f + 1

    columns = design.get('structure', {}).get('columns', [])
    placed = 0
    skipped = 0

    for col in columns:
        if col.get('in_core'):
            continue  # core columns are replaced by shear walls

        symbol = type_map.get(col.get('family_type'))
        if symbol is None:
            skipped += 1
            continue
        if not symbol.IsActive:
            symbol.Activate()

        floor = col['floor']
        base_name = name_by_floor.get(floor)
        base_level = level_map.get(base_name) if base_name else None
        if base_level is None:
            skipped += 1
            continue

        x = col['i'] * gx
        y = col['j'] * gy
        pt = DB.XYZ(x, y, base_level.Elevation)

        try:
            inst = doc.Create.NewFamilyInstance(
                pt, symbol, base_level, DB.Structure.StructuralType.Column)
        except Exception:
            skipped += 1
            continue

        # Set top level to the next floor's level if it exists
        top_name = name_by_floor.get(next_floor(floor))
        top_level = level_map.get(top_name) if top_name else None
        if top_level is not None:
            try:
                tp = inst.get_Parameter(DB.BuiltInParameter.FAMILY_TOP_LEVEL_PARAM)
                if tp is not None and not tp.IsReadOnly:
                    tp.Set(top_level.Id)
            except Exception:
                pass

        placed += 1

    return placed, skipped


# ═══════════════════════════════════════════════════════
# MAIN ENTRY
# ═══════════════════════════════════════════════════════

def main():
    doc = revit.doc

    design = load_design()
    project = design.get('project', {})
    print('已載入 design.json (schema {0})'.format(design.get('schema_version')))
    print('專案: {0}'.format(project.get('name', 'Unknown')))

    problems = validate_design(design)
    if problems:
        forms.alert('design.json 驗證未通過：\n- ' + '\n- '.join(problems),
                    exitscript=True)

    geometry = design['geometry']
    family_inventory = design.get('family_inventory', {})
    n_levels = len(geometry.get('levels', []))
    n_cols = len(design.get('structure', {}).get('columns', []))
    n_col_types = len(family_inventory.get('columns', []))

    if not forms.alert(
            '將在 Revit 中建立：\n'
            '  樓層 {0} 個\n'
            '  軸網 {1}×{2}\n'
            '  柱類型 {3} 種\n'
            '  柱實例 約 {4} 支\n\n'
            '請確認已備份 .rvt 檔。是否繼續？'.format(
                n_levels, geometry['max_bx'] + 1, geometry['max_by'] + 1,
                n_col_types, n_cols),
            options=['繼續', '取消']) == '繼續':
        return

    summary = {}
    with revit.Transaction('生成結構模型 (Levels/Grids/Columns)'):
        # 1. Levels
        n_created, level_map = create_levels(doc, geometry)
        summary['levels'] = '{0} 新建 / {1} 共用'.format(n_created, n_levels - n_created)

        # 2. Grids
        summary['grids'] = '{0} 條'.format(create_grids(doc, geometry))

        # Regenerate so new levels/grids are usable for placement
        doc.Regenerate()

        # 3. Column types
        n_types, type_map = create_column_types(doc, family_inventory)
        summary['column_types'] = '{0} 新建 / {1} 共用'.format(
            n_types, n_col_types - n_types)

        doc.Regenerate()

        # 4. Place columns
        placed, skipped = place_columns(doc, design, level_map, type_map)
        summary['columns'] = '{0} 放置 / {1} 略過'.format(placed, skipped)

        # TODO: beams / slabs / shear walls / diaphragm wall
        #       (sketch-based geometry — separate iteration)

    msg = '結構模型生成完成！\n\n'
    for k in ('levels', 'grids', 'column_types', 'columns'):
        msg += '  {0}: {1}\n'.format(k, summary.get(k, '-'))
    msg += '\n梁 / 樓板 / 牆 尚未實作，請手動或待後續腳本。'
    forms.alert(msg, title='完成')
    print(msg)


if __name__ == '__main__':
    main()
