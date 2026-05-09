#!/bin/bash
# ═══════════════════════════════════════════════════════
# Revit Structural Tool - Setup Script
# ═══════════════════════════════════════════════════════
# 一鍵設置整個專案的開發環境

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "════════════════════════════════════════════════════"
echo "  Revit Structural Tool - 開發環境設置"
echo "════════════════════════════════════════════════════"
echo ""

# ─── 檢查需求 ───
echo "▸ 檢查環境需求..."
if ! command -v node &> /dev/null; then
    echo "  ✗ 找不到 Node.js，請先安裝 Node.js ≥ 18"
    exit 1
fi
echo "  ✓ Node.js: $(node --version)"

if ! command -v python3 &> /dev/null; then
    echo "  ✗ 找不到 Python3，請先安裝 Python ≥ 3.10"
    exit 1
fi
echo "  ✓ Python: $(python3 --version)"

# ─── 前端設置 ───
echo ""
echo "▸ 設置前端..."
cd "$PROJECT_ROOT/frontend"
npm install
echo "  ✓ Frontend dependencies installed"

# ─── 計算引擎設置 ───
echo ""
echo "▸ 設置計算引擎..."
cd "$PROJECT_ROOT/calc-engine"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "  ✓ Created venv"
fi

source .venv/bin/activate
pip install --upgrade pip --quiet
pip install -e ".[dev]" --quiet
echo "  ✓ Calc engine installed"

# 跑測試
echo ""
echo "▸ 跑測試..."
pytest tests/ -v --tb=short || echo "  ⚠ 部分測試未通過（正常，stub 階段）"

# ─── 完成 ───
echo ""
echo "════════════════════════════════════════════════════"
echo "  ✓ 設置完成！"
echo "════════════════════════════════════════════════════"
echo ""
echo "下一步："
echo ""
echo "  1. 啟動前端："
echo "     cd frontend && npm run dev"
echo "     → http://localhost:5173"
echo ""
echo "  2. 跑用量計算範例："
echo "     cd calc-engine"
echo "     source .venv/bin/activate"
echo "     python examples/quick_takeoff.py"
echo ""
echo "  3. 閱讀文件："
echo "     - HANDOFF.md           (完整背景)"
echo "     - README.md            (專案總覽)"
echo "     - docs/architecture.md (系統架構)"
echo "     - docs/regulations.md  (法規依據)"
echo "     - docs/workflow.md     (工作流程)"
echo ""
