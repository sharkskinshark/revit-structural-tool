"""
CLI: read a design.json (exported from frontend) and run the full pipeline.

Usage:
    python examples/from_design.py [path/to/design.json]

Defaults:
    input  = output/design.json
    output = output/design_report.xlsx + output/design_summary.json
"""

import sys
from pathlib import Path

# Windows console 預設 cp950 不支援 ³ 噸 坪 等字元
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Allow direct execution from calc-engine/
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from struct_calc.from_json import (
    load_design,
    model_from_design,
    project_info_from_design,
    family_inventory_from_design,
    SchemaVersionError,
)
from struct_calc.quantity import takeoff
from struct_calc.cost import estimate_cost, cost_per_floor_area, formwork_area
from struct_calc.scwb import check_scwb
from struct_calc.report import export_excel, export_json, export_pdf


def main(input_path: str = 'output/design.json') -> int:
    in_path = Path(input_path)
    if not in_path.exists():
        print(f"❌ 找不到檔案: {in_path}")
        print("   先在 frontend 介面點「📥 匯出」產生 design.json，"
              "或把它複製到 calc-engine/output/design.json")
        return 1

    print(f"▸ 讀取 {in_path}")
    try:
        design = load_design(in_path)
    except SchemaVersionError as e:
        print(f"❌ schema 版本錯誤: {e}")
        return 1

    print(f"  schema_version: {design.get('schema_version')}")
    print(f"  exported_at:    {design.get('exported_at')}")
    print(f"  exported_by:    {design.get('exported_by')}")

    proj = project_info_from_design(design)
    print(f"  專案: {proj['project_name']}（{proj['location']}）"
          f" {proj['structure_system']}")
    print(f"  地上 {proj['total_floors']} 層 + 地下 {proj['total_floors_below']} 層 "
          f"／樓地板 {proj['total_floor_area_m2']:,.0f} m²")

    # ── 用量計算 ──
    print("\n▸ 跑用量計算…")
    model = model_from_design(design)
    qto = takeoff(model)

    print(f"\n{'=' * 50}")
    print("混凝土 by fc' (m³):")
    print(f"{'=' * 50}")
    for fc_key, vol in qto.concrete_by_fc.to_dict().items():
        if fc_key != 'total':
            print(f"  {fc_key:>10s}: {vol:>10.1f}")
    print(f"  {'total':>10s}: {qto.concrete_by_fc.total:>10.1f}")

    print(f"\n{'=' * 50}")
    print("鋼筋 by 構件 (噸):")
    print(f"{'=' * 50}")
    for member, tons in qto.rebar.to_dict().items():
        print(f"  {member:>15s}: {tons:>8.1f}")
    print(f"\n鋼筋密度: {qto.rebar_density_kg_m3:.1f} kg/m³ 混凝土"
          " (典型 RC 高層 120-180 kg/m³)")

    if qto.rebar_density_kg_m3 < 120:
        print("  ⚠ 鋼筋密度偏低，請檢查配筋率假設")
    elif qto.rebar_density_kg_m3 > 180:
        print("  ⚠ 鋼筋密度偏高，可能不經濟")

    # ── 造價估算 ──
    cost = estimate_cost(
        qto,
        diaphragm_wall_volume_m3=qto.concrete_by_member['diaphragm_walls'].total,
        formwork_area_m2=formwork_area(model),
    )

    print(f"\n{'=' * 50}")
    print("造價估算 (NTD):")
    print(f"{'=' * 50}")
    for k, v in cost.to_dict().items():
        if k != 'concrete_by_fc':
            print(f"  {k:>20s}: {v:>15,.0f}")

    if proj['total_floor_area_m2'] > 0:
        per = cost_per_floor_area(cost, proj['total_floor_area_m2'])
        print(f"\n單位造價: NT${per['per_m2']:,.0f}/m² "
              f"(NT${per['per_ping']:,.0f}/坪)")

    # ── 強柱弱梁檢核 ──
    print(f"\n{'=' * 50}")
    print("強柱弱梁檢核 (ΣMnc ≥ 6/5 ΣMnb):")
    print(f"{'=' * 50}")
    scwb = check_scwb(model)
    print(f"  接頭總數: {scwb.total}")
    print(f"  通過:     {scwb.passing}")
    print(f"  未通過:   {scwb.failing}")
    print(f"  通過率:   {scwb.pass_rate * 100:.1f}%")
    if scwb.failing_floors:
        print(f"  ⚠ 未通過樓層: "
              f"{', '.join(str(f) for f in scwb.failing_floors)}")
    print("  ※ 設計初期粗估，不替代結構技師簽證")

    # ── 匯出報表 ──
    out_dir = in_path.parent
    out_dir.mkdir(exist_ok=True)

    family_inv = family_inventory_from_design(design)
    excel_path = out_dir / 'design_report.xlsx'
    try:
        export_excel(qto, cost, proj, family_inv, excel_path, scwb_summary=scwb)
        print(f"\n✓ Excel: {excel_path}")
    except ImportError as e:
        print(f"\n⚠ 略過 Excel ({e})")

    pdf_path = out_dir / 'design_report.pdf'
    try:
        export_pdf(qto, cost, proj, pdf_path, scwb_summary=scwb)
        print(f"✓ PDF:   {pdf_path}")
    except ImportError as e:
        print(f"⚠ 略過 PDF ({e})")

    summary_path = out_dir / 'design_summary.json'
    export_json(qto, cost, proj, summary_path)
    print(f"✓ JSON:  {summary_path}")

    return 0


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else 'output/design.json'
    sys.exit(main(arg))
