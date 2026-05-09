# Structural Calc Engine

Python 結構計算引擎 — 從前端工具的設計輸出，計算用量、估算造價、產出報表。

## 模組

| 模組 | 功能 |
|------|------|
| `seismic.py` | 等值靜力法耐震分析 |
| `wind.py` | 風力計算 |
| `fire_rating.py` | 防火時效（§70） |
| `quantity.py` | **用量計算**（混凝土、鋼筋）|
| `cost.py` | **造價估算** |
| `report.py` | Excel/PDF/JSON 報表輸出 |

## 安裝

```bash
cd calc-engine
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## 使用

### 快速範例
```bash
python examples/quick_takeoff.py
```

### 程式介面
```python
from struct_calc.quantity import (
    Column, Beam, Slab, StructuralModel, takeoff
)
from struct_calc.cost import estimate_cost
from struct_calc.report import export_excel

# 建立模型
model = StructuralModel(
    columns=[
        Column(grid='A1', floor=1, width=700, depth=700, height=3300, fc=350),
        # ...
    ],
    beams=[
        Beam(direction='X', floor=1, span=8000, width=400, depth=650, fc=280),
        # ...
    ],
    slabs=[
        Slab(floor=1, area=1680, struct_thickness=150, sound_layer=68, fc=280),
    ],
)

# 跑用量計算
qto = takeoff(model)

print(f"混凝土總量: {qto.concrete_total_m3:.1f} m³")
print(f"鋼筋總量: {qto.rebar.total:.1f} 噸")
print(f"鋼筋密度: {qto.rebar_density_kg_m3:.1f} kg/m³")

# 造價估算
cost = estimate_cost(qto, formwork_area_m2=5000)
print(f"結構工程總造價: NT$ {cost.grand_total:,.0f}")

# 匯出報表
export_excel(qto, cost, project_info, family_inventory, 'output/report.xlsx')
```

## 測試

```bash
pytest tests/ -v
```

涵蓋：
- 單一構件體積計算
- 依 fc' 分組統計
- 鋼筋密度檢核（120-180 kg/m³）
- 防火時效 §70 各情境

## 用量計算邏輯

### 混凝土
```
柱：     寬 × 深 × 樓層淨高 × 數量
梁：     寬 × 深 × 跨距 × 數量
樓板：   面積 × 結構厚度（不含隔音層）
剪力牆： 長 × 高 × 厚
連續壁： 周長 × 深度 × 厚
```

### 鋼筋（依配筋率估算）
```
柱：    2.5%
大梁：  1.8%
小梁：  1.5%
樓板：  0.6%
剪力牆：0.8%
連續壁：1.2%

鋼筋重量 = 體積 × 配筋率 × 7850 kg/m³
```

### 鋼筋密度檢核
正常 RC 高層建築：**120 ~ 180 kg/m³ 混凝土**

低於 120 → 配筋偏少，須檢查
高於 180 → 配筋偏多，可能不經濟

## 造價單價（參考）

詳見 `data/prices.json`（2024 Q4 參考值）：
- 混凝土：NT$ 3,200~4,500/m³（依 fc' 分區）
- 鋼筋：NT$ 28,000/噸
- 鋼骨：NT$ 55,000/噸（含防火被覆）
- 連續壁：NT$ 9,000~14,000/m³（依厚度）
- 模板：NT$ 800/m²

## 注意事項

- 本引擎是設計初期估算，**不替代結構技師正式計算**
- 配筋率為經驗值，實際依配筋圖計算
- 造價會因區域、市場、工程規模浮動 ±15%
