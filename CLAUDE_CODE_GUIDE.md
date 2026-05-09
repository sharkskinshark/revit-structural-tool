# Claude Code 啟動指南

> 這份文件說明如何在 Claude Code 中接續開發此專案。

---

## 第一次開啟 Claude Code 時

複製以下訊息給 Claude Code：

```
你好，我要繼續一個結構預審工具的開發。

請先閱讀以下檔案：
1. README.md           (專案總覽)
2. HANDOFF.md          (完整需求與法規背景，最重要)
3. docs/architecture.md (系統架構)

讀完後，告訴我：
1. 你掌握了哪些需求與法規依據
2. 目前已有哪些檔案和模組
3. 建議從哪裡開始繼續？

我使用繁體中文（台灣），技術術語可英文。
```

---

## 建議的第一步任務

### Task 1: 驗證設置
```
請執行 setup.sh，確認所有依賴可以安裝成功。
然後跑 pytest tests/ 與 npm run dev，確認前後端都能啟動。
回報任何錯誤。
```

### Task 2: 重構前端（將大 App.tsx 拆分）
```
目前 frontend/src/components/App.tsx 是從 claude.ai 遷移過來的單一檔案，
約 1200 行。請幫我將它拆分為合理的元件結構：

frontend/src/components/
├── App.tsx              (主元件，約 200 行)
├── Scene3D.tsx          (Three.js 場景)
├── VolumeEditor.tsx     (量體編輯卡片)
├── FloorHeightEditor.tsx
├── DesignParamPanel.tsx (設計參數面板)
├── SummaryPanel.tsx     (右側摘要)
├── FamilyTypePanel.tsx  (Revit Family/Type 預覽)
└── SelectedElementInfo.tsx (選取構件詳情)

並使用 frontend/src/types/index.ts 中已定義的 TypeScript 型別。
計算邏輯應提取到 frontend/src/lib/* 對應檔案。

完成後跑 npm run build 確認沒有 type error。
```

### Task 3: 完善計算引擎
```
請完善 calc-engine 模組：

1. 讓 examples/quick_takeoff.py 真的能跑出結果
2. 補齊 cost.py 中的 formwork 估算邏輯
3. 在 report.py 加入 Sheet 6（與 Revit 比對）
4. 增加 PDF 報告輸出（用 reportlab）
5. 確認所有 pytest 測試通過

順便檢查鋼筋密度是否落在合理範圍 (120-180 kg/m³)。
```

### Task 4: 完整 pyRevit 腳本
```
請完善 pyrevit-scripts/scripts/02_generate_structure.py：

1. 實作 create_grids() — 從 design.json 中 grids 座標建立 X/Y 軸網
2. 實作 create_levels() — 已有骨架，補完 elevation 計算
3. 實作 create_column_types() — duplicate 一個 base RC column family，
   依 width/depth 設定參數，命名為 RC-C-700×700-fc350 格式
4. 實作 place_columns() — 在格點交點放置柱實例
5. 加入錯誤處理與 transaction rollback

請一次只做一個函式，跑通了再做下一個。
```

---

## 進階任務（後續）

### Task 5: 完整全台震區資料
```
data/seismic-zones.json 目前只有少量代表性城市。
請參考內政部《建築物耐震設計規範》表 2-1，
補齊全台 370+ 鄉鎮市區的 SS、S1、SDS、SD1 數值。
```

### Task 6: 強柱弱梁檢核
```
這個是設計階段需要的進階檢核：

ΣMnc ≥ (6/5) ΣMnb at joints

需要：
1. 依柱配筋計算 Mnc (柱彎矩容量)
2. 依梁配筋計算 Mnb
3. 在每個樑柱接合處檢核

實作於 calc-engine/src/struct_calc/scwb_check.py
```

### Task 7: 與 Revit 用量比對
```
完成 09_extract_quantities.py：
1. 讀取目前 Revit 模型所有結構元素
2. 計算實際混凝土量、鋼筋量
3. 與我們的工具計算結果比對
4. 產出比對報告（差異 > 10% 標紅）
```

---

## 常見問題

### Q: 前端與後端如何溝通？
**A**: 透過 `design.json` 檔案。前端匯出，後端讀取。
未來可改為 REST API 或 WebSocket。

### Q: pyRevit 用 IronPython 還是 CPython？
**A**: pyRevit 預設 IronPython 2.7，可切換到 CPython。
我們的腳本以 IronPython 為主（因 Revit API 直接支援）。

### Q: 計算結果與專業結構分析軟體（如 ETABS）會差多少？
**A**: 用量估算誤差約 ±10-15%，這是設計初期估算的合理範圍。
正式設計仍須用專業軟體分析。

### Q: 為何 SDS、SD1 是手動輸入？
**A**: 全台 370+ 鄉鎮市區的數值龐大，目前 data/seismic-zones.json
只有部分城市，建議依需要逐步補齊。

---

## 開發紀律

1. **每個變更要有對應的測試**（calc-engine 部分）
2. **TypeScript strict mode**（frontend 部分）
3. **法規數值要有來源註解**（指明哪一條/哪一表）
4. **commit message 用繁中或英文皆可，但要清楚**
5. **重大變更前先 git branch**

祝開發順利！
