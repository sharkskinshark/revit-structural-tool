# design.json — 結構預審工具資料交換格式

> 版本：**1.0**（首版）
>
> 用途：Frontend 量體預審工具 → calc-engine（Python 用量/造價/報表）→ pyRevit（Phase 3 自動建模）的單一資料介面。

## 設計原則

1. **單檔自我描述** — 不依賴外部規則檔，calc-engine 與 pyRevit 各自讀檔即可作業
2. **每筆構件 entry 自包含尺寸與材料** — 柱已展開成逐層實例（option a）；角柱/特殊柱直接改該筆 entry，無需例外清單
3. **Snake_case 鍵名** — 跟 Python 端一致，讀檔不需要重命名
4. **單位統一**：長度 mm、面積 m²、體積 m³、強度 kgf/cm²、風速 m/s
5. **Schema 演進**：透過 `schema_version` 欄位識別；calc-engine `from_json.py` 應在主版本不符時報錯

---

## 完整範例（精簡版，省略重複資料）

```json
{
  "schema_version": "1.0",
  "exported_at": "2026-05-09T20:50:00+08:00",
  "exported_by": "frontend@0.1.0",

  "project": {
    "name": "Sample 22F Mixed-Use",
    "location": "臺北市",
    "structure_system": "RC"
  },

  "design_params": {
    "wind_v_ms": 42.5,
    "wind_zone": "42.5 m/s 區",
    "SDS": 0.66,
    "SD1": 0.385,
    "importance": 1.0,
    "site_class": 2,
    "seismic_level": "中等"
  },

  "geometry": {
    "grid_x_mm": 8000,
    "grid_y_mm": 7000,
    "max_bx": 6,
    "max_by": 5,
    "typical_height_mm": 3300,
    "floor_exceptions": [
      { "floor": -1, "height_mm": 4500, "label": "機房/水箱/配電" },
      { "floor": 1,  "height_mm": 5000, "label": "大廳挑高" },
      { "floor": 2,  "height_mm": 4500, "label": "商場挑高" }
    ],
    "levels": [
      { "name": "B3F", "elevation_mm": -10500, "height_mm": 3300 },
      { "name": "B2F", "elevation_mm": -7200,  "height_mm": 3300 },
      { "name": "B1F", "elevation_mm": -3900,  "height_mm": 4500 },
      { "name": "1F",  "elevation_mm": 0,      "height_mm": 5000 },
      { "name": "2F",  "elevation_mm": 5000,   "height_mm": 4500 }
    ],
    "total_floors_above": 22,
    "total_floors_below": 3
  },

  "volumes": [
    { "id": 1, "name": "地下室", "type": "basement", "use_type": "parking",
      "start_floor": -3, "end_floor": 0,
      "x1": 0, "x2": 6, "y1": 0, "y2": 5 },
    { "id": 2, "name": "裙樓",   "type": "podium",   "use_type": "commercial",
      "start_floor": 1, "end_floor": 5,
      "x1": 0, "x2": 6, "y1": 0, "y2": 5 },
    { "id": 3, "name": "塔樓A",  "type": "tower",    "use_type": "residential",
      "start_floor": 6, "end_floor": 22,
      "x1": 1, "x2": 4, "y1": 1, "y2": 4 },
    { "id": 4, "name": "服務核", "type": "core",     "use_type": "core",
      "start_floor": -3, "end_floor": 22,
      "x1": 2, "x2": 3, "y1": 2, "y2": 3 }
  ],

  "structure": {
    "columns": [
      { "grid": "A1", "i": 0, "j": 0, "floor": -3,
        "width_mm": 700, "depth_mm": 700,
        "height_mm": 3300, "fc": 350, "fy": 4200,
        "family_type": "RC-C-700×700-fc350",
        "fire_rating_hr": 3, "in_core": false }
    ],

    "beams": [
      { "dir": "X", "i": 0, "j": 0, "floor": 1, "elev_mm": 5000,
        "span_mm": 8000, "B_mm": 400, "D_mm": 650, "fc": 280,
        "family_type": "RC-MB-400×650",
        "fire_rating_hr": 2, "vol_type": "podium" }
    ],

    "slabs": [
      { "floor": 1, "elev_mm": 5000,
        "x1": 0, "x2": 6, "y1": 0, "y2": 5,
        "area_m2": 1680,
        "struct_thickness_mm": 150, "sound_layer_mm": 68, "total_thickness_mm": 218,
        "fc": 280, "use_type": "商業",
        "family_type": "RC-Slab-150-SI68",
        "fire_rating_hr": 2, "vol_type": "podium" }
    ],

    "shear_walls": [
      { "face": "north", "core_volume_id": 4, "floor": 1,
        "length_mm": 8000, "height_mm": 5000, "thickness_mm": 300,
        "fc": 280, "fy": 4200,
        "family_type": "RC-SW-300",
        "fire_rating_hr": 2 }
    ],

    "diaphragm_wall": {
      "perimeter_mm": 166000,
      "depth_mm": 12000, "depth_m": 12.0,
      "thickness_mm": 800,
      "fc": 280,
      "family_type": "RC-DW-800",
      "x1": 0, "x2": 6, "y1": 0, "y2": 5,
      "min_floor": -3,
      "note": "中深度，2~3層支撐"
    }
  },

  "family_inventory": {
    "columns": [
      { "type": "RC-C-700×700-fc350", "count": 144, "width_mm": 700, "depth_mm": 700, "fc": 350 },
      { "type": "RC-C-650×650-fc280", "count": 192, "width_mm": 650, "depth_mm": 650, "fc": 280 },
      { "type": "RC-C-550×550-fc245", "count": 240, "width_mm": 550, "depth_mm": 550, "fc": 245 }
    ],
    "beams": [
      { "type": "RC-MB-400×650", "count": 1320, "B_mm": 400, "D_mm": 650 }
    ],
    "slabs": [
      { "type": "RC-Slab-150-SI68", "count": 17, "struct_thickness_mm": 150, "sound_layer_mm": 68 }
    ],
    "walls": [
      { "type": "RC-DW-800", "count": 1, "thickness_mm": 800, "role": "連續壁" },
      { "type": "RC-SW-300", "count": 4, "thickness_mm": 300, "role": "服務核剪力牆" }
    ]
  }
}
```

---

## 欄位說明

### Top-level

| 欄位 | 必填 | 型別 | 說明 |
|------|------|------|------|
| `schema_version` | ✓ | string | "1.0"。calc-engine 在主版本不符時應 raise |
| `exported_at` | ✓ | string (ISO8601) | 含 timezone offset |
| `exported_by` | — | string | 例：`frontend@0.1.0`，方便問題追蹤 |
| `project` | ✓ | object | 見下 |
| `design_params` | ✓ | object | 設計風速、地震參數 |
| `geometry` | ✓ | object | 軸網、樓層、樓高 |
| `volumes` | ✓ | array | 量體清單 |
| `structure` | ✓ | object | 結構元素（柱/梁/板/牆） |
| `family_inventory` | ✓ | object | Revit Family/Type 清單（去重 + 計數） |

### `project`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `name` | string | 專案名稱（無則填 `Untitled`） |
| `location` | string | 工址鄉鎮市區（影響風區、震區查表） |
| `structure_system` | enum | `RC` / `S` / `SRC` |

### `design_params`

| 欄位 | 型別 | 來源 |
|------|------|------|
| `wind_v_ms` | number | 50 年回歸期基本設計風速（依 `location` 查 [data/wind-zones.json](../data/wind-zones.json)） |
| `wind_zone` | string | 顯示用，例 `"42.5 m/s 區"` |
| `SDS` | number | 短週期譜加速度 |
| `SD1` | number | 1 秒週期譜加速度 |
| `importance` | number | 用途係數 I（1.0/1.1/1.2） |
| `site_class` | int | 1/2/3 |
| `seismic_level` | enum | `特殊` / `中等` / `普通`（影響梁深 L/10~L/14） |

### `geometry`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `grid_x_mm` / `grid_y_mm` | number | 軸距 |
| `max_bx` / `max_by` | int | X、Y 軸跨數 |
| `typical_height_mm` | number | 典型樓高（預設 3300）|
| `floor_exceptions` | array | 例外樓高清單，依 `floor` 查找 |
| `levels` | array | **由 frontend 算出**：自 B-most 到 R 各樓的 elevation 與 height |
| `total_floors_above` | int | 地上層數（最大 endF） |
| `total_floors_below` | int | 地下層數（abs(min startF)） |

### `volumes`（量體）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | int | 唯一識別 |
| `name` | string | 顯示名稱 |
| `type` | enum | `basement` / `podium` / `tower` / `core` / `setback` |
| `use_type` | enum | `residential` / `commercial` / `office` / `parking` / `core` |
| `start_floor` / `end_floor` | int | 樓層範圍（含端點，跳過 0F） |
| `x1` / `x2` / `y1` / `y2` | int | 軸網索引範圍 |

### `structure.columns`（**逐樓層**）

每根柱 × 每樓層 一筆 entry。例：B3F~22F 共 25 樓 × 30 根 = 750 筆。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `grid` | string | 格點代號，例 `A1`（A=i=0, 1=j+1） |
| `i` / `j` | int | 軸網索引（0-based） |
| `floor` | int | 樓層編號（負為地下，跳過 0） |
| `width_mm` / `depth_mm` | number | 柱斷面 |
| `height_mm` | number | 該樓層淨高（從 typical+exceptions 算出） |
| `fc` | int | 混凝土強度 (kgf/cm²) |
| `fy` | int | 鋼筋強度（預設 4200） |
| `family_type` | string | Revit 命名，例 `RC-C-700×700-fc350` |
| `fire_rating_hr` | int | §70 防火時效 1/2/3 |
| `in_core` | bool | 是否在服務核範圍（影響 pyRevit 是否真的放置） |

### `structure.beams`（**逐樓層 + 逐軸跨**）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `dir` | enum | `X` / `Y` |
| `i` / `j` | int | 起點軸網索引 |
| `floor` | int | 樓層 |
| `elev_mm` | number | 梁頂面絕對高程 |
| `span_mm` | number | 跨距（=`grid_x_mm` 或 `grid_y_mm`）|
| `B_mm` / `D_mm` | number | 梁寬 × 梁深 |
| `fc` | int | 混凝土強度 |
| `family_type` | string | 例 `RC-MB-400×650` |
| `fire_rating_hr` | int | §70 |
| `vol_type` | enum | 來自哪個 volume 類型（基地/裙/塔/退縮） |

### `structure.slabs`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `floor` | int | 樓層 |
| `elev_mm` | number | 樓板頂面高程 |
| `x1`/`x2`/`y1`/`y2` | int | 軸網索引範圍 |
| `area_m2` | number | 由 grid 算出：`(x2-x1)*grid_x * (y2-y1)*grid_y / 1e6` |
| `struct_thickness_mm` | number | RC 結構板厚 |
| `sound_layer_mm` | number | §46-6 隔音層厚（住宅/商業 = 68，其他 = 0） |
| `total_thickness_mm` | number | 結構 + 隔音層 |
| `fc` | int | |
| `use_type` | string | 顯示用標籤 |
| `family_type` | string | `RC-Slab-{t}` 或 `RC-Slab-{t}-SI{sl}` |
| `fire_rating_hr` | int | §70 |
| `vol_type` | enum | |

### `structure.shear_walls`（服務核四面牆）

從 `core` 量體推導，每樓層每面一筆。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `face` | enum | `north` / `south` / `west` / `east` |
| `core_volume_id` | int | 對應 `volumes[].id` |
| `floor` | int | 樓層 |
| `length_mm` / `height_mm` | number | 該面尺寸 |
| `thickness_mm` | number | 預設 300 |
| `fc` | int | |
| `family_type` | string | `RC-SW-{t}` |
| `fire_rating_hr` | int | §70 承重牆 |

### `structure.diaphragm_wall`（連續壁）

地下室周邊一條，從所有 `basement` 量體聯集計算。可為 `null`（無地下室時）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `perimeter_mm` | number | 聯集周長 |
| `depth_mm` / `depth_m` | number | 開挖深度（含 1.5m 嵌入） |
| `thickness_mm` | number | 依深度查表 600/800/1000/1200 |
| `fc` | int | |
| `family_type` | string | `RC-DW-{t}` |
| `x1`/`x2`/`y1`/`y2` | int | 聯集後的範圍 |
| `min_floor` | int | 最深樓底 |
| `note` | string | 工法描述 |

### `family_inventory`

去重 + 計數，給 pyRevit 直接用來建立 Family Type。

```typescript
{
  columns: { type, count, width_mm, depth_mm, fc }[],
  beams:   { type, count, B_mm, D_mm }[],
  slabs:   { type, count, struct_thickness_mm, sound_layer_mm }[],
  walls:   { type, count, thickness_mm, role }[]
}
```

---

## 演進規則

| 變更類型 | schema_version |
|---------|---------------|
| 新增 optional 欄位 | minor 版號（1.0 → 1.1） |
| 新增 required 欄位 / 改變語意 | major 版號（1.x → 2.0），calc-engine raise |
| 重命名欄位 | major |
| 移除欄位 | major |

calc-engine 的 `from_json.py` 應該：
- 接受相同 major 版本的所有 minor 版本（向後相容）
- 主版本不符 → `raise SchemaVersionError`

---

## 範例位置

完整範例：[../calc-engine/tests/fixtures/sample_design.json](../calc-engine/tests/fixtures/sample_design.json)（測試用 fixture）。

匯出檔位置：`output/design.json`（專案根目錄相對路徑）。
