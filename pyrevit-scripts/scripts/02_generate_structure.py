"""
02_generate_structure.py
========================
讀取前端工具匯出的 design.json，在 Revit 中自動建立：
1. 軸網（Grids）
2. 樓層（Levels）
3. 結構柱 Family Type 並放置
4. 結構梁
5. 樓板
6. 剪力牆與連續壁

輸入：
    output/design.json (從前端工具匯出)

執行：
    在 pyRevit 環境中執行
"""

import json
import os
from datetime import datetime

try:
    from pyrevit import revit, DB, forms, script
except ImportError:
    print("❌ Must run inside pyRevit environment")
    raise SystemExit


# ═══════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════

MM_TO_FT = 1.0 / 304.8


def mm_to_ft(mm):
    """Convert millimeters to Revit's internal unit (feet)."""
    return mm * MM_TO_FT


def load_design(path='output/design.json'):
    """Load design specification from JSON."""
    if not os.path.exists(path):
        forms.alert('找不到 design.json，請先從前端工具匯出', exitscript=True)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


# ═══════════════════════════════════════════════════════
# GRIDS
# ═══════════════════════════════════════════════════════

def create_grids(doc, grids_data):
    """Create X and Y grids."""
    # TODO: implement based on design.json schema
    # Example:
    #   for x_mm in grids_data['X']:
    #       line = DB.Line.CreateBound(...)
    #       grid = DB.Grid.Create(doc, line)
    pass


# ═══════════════════════════════════════════════════════
# LEVELS
# ═══════════════════════════════════════════════════════

def create_levels(doc, levels_data):
    """Create levels from list of {name, elevation_mm}."""
    created = 0
    for lvl_def in levels_data:
        elevation = mm_to_ft(lvl_def['elevation_mm'])
        new_level = DB.Level.Create(doc, elevation)
        new_level.Name = lvl_def['name']
        created += 1
    return created


# ═══════════════════════════════════════════════════════
# COLUMN FAMILY TYPES
# ═══════════════════════════════════════════════════════

def create_column_types(doc, column_specs):
    """
    Create column types based on Family/Type names.

    Expected format:
        [
          {"family": "RC-C-700×700-fc350", "width": 700, "depth": 700, "fc": 350},
          ...
        ]

    Process:
    1. Find a base RC column family in project (or load from library)
    2. Duplicate with new dimensions for each spec
    """
    # TODO: implement
    # base_family = find_or_load_family(doc, 'M_Concrete-Rectangular Column')
    # for spec in column_specs:
    #     new_type = base_family.Duplicate(spec['family'])
    #     # set parameters: b = width_mm, h = depth_mm
    pass


# ═══════════════════════════════════════════════════════
# PLACE COLUMNS
# ═══════════════════════════════════════════════════════

def place_columns(doc, columns_data, levels_dict):
    """Place column instances at grid intersections."""
    # TODO: implement
    pass


# ═══════════════════════════════════════════════════════
# MAIN ENTRY
# ═══════════════════════════════════════════════════════

def main():
    doc = revit.doc

    design = load_design()
    print('已載入設計檔')
    print('專案: {0}'.format(design.get('project', {}).get('project_name', 'Unknown')))

    # Confirm with user before making changes
    if not forms.alert('將開始在 Revit 中建立構件，請確認已備份檔案。是否繼續？',
                       options=['繼續', '取消']):
        return

    # Use single transaction for atomicity
    with revit.Transaction('生成結構模型'):
        # Step 1: Levels
        if 'levels' in design:
            count = create_levels(doc, design['levels'])
            print('建立樓層: {0}'.format(count))

        # Step 2: Grids
        if 'grids' in design:
            create_grids(doc, design['grids'])
            print('建立軸網')

        # Step 3: Column types
        if 'columns' in design:
            create_column_types(doc, design.get('column_types', []))
            print('建立柱類型')

        # Step 4: Place columns
        if 'columns' in design:
            place_columns(doc, design['columns'], {})
            print('放置柱')

        # TODO: beams, slabs, walls

    forms.alert('結構模型生成完成！請檢查 Revit 模型', title='完成')


if __name__ == '__main__':
    main()
