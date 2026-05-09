"""
Report Generator

Outputs structural design reports in Excel/PDF/JSON format.

Excel layout (6 sheets):
    Sheet 1: 設計總覽 - Project overview, design parameters
    Sheet 2: 混凝土用量 - Concrete by fc' and member type
    Sheet 3: 鋼筋用量 - Rebar tonnage and density check
    Sheet 4: 構件清單 - Revit Family/Type list
    Sheet 5: 造價估算 - Cost breakdown
    Sheet 6: 與Revit比對 - (optional) Comparison with actual Revit model
"""

from __future__ import annotations
import json
from pathlib import Path
from dataclasses import asdict
from typing import Any

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

from .quantity import QuantityTakeoff, StructuralModel
from .cost import CostBreakdown


# ═══════════════════════════════════════════════════════
# JSON EXPORT (always available)
# ═══════════════════════════════════════════════════════

def export_json(
    takeoff: QuantityTakeoff,
    cost: CostBreakdown,
    project_info: dict,
    output_path: Path,
) -> Path:
    """
    Export complete design data to JSON for pyRevit consumption.
    """
    data = {
        'project': project_info,
        'quantity': takeoff.to_dict(),
        'cost': cost.to_dict(),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return output_path


# ═══════════════════════════════════════════════════════
# EXCEL EXPORT
# ═══════════════════════════════════════════════════════

# Styles
HEADER_FONT = Font(name='Microsoft JhengHei', size=11, bold=True, color='FFFFFF') if HAS_OPENPYXL else None
HEADER_FILL = PatternFill('solid', fgColor='4472C4') if HAS_OPENPYXL else None
TITLE_FONT = Font(name='Microsoft JhengHei', size=14, bold=True) if HAS_OPENPYXL else None
NUMBER_FORMAT = '#,##0.0'
CURRENCY_FORMAT = '#,##0_);(#,##0)'


def _style_header(ws, row: int, n_cols: int):
    """Apply header style to a row."""
    if not HAS_OPENPYXL:
        return
    for col in range(1, n_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal='center')


def export_excel(
    takeoff: QuantityTakeoff,
    cost: CostBreakdown,
    project_info: dict,
    family_inventory: dict,
    output_path: Path,
) -> Path:
    """
    Export complete report to multi-sheet Excel.
    """
    if not HAS_OPENPYXL:
        raise ImportError("openpyxl is required for Excel export. Install: pip install openpyxl")

    wb = openpyxl.Workbook()

    # Remove default sheet
    wb.remove(wb.active)

    _build_overview_sheet(wb, project_info)
    _build_concrete_sheet(wb, takeoff)
    _build_rebar_sheet(wb, takeoff)
    _build_family_sheet(wb, family_inventory)
    _build_cost_sheet(wb, cost, project_info.get('total_floor_area_m2', 0))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(output_path)
    return output_path


def _build_overview_sheet(wb, info: dict):
    """Sheet 1: Design Overview."""
    ws = wb.create_sheet('1_設計總覽')

    ws['A1'] = '結構設計總覽'
    ws['A1'].font = TITLE_FONT
    ws.merge_cells('A1:D1')

    rows = [
        ('專案名稱', info.get('project_name', '')),
        ('工址位置', info.get('location', '')),
        ('總樓層', info.get('total_floors', '')),
        ('總高度 (m)', info.get('total_height_m', '')),
        ('總樓地板面積 (m²)', info.get('total_floor_area_m2', '')),
        ('結構系統', info.get('structure_system', 'RC')),
        ('設計風速 (m/s)', info.get('design_wind_speed', '')),
        ('SDS', info.get('SDS', '')),
        ('SD1', info.get('SD1', '')),
        ('用途係數 I', info.get('importance_factor', 1.0)),
    ]

    for i, (label, value) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=label).font = Font(bold=True)
        ws.cell(row=i, column=2, value=value)

    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 30


def _build_concrete_sheet(wb, takeoff: QuantityTakeoff):
    """Sheet 2: Concrete Volumes."""
    ws = wb.create_sheet('2_混凝土用量')

    ws['A1'] = '混凝土用量分析 (m³)'
    ws['A1'].font = TITLE_FONT

    headers = ['構件類型', "fc'=210", "fc'=245", "fc'=280", "fc'=350", "fc'=420", '小計']
    for col, h in enumerate(headers, start=1):
        ws.cell(row=3, column=col, value=h)
    _style_header(ws, 3, len(headers))

    member_labels = {
        'columns':         '柱',
        'beams':           '梁',
        'slabs':           '樓板',
        'shear_walls':     '剪力牆',
        'diaphragm_walls': '連續壁',
    }

    row = 4
    for key, label in member_labels.items():
        if key not in takeoff.concrete_by_member:
            continue
        cbf = takeoff.concrete_by_member[key]
        ws.cell(row=row, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row, column=2, value=cbf.fc_210).number_format = NUMBER_FORMAT
        ws.cell(row=row, column=3, value=cbf.fc_245).number_format = NUMBER_FORMAT
        ws.cell(row=row, column=4, value=cbf.fc_280).number_format = NUMBER_FORMAT
        ws.cell(row=row, column=5, value=cbf.fc_350).number_format = NUMBER_FORMAT
        ws.cell(row=row, column=6, value=cbf.fc_420).number_format = NUMBER_FORMAT
        ws.cell(row=row, column=7, value=cbf.total).number_format = NUMBER_FORMAT
        row += 1

    # Totals
    ws.cell(row=row, column=1, value='總計 m³').font = Font(bold=True)
    by_fc = takeoff.concrete_by_fc
    ws.cell(row=row, column=2, value=by_fc.fc_210).number_format = NUMBER_FORMAT
    ws.cell(row=row, column=3, value=by_fc.fc_245).number_format = NUMBER_FORMAT
    ws.cell(row=row, column=4, value=by_fc.fc_280).number_format = NUMBER_FORMAT
    ws.cell(row=row, column=5, value=by_fc.fc_350).number_format = NUMBER_FORMAT
    ws.cell(row=row, column=6, value=by_fc.fc_420).number_format = NUMBER_FORMAT
    ws.cell(row=row, column=7, value=by_fc.total).number_format = NUMBER_FORMAT
    for col in range(1, 8):
        ws.cell(row=row, column=col).fill = PatternFill('solid', fgColor='FFE699')

    for i, w in enumerate([15, 12, 12, 12, 12, 12, 14], start=1):
        ws.column_dimensions[chr(64 + i)].width = w


def _build_rebar_sheet(wb, takeoff: QuantityTakeoff):
    """Sheet 3: Rebar Tonnage."""
    ws = wb.create_sheet('3_鋼筋用量')

    ws['A1'] = '鋼筋用量分析 (噸)'
    ws['A1'].font = TITLE_FONT

    headers = ['構件類型', '配筋率假設', '混凝土量 m³', '鋼筋估算 噸']
    for col, h in enumerate(headers, start=1):
        ws.cell(row=3, column=col, value=h)
    _style_header(ws, 3, len(headers))

    rows = [
        ('柱',     '2.5%', takeoff.concrete_by_member['columns'].total, takeoff.rebar.columns),
        ('大梁',   '1.8%', takeoff.concrete_by_member['beams'].total, takeoff.rebar.main_beams),
        ('樓板',   '0.6%', takeoff.concrete_by_member['slabs'].total, takeoff.rebar.slabs),
        ('剪力牆', '0.8%', takeoff.concrete_by_member['shear_walls'].total, takeoff.rebar.shear_walls),
        ('連續壁', '1.2%', takeoff.concrete_by_member['diaphragm_walls'].total, takeoff.rebar.diaphragm_walls),
    ]

    for i, (label, ratio, vol, tons) in enumerate(rows, start=4):
        ws.cell(row=i, column=1, value=label).font = Font(bold=True)
        ws.cell(row=i, column=2, value=ratio)
        ws.cell(row=i, column=3, value=vol).number_format = NUMBER_FORMAT
        ws.cell(row=i, column=4, value=tons).number_format = NUMBER_FORMAT

    end_row = 4 + len(rows)
    ws.cell(row=end_row, column=1, value='總計').font = Font(bold=True)
    ws.cell(row=end_row, column=4, value=takeoff.rebar.total).number_format = NUMBER_FORMAT
    for col in range(1, 5):
        ws.cell(row=end_row, column=col).fill = PatternFill('solid', fgColor='FFE699')

    # Density check
    ws.cell(row=end_row + 2, column=1, value='平均鋼筋密度 (kg/m³ 混凝土)').font = Font(bold=True)
    ws.cell(row=end_row + 2, column=4, value=takeoff.rebar_density_kg_m3).number_format = NUMBER_FORMAT
    ws.cell(row=end_row + 3, column=1, value='典型RC高層: 120~180 kg/m³').font = Font(italic=True, color='666666')

    for i, w in enumerate([15, 14, 16, 16], start=1):
        ws.column_dimensions[chr(64 + i)].width = w


def _build_family_sheet(wb, families: dict):
    """Sheet 4: Revit Family/Type Inventory."""
    ws = wb.create_sheet('4_構件清單')

    ws['A1'] = 'Revit Family/Type 清單'
    ws['A1'].font = TITLE_FONT

    ws['A3'] = '提供 pyRevit 腳本建立 Family Type 用'
    ws['A3'].font = Font(italic=True, color='666666')

    headers = ['類別', 'Family/Type', '尺寸', '數量', '備註']
    for col, h in enumerate(headers, start=1):
        ws.cell(row=5, column=col, value=h)
    _style_header(ws, 5, len(headers))

    row = 6
    for category, items in families.items():
        for item in items:
            ws.cell(row=row, column=1, value=category)
            ws.cell(row=row, column=2, value=item.get('type', ''))
            ws.cell(row=row, column=3, value=item.get('size', ''))
            ws.cell(row=row, column=4, value=item.get('count', 0))
            ws.cell(row=row, column=5, value=item.get('note', ''))
            row += 1

    for i, w in enumerate([12, 30, 25, 10, 30], start=1):
        ws.column_dimensions[chr(64 + i)].width = w


def _build_cost_sheet(wb, cost: CostBreakdown, total_floor_area_m2: float):
    """Sheet 5: Cost Breakdown."""
    ws = wb.create_sheet('5_造價估算')

    ws['A1'] = '結構工程造價估算 (NTD)'
    ws['A1'].font = TITLE_FONT

    ws['A3'] = '※ 本造價為設計初期參考值，實際以工程預算書為準'
    ws['A3'].font = Font(italic=True, color='AA6644')

    headers = ['項目', '說明', '金額 (NTD)', '佔比']
    for col, h in enumerate(headers, start=1):
        ws.cell(row=5, column=col, value=h)
    _style_header(ws, 5, len(headers))

    items = [
        ('混凝土', '依fc\' 分區', cost.concrete_total),
        ('鋼筋', 'SD420W 含工料', cost.rebar),
        ('鋼骨', '含防火被覆', cost.steel),
        ('連續壁', '含設備施工', cost.diaphragm_wall),
        ('模板', '一般模板', cost.formwork),
    ]

    total = cost.grand_total
    row = 6
    for label, note, amount in items:
        if amount == 0:
            continue
        ws.cell(row=row, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row, column=2, value=note)
        ws.cell(row=row, column=3, value=amount).number_format = CURRENCY_FORMAT
        pct = amount / total if total > 0 else 0
        ws.cell(row=row, column=4, value=pct).number_format = '0.0%'
        row += 1

    ws.cell(row=row, column=1, value='合計').font = Font(bold=True, size=12)
    ws.cell(row=row, column=3, value=total).number_format = CURRENCY_FORMAT
    ws.cell(row=row, column=3).font = Font(bold=True, size=12)
    for col in range(1, 5):
        ws.cell(row=row, column=col).fill = PatternFill('solid', fgColor='FFD966')

    if total_floor_area_m2 > 0:
        per_m2 = total / total_floor_area_m2
        ws.cell(row=row + 2, column=1, value='單位造價 (NTD/m²)').font = Font(bold=True)
        ws.cell(row=row + 2, column=3, value=per_m2).number_format = CURRENCY_FORMAT
        ws.cell(row=row + 3, column=1, value='單位造價 (NTD/坪)').font = Font(bold=True)
        ws.cell(row=row + 3, column=3, value=per_m2 * 3.30578).number_format = CURRENCY_FORMAT

    for i, w in enumerate([15, 25, 18, 10], start=1):
        ws.column_dimensions[chr(64 + i)].width = w
