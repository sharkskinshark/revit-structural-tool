# -*- coding: utf-8 -*-
"""效能診斷：列出物理 + 分析元素數量；發現分析元素詢問是否刪除。

很多時候 Revit 慢不是物理元素的鍋，而是背景自動跑的分析模型
(Analytical Members / Panels)。刪掉分析元素 = 立即釋放大量運算，
3D 變順，物理梁柱不受影響。
"""
from pyrevit import revit, DB, forms

doc = revit.doc


def count_physical(cat):
    return len(list(
        DB.FilteredElementCollector(doc)
        .OfCategory(cat)
        .WhereElementIsNotElementType()
    ))


# ── 物理元素 ──
cols = count_physical(DB.BuiltInCategory.OST_StructuralColumns)
beams = count_physical(DB.BuiltInCategory.OST_StructuralFraming)
slabs = count_physical(DB.BuiltInCategory.OST_Floors)
walls = count_physical(DB.BuiltInCategory.OST_Walls)
levels = count_physical(DB.BuiltInCategory.OST_Levels)
grids = count_physical(DB.BuiltInCategory.OST_Grids)


# ── 分析模型元素（Revit 2023+ decoupled）──
def safe_list(class_):
    try:
        return list(DB.FilteredElementCollector(doc).OfClass(class_).ToElements())
    except Exception:
        return []


a_members = safe_list(DB.Structure.AnalyticalMember)
try:
    a_panels = safe_list(DB.Structure.AnalyticalPanel)
except Exception:
    a_panels = []
total_analytical = len(a_members) + len(a_panels)


# ── 報告 ──
msg = '結構效能診斷\n\n'
msg += '物理元素：\n'
msg += '  柱：{0}\n'.format(cols)
msg += '  梁：{0}\n'.format(beams)
msg += '  樓板：{0}\n'.format(slabs)
msg += '  牆：{0}\n'.format(walls)
msg += '  樓層：{0}\n'.format(levels)
msg += '  軸網：{0}\n'.format(grids)
msg += '\n分析模型元素：\n'
msg += '  Analytical Member：{0}\n'.format(len(a_members))
msg += '  Analytical Panel：{0}\n'.format(len(a_panels))
msg += '\n'

print(msg)

if total_analytical > 0:
    msg += '⚠ 偵測到 {0} 個分析元素 — 很可能是 3D 拖慢的元兇。\n'.format(
        total_analytical)
    msg += '\n刪除分析元素（物理梁柱完全不受影響）？'
    if forms.alert(msg, options=['刪除', '取消']) == '刪除':
        deleted = 0
        with revit.Transaction('刪除分析模型元素'):
            for e in a_members + a_panels:
                try:
                    doc.Delete(e.Id)
                    deleted += 1
                except Exception:
                    pass
        forms.alert(
            '已刪除 {0} 個分析元素。\n\n'
            '現在轉動 3D 應該明顯變順。'.format(deleted),
            title='完成')
        print('刪除分析元素：{0} 個'.format(deleted))
    else:
        print('使用者取消刪除分析元素')
else:
    msg += '✓ 沒有分析元素 — 不是慢的來源。\n\n'
    msg += '其他可試方向：\n'
    msg += '• 把 Section Box 縮到 4-5 樓\n'
    msg += '• Visibility/Graphics 隱藏 Grids / Levels / Reference Planes\n'
    msg += '• 關掉其他不在用的 view（多開的 view 也會 regen）\n'
    msg += '• File → Options → Graphics 確認 Hardware Acceleration 開\n'
    msg += '• 確認 Revit 用獨顯而非內顯（NVIDIA / AMD 控制台設定）'
    forms.alert(msg, title='診斷完成')
