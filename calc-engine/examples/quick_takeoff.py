"""
Example: Quick quantity takeoff and report generation.

Run from calc-engine/:
    python examples/quick_takeoff.py
"""

import sys
from pathlib import Path

# Windows console 預設 cp950 不支援 ³ 噸 坪 等字元
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add src to path for direct execution
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from struct_calc.quantity import (
    Column, Beam, Slab, ShearWall, DiaphragmWall,
    StructuralModel, takeoff,
)
from struct_calc.cost import estimate_cost, cost_per_floor_area, formwork_area
from struct_calc.scwb import check_scwb
from struct_calc.report import export_excel, export_json, export_pdf


def main():
    # Build a sample structural model (would normally come from Phase 1 frontend)
    # 6-bay × 5-bay grid, 8m × 7m
    columns = []
    for floor in range(-3, 23):
        if floor == 0:
            continue
        for i in range(7):
            for j in range(6):
                # Skip service core columns
                if 2 <= i <= 3 and 2 <= j <= 3:
                    continue
                # Determine size by floor
                if floor < 0 or floor <= 3:
                    width, depth, fc = 700, 700, 350
                elif floor <= 13:
                    width, depth, fc = 650, 650, 280
                else:
                    width, depth, fc = 550, 550, 245

                columns.append(Column(
                    grid=f'{chr(65+i)}{j+1}',
                    floor=floor,
                    width=width, depth=depth,
                    height=3300, fc=fc,
                ))

    # Sample beams (X-direction)
    beams = []
    for floor in range(-3, 23):
        if floor == 0:
            continue
        for j in range(6):
            for i in range(6):
                beams.append(Beam(
                    direction='X', floor=floor,
                    span=8000, width=400, depth=650, fc=280,
                ))

    # Sample slabs
    slabs = []
    for floor in range(1, 23):
        slabs.append(Slab(
            floor=floor,
            area=48 * 35,  # 1680 m²
            struct_thickness=150,
            sound_layer=68 if floor >= 6 else 0,
            fc=280,
        ))

    model = StructuralModel(
        columns=columns,
        beams=beams,
        slabs=slabs,
        shear_walls=[],
        diaphragm_walls=[
            DiaphragmWall(perimeter=166000, depth=12000, thickness=800, fc=280)
        ],
    )

    # Run takeoff
    print("Running quantity takeoff...")
    qto = takeoff(model)

    print(f"\n{'='*50}")
    print("Concrete by fc' (m³):")
    print(f"{'='*50}")
    for fc, vol in qto.concrete_by_fc.to_dict().items():
        if fc != 'total':
            print(f"  {fc:>10s}: {vol:>10.1f}")
    print(f"  {'total':>10s}: {qto.concrete_by_fc.total:>10.1f}")

    print(f"\n{'='*50}")
    print("Rebar tonnage:")
    print(f"{'='*50}")
    for member, tons in qto.rebar.to_dict().items():
        print(f"  {member:>15s}: {tons:>8.1f} 噸")
    print(f"\nRebar density: {qto.rebar_density_kg_m3:.1f} kg/m³ concrete")
    print(f"  (Typical RC high-rise: 120-180 kg/m³)")

    # Estimate cost
    cost = estimate_cost(
        qto,
        diaphragm_wall_volume_m3=qto.concrete_by_member['diaphragm_walls'].total,
        formwork_area_m2=formwork_area(model),
    )

    print(f"\n{'='*50}")
    print("Cost breakdown (NTD):")
    print(f"{'='*50}")
    for k, v in cost.to_dict().items():
        if k != 'concrete_by_fc':
            print(f"  {k:>20s}: {v:>15,.0f}")

    floor_area = 1680 * 22  # podium+tower estimate
    per = cost_per_floor_area(cost, floor_area)
    print(f"\nUnit cost: NT${per['per_m2']:,.0f}/m² (NT${per['per_ping']:,.0f}/坪)")

    # Export reports
    out_dir = Path('output')
    out_dir.mkdir(exist_ok=True)

    project_info = {
        'project_name': 'Sample 22F Mixed-Use Building',
        'location': '臺北市',
        'total_floors': 22,
        'total_height_m': 87.4,
        'total_floor_area_m2': floor_area,
        'structure_system': 'RC',
        'design_wind_speed': 42.5,
        'SDS': 0.66,
        'SD1': 0.385,
        'importance_factor': 1.0,
    }

    family_inventory = {
        '柱': [{'type': 'RC-C-700×700-fc350', 'count': 144, 'note': 'B3F~3F'}],
        '梁': [{'type': 'RC-MB-400×650', 'count': 1320, 'note': 'X-dir 8m'}],
        '樓板': [{'type': 'RC-Slab-150-SI68', 'count': 17, 'note': '住宅含§46-6'}],
    }

    # 強柱弱梁檢核
    scwb = check_scwb(model)
    print(f"\n{'='*50}")
    print("強柱弱梁檢核:")
    print(f"{'='*50}")
    print(f"  接頭 {scwb.total}｜通過 {scwb.passing}｜"
          f"未通過 {scwb.failing}｜通過率 {scwb.pass_rate*100:.1f}%")

    try:
        excel_path = export_excel(qto, cost, project_info, family_inventory,
                                  out_dir / 'design_report.xlsx', scwb_summary=scwb)
        print(f"\n✓ Excel saved: {excel_path}")
    except ImportError as e:
        print(f"\n⚠ Skipping Excel: {e}")

    try:
        pdf_path = export_pdf(qto, cost, project_info,
                              out_dir / 'design_report.pdf', scwb_summary=scwb)
        print(f"✓ PDF saved: {pdf_path}")
    except ImportError as e:
        print(f"⚠ Skipping PDF: {e}")

    # 注意：這是「計算結果摘要」，不是 schema 1.0 的設計輸入 design.json
    json_path = export_json(qto, cost, project_info, out_dir / 'takeoff_summary.json')
    print(f"✓ JSON saved: {json_path}")


if __name__ == '__main__':
    main()
