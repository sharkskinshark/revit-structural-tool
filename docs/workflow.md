# 工作流程

## 完整使用情境

### 情境 A：新建專案（從零開始）

```
1. 建築師收到基地資料
   ↓
2. 啟動前端工具（npm run dev）
   ↓
3. 設定基本參數：
   • 工址（影響風速、SDS、SD1）
   • 結構系統（RC / S / SRC）
   • 柱網（X/Y 跨距、跨數）
   • 典型樓高 + 例外樓層
   ↓
4. 編輯量體：
   • 地下室（B3F~0F）
   • 裙樓（1F~5F）
   • 塔樓（6F~22F）
   • 服務核（B3F~22F）
   • 退縮量體（如需）
   ↓
5. 設定每個量體用途：
   • 住宅 / 商業 → 觸發 §46-6 隔音層
   • 停車 → 較厚樓板 200mm
   ↓
6. 工具自動生成：
   • 連續壁（依地下室深度）
   • 結構柱（fc' 分區、tapering）
   • 大梁（依跨距）
   • 樓板（含隔音層）
   • 剪力牆（服務核四面）
   ↓
7. 點選任一構件查看 RC 規格：
   • Family/Type 名稱
   • 斷面尺寸
   • fc' / fy
   • 防火時效（§70）
   ↓
8. 檢視「結構設計核心目標」KPI：
   • 抗風力（X、Y 向）
   • 抗震參數
   • 防火時效分區
   • fc' 分區策略
   ↓
9. 滿意後匯出 design.json
   ↓
10. 進 calc-engine 跑用量計算
    python examples/quick_takeoff.py
    ↓ 產出：
    output/design_report.xlsx
    output/design.json
   ↓
11. 進 Revit + pyRevit 自動建模
    執行 02_generate_structure.py
    ↓ 自動建立：
    • 軸網與樓層
    • Family Type
    • 構件實例
   ↓
12. 結構技師複核計算
   ↓
13. 開始正式設計與細部繪製
```

### 情境 B：既有 Revit 專案匯入

```
1. 開啟既有 Revit 專案
   ↓
2. 執行 01_read_project.py
   → output/project_info.json
   ↓
3. 將 project_info.json 載入前端工具
   ↓
4. 工具還原既有量體與結構元素
   ↓
5. 編輯與優化（同情境 A 的步驟 4~10）
   ↓
6. 匯出新版 design.json，跑差異比對
   → 哪些是新增 / 修改 / 刪除
   ↓
7. 執行 02_generate_structure.py
   → Revit 自動套用差異變更
```

## 開發環境工作流程

### 啟動前端開發
```bash
cd frontend
npm install
npm run dev
# 開啟 http://localhost:5173
```

### 執行 Python 計算
```bash
cd calc-engine
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/ -v
python examples/quick_takeoff.py
```

### 執行 pyRevit 腳本
```
1. 開啟 Revit 2025
2. pyRevit ribbon → 選擇 script
3. 或從 PyRevit Console:
   from pyrevit_scripts.scripts import 01_read_project
   01_read_project.main()
```

## 資料流檢核清單

### 在每階段確認的項目

**前端 → calc-engine**：
- [ ] design.json 包含所有必要欄位
- [ ] 樓層編號正確（負數 = 地下）
- [ ] 量體用途已設定
- [ ] 工址資訊正確

**calc-engine → 報表**：
- [ ] 混凝土量分 fc' 統計
- [ ] 鋼筋密度在 120-180 kg/m³ 範圍（正常 RC 高層）
- [ ] 造價與當地市場接近
- [ ] Excel 6 個分頁完整

**calc-engine → pyRevit**：
- [ ] 軸網座標正確
- [ ] 樓層高程正確
- [ ] Family Type 命名一致
- [ ] 構件實例位置不重疊

**pyRevit → Revit 模型**：
- [ ] 所有 Transaction 成功
- [ ] 沒有 dangling reference
- [ ] Family 全部載入完成
- [ ] 屬性參數正確設定

## 錯誤處理

### 前端錯誤
- 量體重疊 → 警告但允許（可能是合理的）
- 高寬比 > 4 → 警告須特別檢核風壓
- 缺少服務核 → 警告（需手動加入）
- 跨距 > 12m → 提示須使用大跨度梁

### Python 錯誤
- 缺少必要欄位 → 拋出 ValidationError
- 數值異常 → 用 logging 記錄並跳過該構件
- Excel 寫入失敗 → 退回 JSON 輸出

### pyRevit 錯誤
- Family 載入失敗 → 提示使用者選擇替代 Family
- 軸網超出工作範圍 → 警告但繼續
- Transaction 失敗 → 自動 rollback，不留半成品
