# Revit 結構預審工具 — Claude Code 交接文件

> 本文件是從 claude.ai 搬到 Claude Code 繼續開發的完整交接資訊。
> 包含所有討論過的需求、查證的法規、設計規則、與待辦事項。

---

## 📋 專案總覽

### 願景
讓建築師在 Revit 設計初期就能：
1. 定義建築量體（地下室+裙樓+塔樓+服務核+退縮）
2. 自動生成結構元素（柱、梁、板、剪力牆、連續壁）
3. 在搬到 Revit 前預覽與檢討
4. 確認後一鍵生成 Revit Family/Type 並放置構件

### 三個 Phase

```
Phase 1｜量體預審工具（claude.ai 完成 ✓）
├─ 已完成：massing-composer.jsx
├─ 量體堆疊定義
├─ 樓高彈性（典型+例外）
├─ 結構元素視覺化
├─ 點選查看 RC 規格
└─ 設計目標 KPI 顯示

Phase 2｜結構計算引擎（Claude Code 進行 ←我們在這）
├─ 計算引擎模組化
├─ 用量精算（混凝土/鋼筋/鋼骨/造價）
├─ JSON 匯出格式
└─ 報表輸出（Excel/PDF）

Phase 3｜Revit 整合（Claude Code 完成）
├─ pyRevit 腳本
├─ 自動建立 Family Type
├─ 自動放置構件
└─ Revit ↔ 工具雙向資料流
```

---

## 🏗️ Phase 1 已完成的工具特性

### 量體系統
- **5 種量體類型**：地下室、裙樓、塔樓、服務核、退縮量體
- **彈性樓層範圍**：每個量體可指定起止樓層 + X/Y 跨網範圍
- **量體用途**：住宅/商業/辦公/停車/服務核 → 影響樓板組成

### 樓高系統
- **典型樓高**：預設 3300mm
- **例外樓層清單**：常用 B1F=4500mm（機房）、1F=5000mm（大廳挑高）、2F=4500mm（商場）

### 結構元素自動生成
- **柱**：在所有量體投影的格點交點，連續貫通
  - Tapering：依樓層分群，B+1F~3F 最大、頂部最小
  - fc' 分區：B+1F~3F=350、中段=280、上段=245 (kgf/cm²)
- **梁**：在每層樓頂部，X/Y 雙向沿格線配置
  - 大梁：跨距/12（中等耐震）
  - 寬度 ≥ 高度 × 0.5，最小 300mm
- **樓板**：依量體用途自動判斷
  - 住宅/商業：結構150mm + 隔音68mm（§46-6）
  - 停車：結構200mm
- **服務核**：自動產生四面剪力牆（300mm）
- **連續壁**：依地下室深度自動產生
  - ≤10m → 600mm｜10-15m → 800mm｜15-20m → 1000mm｜>20m → 1200mm

### 設計目標 KPI（已顯示）
- 風力：依工址查 50年回歸期基本設計風速
- 地震力：SDS、SD1、基本振動週期 T、高寬比
- 防火時效：§70 三段式（自頂層起算）
- fc' 分區策略

---

## 📚 法規與規範參考（已查證）

### A. 建築物耐震設計規範
- **最新版本**：民國 113 年版（2024.3.1 生效）
- **歷史**：民國 63→86→88→94→100→111→113 年共 9 次修訂
- **921 後重大改革**：震區微分化、近斷層調整因子、地盤分類
- **設計地震**：475 年回歸期（50年使用期內 10% 超越機率）
- **中小地震**：30 年回歸期（彈性檢核）
- **最大考量地震**：2475 年回歸期

### B. 建築技術規則 §70（防火時效）
**自頂層起算（含地下層數）**：

| 主要構造 | 不超過4層 | 5~14層 | 15層以上 |
|---------|----------|--------|---------|
| 承重牆壁 | 1 hr | 1 hr | 2 hr |
| 樑 | 1 hr | 2 hr | 3 hr |
| 柱 | 1 hr | 2 hr | 3 hr |
| 樓地板 | 1 hr | 2 hr | 2 hr |
| 屋頂 | 0.5 hr | 0.5 hr | 0.5 hr |

### C. 建築技術規則 §46-6（樓板隔音）
**110年1月1日施行**

**路徑 A**（適用範圍最廣）：
- RC樓板 ≥ 150mm
- 橡膠緩衝材 ≥ 8mm，動態剛性 ≤ 50 MN/m³
- 上鋪混凝土地板 ≥ 50mm，以鋼筋或鋼絲網補強
- ΔLw ≥ 17 dB

**路徑 B**（薄板選項）：
- RC樓板 ≥ 120mm
- 高性能緩衝材，ΔLw ≥ 20 dB
- 或取得內政部高性能綠建材標章

**性能要求**：Ln,w ≤ 58 dB

### D. 建築物耐風設計規範（50年回歸期）
| 風速 | 適用區域 |
|------|---------|
| 47.5 m/s | 花蓮市、吉安鄉、恆春鎮、滿州鄉 |
| 42.5 m/s | 臺北、基隆、新北沿海、宜蘭沿海、花蓮部分 |
| 37.5 m/s | 一般地區（中西部主要城市） |
| 32.5 m/s | 內陸盆地 |

---

## 🧮 已建立的設計公式

### 柱斷面初估（依軸力）
```
P_axial = 樓面總載重 × 承載面積 × 上方樓層數 × 1.2
Ag = P / (0.35 × fc')   # RC
Ag = P / (0.55 × Fy)    # 鋼構
柱寬 = √Ag (取整 50mm)
最小尺寸：RC 400mm, S 300mm
細長比限制：柱寬 ≥ 淨高/15
```

### 梁斷面初估（依跨距）
```
特殊耐震 (SDS≥0.5)：D = L / 10
中等耐震 (SDS≥0.33)：D = L / 12
普通耐震：D = L / 14
寬度 B = max(D × 0.5, 300mm)
小梁：D = L_short / 16, B = max(D × 0.45, 250mm)
```

### 樓板厚度
```
單向板：t = L_short / 24
雙向板：t = L_short / 30
最小 150mm（住宅）、200mm（停車場）
```

### 連續壁推算
```
深度 = 地下室最深樓底 + 1.5m 嵌入深度
厚度依深度查表（見上方）
```

### 等值靜力法（耐震）
```
基本振動週期：T = Ct × H^0.75
  Ct = 0.07 (RC), 0.085 (S), 0.07 (SRC)
基底剪力：V = SaD × I × W / (1.4 × R × αy)
垂直分配：Fx = V × wx × hx^k / Σ(wi × hi^k)
  k = 1 (T≤0.5s), 2 (T≥2.5s), 內插
```

### Revit Family/Type 命名規則
```
柱：    RC-C-{W}×{D}-fc{fc'}     例：RC-C-700×700-fc350
大梁：   RC-MB-{B}×{D}             例：RC-MB-400×650
小梁：   RC-SB-{B}×{D}
樓板：   RC-Slab-{t}              例：RC-Slab-150
樓板+SI：RC-Slab-{t}-SI{si}      例：RC-Slab-150-SI68
剪力牆： RC-SW-{t}                例：RC-SW-300
連續壁： RC-DW-{t}                例：RC-DW-800
鋼柱：   STL-C-BOX-{W}×{D}-{Fy}
鋼梁：   STL-B-H-{D}×{B}×{tw}×{tf}
```

---

## 📦 Phase 2 待辦清單（Claude Code）

### 1. 重構為多檔案專案

建議專案結構：

```
revit-structural-tool/
├── README.md
├── package.json                       # React frontend
├── pyproject.toml                     # Python backend
│
├── frontend/                          # 量體預審工具（React）
│   ├── src/
│   │   ├── components/
│   │   │   ├── MassingComposer.jsx   # 主元件
│   │   │   ├── Scene3D.jsx           # Three.js 場景
│   │   │   ├── VolumeEditor.jsx
│   │   │   ├── FloorHeightEditor.jsx
│   │   │   ├── DesignParamPanel.jsx
│   │   │   └── SummaryPanel.jsx
│   │   ├── lib/
│   │   │   ├── calculations.js       # 結構計算
│   │   │   ├── seismic.js
│   │   │   ├── wind.js
│   │   │   ├── fireRating.js
│   │   │   └── floorHeight.js
│   │   └── data/
│   │       ├── seismicZones.json     # 全台震區資料
│   │       ├── windZones.json
│   │       └── steelSections.json    # H型鋼規格表
│   └── public/
│
├── calc-engine/                       # Python 結構計算引擎
│   ├── src/
│   │   ├── seismic_analysis.py       # 等值靜力法
│   │   ├── wind_analysis.py
│   │   ├── member_sizing.py          # 構件初估
│   │   ├── load_calc.py              # 載重計算
│   │   ├── quantity_takeoff.py       # 用量計算
│   │   ├── cost_estimate.py          # 造價估算
│   │   └── report_generator.py       # 報表產生
│   └── tests/
│
├── pyrevit-scripts/                   # Revit 整合
│   ├── read_project.py               # 讀取 Revit 專案
│   ├── create_grids.py               # 建立軸網
│   ├── create_levels.py              # 建立樓層
│   ├── create_column_families.py
│   ├── create_beam_families.py
│   ├── create_slab_types.py
│   ├── place_columns.py
│   ├── place_beams.py
│   ├── place_slabs.py
│   ├── place_walls.py
│   └── extract_quantities.py
│
├── data/
│   ├── seismic-zones-full.json       # 全台 370+ 行政區
│   ├── wind-zones-full.json
│   ├── concrete-prices.json          # 當地造價資料
│   └── steel-prices.json
│
└── output/
    ├── reports/                       # 報表輸出
    ├── exports/                       # JSON for Revit
    └── revit-files/                   # 從 Revit 匯出的檔案
```

### 2. 需要在 Claude Code 解決的問題

**用量精度需求**
- 粗估（±15%）：用設計公式估算
- 細算（±5%）：用配筋表 + 詳細幾何
- 建議：先做粗估，後續可升級為細算

**造價估算來源**
- 需要當地最新單價
- 建議資料來源：
  - 內政部營建署「公共工程價格資料庫」
  - 行政院主計總處「營造工程物價指數」
  - 各縣市建管處公告之單位造價標準
- 結構部分典型單價（2024 年參考）：
  - 混凝土 fc'=280：NT$ 3,500 / m³
  - 混凝土 fc'=350：NT$ 4,000 / m³
  - 鋼筋（含工料）：NT$ 26,000~30,000 / 噸
  - 鋼骨（含工料）：NT$ 50,000~65,000 / 噸
  - 連續壁（含設備）：NT$ 9,000~12,000 / m³

**匯出格式**
- Excel：適合用量明細、依樓層/構件分類
- PDF：適合最終報告、含圖表
- JSON：給 pyRevit 腳本使用
- 建議：三種都要，使用者選擇

**與 Revit 用量比對**
- Revit 內建 Material Takeoff 可導出
- 比對工具計算 vs Revit 實際模型
- 差異 > 10% 時提示檢查

### 3. 用量計算需求

**混凝土用量（依 fc' 分區）**
```python
def calculate_concrete_volume(volumes, members, fc_zones):
    result = {fc: 0 for fc in [210, 245, 280, 350, 420]}
    
    # 柱
    for col in columns:
        fc = col.fc
        vol = col.W * col.D * col.height
        result[fc] += vol
    
    # 梁
    for beam in beams:
        vol = beam.B * beam.D * beam.length
        result[beam.fc] += vol
    
    # 樓板（不含隔音層）
    for slab in slabs:
        vol = slab.area * slab.struct_thick
        result[slab.fc] += vol
    
    # 剪力牆、連續壁類同
    return result  # m³
```

**鋼筋用量（配筋率估算）**
```python
REBAR_RATIOS = {
    'column': 0.025,      # 2.5% 平均
    'main_beam': 0.018,   # 1.8%
    'sec_beam': 0.015,    # 1.5%
    'slab': 0.006,        # 0.6%
    'shear_wall': 0.008,  # 0.8%
    'd_wall': 0.012,      # 1.2%
}

def calculate_rebar_tonnage(concrete_volumes):
    total = 0
    for member_type, vol in concrete_volumes.items():
        ratio = REBAR_RATIOS[member_type]
        weight_kg = vol * ratio * 7850  # kg/m³ steel density
        total += weight_kg / 1000  # to tons
    return total
```

**鋼骨用量（S/SRC 結構）**
```python
def calculate_steel_tonnage(members):
    total = 0
    for m in members:
        if m.type == 'STL_BOX':
            # 箱型柱：周長 × 板厚 × 高
            perimeter = 2 * (m.W + m.D)
            section_area = perimeter * m.plate_thick
            total += section_area * m.length * 7850 / 1e9
        elif m.type == 'STL_H':
            # H 型鋼：標準截面積
            section_area = m.flange_area * 2 + m.web_area
            total += section_area * m.length * 7850 / 1e9
    return total  # tons
```

### 4. 報表輸出範例

**Excel 結構（建議分頁）**
```
Sheet 1: 設計總覽
  - 工址、樓層、結構系統
  - 設計風速、SDS/SD1
  - 防火時效、fc' 分區

Sheet 2: 混凝土用量
  - 依 fc' 分類
  - 依樓層分類
  - 依構件類型分類

Sheet 3: 鋼筋用量
  - 配筋率假設
  - 各構件估算
  - 鋼筋密度檢核（kg/m³）

Sheet 4: 構件清單（Revit Family/Type）
  - 所有不同類型的構件
  - 數量
  - 單一規格

Sheet 5: 造價估算
  - 單價表
  - 用量 × 單價
  - 結構工程總造價
  - 單位造價（NT$/坪 或 NT$/m²）

Sheet 6: 與 Revit 模型比對（如有）
```

---

## 🔧 Phase 3 pyRevit 整合（後續）

### 工作流程
```
1. 使用者在 Revit 開啟專案
2. 執行 read_project.py 讀取現有資訊
3. 在工具中編輯量體
4. 工具匯出 design.json
5. 執行 generate_structure.py
6. pyRevit 自動：
   a. 建立軸網（X1,X2,...,Y1,Y2,...）
   b. 建立樓層（B3F, B2F, B1F, 1F, 2F,...）
   c. 載入或建立 Family
   d. 建立 Type（依命名規則）
   e. 在格點交點放置柱
   f. 沿軸線放置梁
   g. 建立樓板
   h. 建立剪力牆與連續壁
7. 後續使用者可在 Revit 微調
```

### Family 命名與 Type 屬性
```python
# 範例：建立柱 Family Type
family = "M_Concrete-Rectangular Column"
type_name = "RC-C-700×700-fc350"
parameters = {
    "b": 700,     # mm
    "h": 700,     # mm
    "fc'": 350,   # kgf/cm²
    "Fire Rating": 3,  # hours
}
```

---

## 📂 隨附檔案

- `massing-composer.jsx` — Phase 1 完成的 React 元件
  （可作為 Phase 2 frontend/src/components/MassingComposer.jsx 起點）

---

## 🚀 Claude Code 啟動指令

當您打開 Claude Code 時，可以這樣開始：

```
我要繼續一個結構預審工具的開發。
請先讀取附上的 HANDOFF.md 了解背景，
然後幫我建立 Phase 2 的專案結構。

第一步：建立 frontend/ 目錄，把現有的 massing-composer.jsx 
重構成多個元件檔案，並加入 TypeScript 型別定義。

第二步：建立 calc-engine/ Python 模組，實作：
1. 用量計算（混凝土、鋼筋、鋼骨）
2. 造價估算
3. Excel/PDF 報表輸出

第三步：規劃 pyrevit-scripts/ 的腳本架構。
```

---

## ✅ 驗收清單（Phase 2 完成標準）

- [ ] 前端重構為多檔案，且功能與 Phase 1 一致
- [ ] 用量計算引擎可獨立執行
- [ ] 可輸出 Excel 報表（≥6 個分頁）
- [ ] 可輸出 PDF 報告
- [ ] 可輸出符合 pyRevit 介面的 JSON
- [ ] 包含至少 5 個單元測試
- [ ] 完整的 README 與安裝說明

---

## 📌 重要提醒

1. **這個工具是設計初期的判斷依據，不替代正式結構技師計算**
2. **所有公式都是經驗法則，最終須經結構技師簽證**
3. **耐震設計遵循民國 113 年版規範，未來改版需更新工具**
4. **§46-6 樓板隔音、§70 防火時效是法規硬要求**
5. **強柱弱梁是強度（彎矩容量）概念，不是尺寸對比**

---

*交接文件 v1.0 — 2026.05.09*
*由 claude.ai 對話整理而成*
