# pyRevit Scripts

自動化 Revit 結構建模腳本。

## 安裝

1. 安裝 pyRevit: https://pyrevit.com/
2. 將本資料夾加入 pyRevit Extension paths：
   - 開啟 pyRevit → Settings → Custom Extension Directories
   - 加入此資料夾完整路徑
3. 重啟 Revit

## 腳本清單

| 編號 | 檔名 | 功能 |
|------|------|------|
| 01 | `read_project.py` | 讀取目前 Revit 專案資訊到 JSON |
| 02 | `generate_structure.py` | 從 JSON 生成完整結構模型 |
| 03 | `create_grids.py` | 僅建立軸網 |
| 04 | `create_levels.py` | 僅建立樓層 |
| 05 | `place_columns.py` | 放置柱（需先有 Family Type） |
| 06 | `place_beams.py` | 放置梁 |
| 07 | `place_slabs.py` | 建立樓板 |
| 08 | `place_walls.py` | 建立牆 |
| 09 | `extract_quantities.py` | 從 Revit 模型擷取用量比對 |

## 工作流程

```
┌─────────────────────────┐
│ 前端工具：規劃量體與結構  │
│ (Phase 1 量體預審工具)   │
└────────────┬────────────┘
             │
             ▼ 匯出
┌─────────────────────────┐
│   output/design.json     │
└────────────┬────────────┘
             │
             ▼ 讀取
┌─────────────────────────┐
│ 02_generate_structure   │
│ ▸ 建立樓層              │
│ ▸ 建立軸網              │
│ ▸ 建立 Family Type      │
│ ▸ 放置柱、梁、板、牆     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  Revit 模型 (可後續調整)  │
└────────────┬────────────┘
             │
             ▼ 09_extract_quantities
┌─────────────────────────┐
│ output/revit_quantity   │
│ → 與前端用量比對         │
└─────────────────────────┘
```

## 注意事項

- **Revit 內部單位**：全部用英尺，腳本內已處理 mm↔ft 轉換
- **必須先備份**：執行 02_generate 前請先備份 .rvt 檔
- **Transaction 包覆**：所有變更在單一 Transaction 內，失敗自動 rollback
- **Family Library**：建議準備 RC 柱、梁、板的 base family 在統一資料夾

## 開發進度

`02_generate_structure.py` 已接通 design.json schema 1.0：

- [x] 讀取 design.json + schema 版本檢查 + 欄位驗證
- [x] 完整 grids 建立（X 軸字母 A/B/C…，Y 軸數字 1/2/3…）
- [x] Levels 建立（geometry.levels，同名共用不重複）
- [x] Column Family duplication 與 b/h 參數設定
- [x] 柱實例放置（格點交點、逐樓層、設定 top level）
- [x] 單一 Transaction 包覆 + 失敗 rollback
- [ ] Beam 沿 grid 線放置邏輯（sketch-based，後續）
- [ ] Slab 邊界 sketch（後續）
- [ ] Wall / 連續壁 牆型與位置（後續）
- [ ] Material 設定（fc'、fy）— 目前 fc' 僅寫入 type comment
- [ ] Fire rating 參數寫入 type

### 執行前準備

`02_generate_structure.py` 需要專案中**已載入至少一個矩形結構柱 family**
（例如 `M_Concrete-Rectangular Column`）作為 duplicate 的 base。
腳本會依 family_inventory 複製出 `RC-C-700×700-fc350` 等類型並設定斷面。
