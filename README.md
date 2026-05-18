# Revit 結構預審工具

> 從 Revit 設計初期就能進行結構量體預審、自動生成構件、輸出用量報表的整合工具。

## 🎯 專案目標

讓建築師在 Revit 設計初期就能：

1. ✅ 定義建築量體（地下室+裙樓+塔樓+服務核+退縮）
2. ✅ 自動生成結構元素（柱、梁、板、剪力牆、連續壁）
3. ✅ 在搬到 Revit 前預覽與檢討
4. ✅ 確認後一鍵生成 Revit Family/Type 並放置構件
5. ✅ 計算混凝土、鋼筋、鋼骨用量與造價

## 📂 專案結構

```
revit-structural-tool/
├── HANDOFF.md                  # ← 先讀這個！完整背景
├── README.md                   # 本檔
│
├── frontend/                   # React + Three.js 量體預審工具
│   ├── src/
│   │   ├── components/         # UI 元件
│   │   ├── lib/                # 計算邏輯
│   │   ├── data/               # 法規資料
│   │   └── types/              # TypeScript 型別
│   └── package.json
│
├── calc-engine/                # Python 結構計算引擎
│   ├── src/struct_calc/
│   │   ├── seismic.py         # 耐震分析
│   │   ├── wind.py            # 風力計算
│   │   ├── quantity.py        # 用量計算
│   │   ├── cost.py            # 造價估算
│   │   └── report.py          # 報表輸出
│   └── tests/
│
├── pyrevit-scripts/            # Revit 自動化
│   └── scripts/
│       ├── 01_read_project.py
│       ├── 02_generate_structure.py
│       └── ...
│
├── data/                       # 法規資料
│   ├── seismic-zones.json     # 全台震區
│   ├── wind-zones.json        # 風速分區
│   └── prices.json            # 造價單價
│
└── docs/                       # 文件
    ├── architecture.md
    ├── regulations.md
    └── workflow.md
```

## 🚀 快速開始

### 前提需求
- Node.js ≥ 18
- Python ≥ 3.10
- Revit 2025 (供 pyRevit 整合；API 相容 2023+)
- pyRevit (https://pyrevit.com)

### 1. 安裝前端
```bash
cd frontend
npm install
npm run dev
# 開啟 http://localhost:5173
```

### 2. 設置計算引擎
```bash
cd calc-engine
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .
pytest tests/
```

### 3. pyRevit 整合
```bash
# 將 pyrevit-scripts/ 加入 pyRevit 的 extension paths
# 或複製到 %APPDATA%\pyRevit\Extensions\
```

## 📚 重要文件

- [`HANDOFF.md`](./HANDOFF.md) — 完整需求與法規背景（**先讀**）
- [`CLAUDE_CODE_GUIDE.md`](./CLAUDE_CODE_GUIDE.md) — Claude Code 啟動指南
- [`docs/collaboration.md`](./docs/collaboration.md) — **雙邊協作 SOP**（claude.ai ↔ Claude Code）
- [`docs/architecture.md`](./docs/architecture.md) — 系統架構
- [`docs/regulations.md`](./docs/regulations.md) — 法規參考
- [`docs/workflow.md`](./docs/workflow.md) — 工作流程

## ⚠️ 重要聲明

1. 本工具是**設計初期判斷依據**，**不替代正式結構技師計算**
2. 所有公式都是經驗法則，最終須經結構技師簽證
3. 耐震設計遵循民國 113 年版規範
4. 請定期檢查法規更新（耐震、防火、隔音、耐風）

## 📜 法規依據

- 建築物耐震設計規範（民國 113 年版）
- 建築技術規則建築設計施工編 §70（防火時效）
- 建築技術規則建築設計施工編 §46-6（樓板隔音）
- 建築物耐風設計規範（50 年回歸期基本設計風速）
- 建築物混凝土結構設計規範（民國 112 年版）

## 📞 開發者

從 claude.ai 對話搬遷而來，由 Claude Code 繼續開發。
