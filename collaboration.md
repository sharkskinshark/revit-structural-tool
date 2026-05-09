# 雙邊協作 SOP — claude.ai ↔ Claude Code

> 同時使用 claude.ai（這裡）與 Claude Code 開發本專案的標準作業程序。
> 目的：充分利用兩邊優勢、避免衝突、保持一致。

---

## 🎯 一頁速查

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repo (唯一真理)                   │
└──────────────────┬──────────────────┬──────────────────────┘
                   │ git push/pull    │
                   ▼                  ▼
        ┌─────────────────┐  ┌─────────────────────┐
        │   claude.ai     │  │    Claude Code      │
        │                 │  │                     │
        │ 🎨 設計討論     │  │ 🏗️ 實作程式        │
        │ 📚 查法規       │  │ 🧪 跑測試          │
        │ ✨ 視覺原型     │  │ 🔧 重構檔案        │
        │ 📝 寫文件       │  │ 🏛️ Revit 整合      │
        │                 │  │ 💾 git 操作        │
        │ 90% 副手        │  │ 90% 主力           │
        └─────────────────┘  └─────────────────────┘
```

**核心原則**：
1. **GitHub 是唯一真理來源**
2. **每個檔案只在一邊改**，不要兩邊同時動同一個檔案
3. **切換前先 git commit**
4. **回 claude.ai 前先貼最新檔案內容**

---

## 📋 角色分工表

### claude.ai（這裡）做

| 工作 | 為什麼 |
|------|-------|
| 看 React 元件渲染效果 | 即時 Artifact 視覺化 |
| 拖拉 3D 場景測試 | 互動體驗 |
| web_search 查最新法規 | 網路存取 |
| 釐清模糊需求 | 來回對話 |
| 設計演算法 | 不需要實際執行 |
| 寫長篇文件（HANDOFF、regulations） | 跨概念整合 |
| 視覺/UI 評論 | 看得到才能評論 |
| 探索新功能可行性 | 概念驗證 |

### Claude Code 做

| 工作 | 為什麼 |
|------|-------|
| 重構大型檔案 | 跨多檔案操作 |
| 跑 pytest / npm test | 真實執行環境 |
| 安裝套件、解 dependency | pip / npm 直接運作 |
| 抓真實 bug | 跑得起來才測得到 |
| 操作 Revit / pyRevit | 唯一能連到 Revit |
| git commit / push | 直接寫本機 repo |
| 連續開發 1-3 小時 | 沒有 session 限制 |
| 讀本機檔案 / Revit 匯出 | 直接存取磁碟 |

### 兩邊都能做（看哪邊順手）

- 寫單一函式
- 修語法錯誤
- 翻譯文字
- 寫 README

---

## 🔄 切換 SOP

### A. 從 Claude Code → claude.ai

**情境**：你正在 Claude Code 寫程式，遇到需求不清、想看視覺、要查法規。

**步驟**：

```bash
# 1. 在 Claude Code 那端先存檔
git add .
git commit -m "WIP: 暫存進度，移至 claude.ai 討論"
git push

# 2. 想清楚要問什麼，準備 context
```

**到 claude.ai 後**：

✅ **要做的事**：
- 把相關檔案內容貼給我（最多 2-3 個檔案）
- 或 git push 後給我 raw URL，我用 web_fetch 讀
- 簡述目前進度與卡點

✅ **問問題的格式**：
```markdown
## 目前狀況
[一段話描述進度]

## 卡點
[具體問題]

## 相關檔案
[貼程式碼或給連結]

## 我想要的
[期待的解答形式：建議？範例？視覺驗證？]
```

❌ **不要**：
- 假設我記得 Claude Code 那邊的進度
- 期望我直接讀你本機檔案
- 要我「自動同步」（做不到）

---

### B. 從 claude.ai → Claude Code

**情境**：claude.ai 給了你方案、文件、或新檔案，要套用到專案。

**步驟**：

**離開 claude.ai 前**：

✅ **要做的事**：
- 確認檔案有下載（看對話往上滑）
- 或把對話結論複製到筆記
- 記下哪些檔案需要新增/修改

**回到 Claude Code 後**：

```bash
# 1. 確保是最新的
git pull

# 2. 套用 claude.ai 的產出
# 方法 1：手動把下載的檔案複製到對應位置
cp ~/Downloads/new-file.py src/struct_calc/

# 方法 2：開 Claude Code 對話，貼 claude.ai 給的內容請它寫入
```

**對 Claude Code 說**：

```
我剛才在 claude.ai 討論完，結論是 [簡述]。

請幫我：
1. 把 [檔案 X] 修改成 [新內容]（我貼上來）
2. 跑 pytest 確認沒壞
3. git commit + push
```

或更簡單：

```
我把新檔案放在 ~/Downloads/quantity-v2.py 了，
請覆蓋掉 src/struct_calc/quantity.py，跑測試確認沒壞。
```

---

## ⚠️ 衝突避免規則

### 🚫 絕對不要做

1. **兩邊同時改同一個檔案**
   - 結果：後存的覆蓋先存的
   - 例外：如果是純粹討論不是修改，OK

2. **claude.ai 給你舊檔案，你直接覆蓋本機新版**
   - 我看到的可能是 1 小時前的版本
   - 套用前先 diff 比對

3. **離開 Claude Code 沒 commit 就回 claude.ai**
   - 萬一中間發生事情（電腦關機、Claude Code 出問題）
   - 改了什麼會忘掉

4. **同時開兩個 Claude Code session**
   - git push 會打架
   - 一個改完一個改

---

### ✅ 應該這樣做

1. **明確分工檔案**

   ```
   假設正在做 Phase 2，可以這樣分配：
   
   claude.ai 動：
     - docs/architecture.md
     - docs/regulations.md
     - HANDOFF.md
   
   Claude Code 動：
     - frontend/src/**/*
     - calc-engine/**/*
     - pyrevit-scripts/**/*
   ```

2. **頻繁 git commit**

   ```bash
   # 每個小段落結束就 commit
   git add .
   git commit -m "feat: 加入 PDF 報表輸出"
   git push
   ```

3. **分支策略（進階）**

   ```bash
   # 大改動用 branch
   git checkout -b feat/scwb-check
   # 改完
   git push origin feat/scwb-check
   # 確認沒問題再 merge 回 main
   git checkout main
   git merge feat/scwb-check
   ```

---

## 🌳 決策樹：遇到問題該找誰？

```
有問題了
  │
  ├─ 是「不知道該怎麼做」嗎？
  │   ├─ 是 ─→ claude.ai 討論方案
  │   └─ 否 ─→ 繼續判斷
  │
  ├─ 需要看視覺效果嗎？
  │   ├─ 是 ─→ claude.ai
  │   └─ 否 ─→ 繼續判斷
  │
  ├─ 需要查最新法規嗎？
  │   ├─ 是 ─→ claude.ai（web_search）
  │   └─ 否 ─→ 繼續判斷
  │
  ├─ 程式跑不起來/有錯誤嗎？
  │   ├─ 是 ─→ Claude Code（直接修）
  │   └─ 否 ─→ 繼續判斷
  │
  ├─ 要操作 Revit 嗎？
  │   ├─ 是 ─→ Claude Code（唯一選擇）
  │   └─ 否 ─→ 繼續判斷
  │
  ├─ 是大規模重構嗎？
  │   ├─ 是 ─→ Claude Code
  │   └─ 否 ─→ 繼續判斷
  │
  └─ 要寫文件嗎？
      ├─ 跨多概念整合 ─→ claude.ai
      └─ 純技術細節   ─→ Claude Code
```

---

## 🔁 典型工作循環

### 循環 1：新功能開發（推薦流程）

```
1. claude.ai：討論需求、設計演算法（30 分鐘）
   產出：規格文件 / 偽代碼

2. 你：把規格 commit 到 docs/
   git add docs/feature-X.md
   git commit -m "spec: 新增 feature X 規格"
   git push

3. Claude Code：讀規格、實作、測試（1-2 小時）
   產出：完整 feature + 測試
   git commit + push

4. claude.ai：你貼成果回來，請我 review
   產出：改進建議

5. Claude Code：套用建議，最終 commit
```

### 循環 2：除錯（聚焦 Claude Code）

```
1. Claude Code：發現 bug
2. Claude Code：嘗試修復
3. 卡住的話 → claude.ai 諮詢
4. 回 Claude Code：套用建議、確認修好
5. git commit + push
```

### 循環 3：UI 優化（聚焦 claude.ai）

```
1. Claude Code：把元件貼給 claude.ai
2. claude.ai：渲染、評論、建議
3. claude.ai：產出修改後版本
4. 你：下載 / 複製到本機
5. Claude Code：套用 + git commit
6. 自己跑 npm run dev 看實際效果
```

### 循環 4：法規更新

```
1. claude.ai：web_search 確認最新法規
2. claude.ai：更新 docs/regulations.md
3. 你：下載新版 regulations.md
4. Claude Code：依新法規修改 fire_rating.py 等
5. Claude Code：跑測試確認沒壞
6. git commit + push
```

---

## 📦 同步檢核清單

### 每次切換前確認

#### 從 Claude Code 離開
- [ ] 已執行 `git status`，確認沒有未追蹤檔案
- [ ] 已執行 `git commit`
- [ ] 已執行 `git push`
- [ ] 記下未完成事項與下一步

#### 進入 claude.ai
- [ ] 帶上最新檔案內容（貼或上傳）
- [ ] 簡述目前進度
- [ ] 明確說出要解決什麼

#### 離開 claude.ai
- [ ] 重要產出已下載 / 已複製
- [ ] 對話結論已記下（最好寫成 commit message 草稿）
- [ ] 知道下一步要在 Claude Code 做什麼

#### 回到 Claude Code
- [ ] `git pull`（萬一有更新）
- [ ] 套用 claude.ai 的產出
- [ ] 跑相關測試確認沒壞
- [ ] git commit + push

---

## 🆘 衝突發生時怎麼辦

### 情境 1：發現兩邊改同一檔案

```bash
# 在 Claude Code 那邊
git status
# 看到 conflict

# 選一個版本為主
git checkout --ours file.py     # 用本機版
# 或
git checkout --theirs file.py   # 用遠端版

# 或手動編輯合併
code file.py  # 用 VS Code 打開，找 <<<<<<< 標記，手動處理

# 處理完
git add file.py
git commit -m "resolve: 合併 claude.ai 與 Claude Code 的修改"
git push
```

### 情境 2：claude.ai 給的版本是舊的

**症狀**：套用後測試壞掉，或缺少某些新功能

**處理**：
```bash
# 1. 先別套用！
# 2. 看當前 commit log
git log --oneline -10

# 3. 比對 claude.ai 給的 vs 本機版
diff ~/Downloads/quantity-v2.py src/struct_calc/quantity.py

# 4. 只挑要的部分套用
# 5. 或回 claude.ai 提供最新版檔案請我重新處理
```

### 情境 3：忘記哪邊版本比較新

```bash
# 看本機最近修改時間
ls -la --time-style=full-iso src/struct_calc/quantity.py

# 看 git log
git log -1 --format=%ai src/struct_calc/quantity.py

# 通常以 git 為準，因為有歷史紀錄
```

---

## 💬 給 claude.ai 的標準開場白

每次回到 claude.ai 接續工作，建議這樣開場：

```markdown
回來繼續結構預審工具的開發。

## 目前進度
- Phase 1：完成（量體預審工具）
- Phase 2：進行中（[具體項目]）
- 上次討論：[簡述]

## 最新檔案狀態
[貼 1-3 個關鍵檔案，或給 GitHub URL]

## 這次要解決
[具體問題]
```

---

## 🎬 給 Claude Code 的標準開場白

每次新開 Claude Code session：

```
你好！我要繼續結構預審工具的開發。

請先：
1. git pull 確保是最新版
2. 讀 HANDOFF.md 了解專案背景
3. 讀 docs/collaboration.md 了解雙邊分工
4. 看最近 5 個 commits（git log --oneline -5）

讀完告訴我：
1. 你掌握了什麼
2. 最近的變更是什麼
3. 你建議的下一步？

我使用繁體中文（台灣），技術術語可英文。
```

---

## 📅 實際範例：一個工作天

```
09:00  打開 Claude Code
       └─ git pull
       └─ 讀昨天的 commit
       └─ 開始重構 frontend 元件

11:00  卡在 Three.js 渲染問題
       └─ git commit -m "WIP: 重構中"
       └─ git push
       └─ 切到 claude.ai

11:15  在 claude.ai
       └─ 貼相關元件程式碼
       └─ 描述問題
       └─ 我給出方案 + 視覺化驗證

12:00  回 Claude Code
       └─ 套用 claude.ai 的解法
       └─ 跑 npm run dev 確認可行
       └─ git commit -m "fix: 解決 Three.js 渲染問題"
       └─ git push

13:00  午休

14:00  繼續 Claude Code
       └─ 開始寫單元測試
       └─ 發現 calc-engine 有 bug
       └─ 修 + 測試 + commit

16:00  想優化 UI 配色
       └─ 切 claude.ai
       └─ 貼元件碼，請我給配色建議
       └─ 渲染給你看效果

16:30  回 Claude Code 套用配色
       └─ git commit + push

17:00  下班 ✓
       (有完整 git history，明天從哪繼續一目了然)
```

---

## 🎯 黃金法則總結

1. **GitHub repo 是真理** — 兩邊都繞著它轉
2. **Claude Code 是主力** — 90% 寫程式時間在這
3. **claude.ai 是設計室** — 想清楚再去工地施工
4. **每個檔案有歸屬** — 寫程式找 Claude Code、寫文件找 claude.ai
5. **切換前 commit** — 沒 commit 等於沒做
6. **回 claude.ai 帶 context** — 我不會自動知道進度
7. **不確定就 git pull** — 拉最新版總沒錯

---

*文件版本：v1.0*  
*最後更新：對話建立時*
