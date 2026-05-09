"""
01_read_project.py
==================
讀取目前 Revit 專案的設定，輸出為 project_info.json

可用於：
1. 將既有 Revit 專案的樓層、軸網匯出，作為前端工具的初始資料
2. 比對前端工具規劃 vs 實際 Revit 模型

執行：
    在 pyRevit 環境中執行此檔案
    或：python 01_read_project.py (需 pyrevit 環境)

輸出：
    output/project_info.json
"""

import json
import os
from datetime import datetime

try:
    from pyrevit import revit, DB
except ImportError:
    print("❌ Must run inside pyRevit environment")
    raise SystemExit


def main():
    doc = revit.doc

    # Project metadata
    proj_info = doc.ProjectInformation
    info = {
        'extracted_at': datetime.now().isoformat(),
        'project_name': proj_info.Name,
        'building_name': proj_info.BuildingName,
        'project_number': proj_info.Number,
        'project_address': proj_info.Address,
        'organization_name': proj_info.OrganizationName,
    }

    # Levels
    levels = []
    level_collector = DB.FilteredElementCollector(doc).OfClass(DB.Level)
    for lvl in level_collector:
        levels.append({
            'name': lvl.Name,
            'elevation_mm': lvl.Elevation * 304.8,  # ft to mm
        })
    levels.sort(key=lambda x: x['elevation_mm'])
    info['levels'] = levels

    # Grids
    grids_x = []
    grids_y = []
    grid_collector = DB.FilteredElementCollector(doc).OfClass(DB.Grid)
    for g in grid_collector:
        curve = g.Curve
        if isinstance(curve, DB.Line):
            direction = curve.Direction
            mid = curve.Evaluate(0.5, True)
            mid_mm = (mid.X * 304.8, mid.Y * 304.8)
            grid_data = {
                'name': g.Name,
                'mid_x_mm': mid_mm[0],
                'mid_y_mm': mid_mm[1],
            }
            # Determine direction (horizontal vs vertical)
            if abs(direction.X) > abs(direction.Y):
                grids_y.append(grid_data)  # runs along X = Y-axis grid
            else:
                grids_x.append(grid_data)
    info['grids'] = {
        'X': sorted(grids_x, key=lambda g: g['mid_x_mm']),
        'Y': sorted(grids_y, key=lambda g: g['mid_y_mm']),
    }

    # Existing structural columns (count by type)
    columns = DB.FilteredElementCollector(doc) \
        .OfCategory(DB.BuiltInCategory.OST_StructuralColumns) \
        .WhereElementIsNotElementType()
    column_types = {}
    for col in columns:
        type_name = doc.GetElement(col.GetTypeId()).Name
        column_types[type_name] = column_types.get(type_name, 0) + 1
    info['existing_columns'] = column_types

    # Save
    out_dir = 'output'
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)
    out_path = os.path.join(out_dir, 'project_info.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(info, f, ensure_ascii=False, indent=2)

    print('=' * 60)
    print('專案資訊已匯出: {0}'.format(out_path))
    print('=' * 60)
    print('專案名稱: {0}'.format(info['project_name']))
    print('樓層數: {0}'.format(len(levels)))
    print('X軸網: {0}'.format(len(grids_x)))
    print('Y軸網: {0}'.format(len(grids_y)))
    print('現有柱: {0} 種類型'.format(len(column_types)))


if __name__ == '__main__':
    main()
