# -*- coding: utf-8 -*-
"""Disable join at both ends for all structural beams in the current project.

近千支梁全做端部接合（cope/mitre）會嚴重拖慢 3D 視圖。本工具一次
對所有結構梁禁用兩端接合 — 梁仍是結構梁、僅省略接合切割計算，
3D 渲染瞬間變順。需要時可在 Revit 內對特定梁手動重新啟用。
"""
from pyrevit import revit, DB, forms

doc = revit.doc

beams = list(
    DB.FilteredElementCollector(doc)
    .OfCategory(DB.BuiltInCategory.OST_StructuralFraming)
    .WhereElementIsNotElementType()
)

if not beams:
    forms.alert('專案中找不到任何結構梁。', exitscript=True)

confirm = forms.alert(
    '將對 {0} 支結構梁禁用兩端接合（cope/mitre）。\n\n'
    '效果：3D 視圖渲染加速；梁本體與結構語意不變；\n'
    '梁端與柱／其他梁不再做切割計算（會直接重疊一小段）。\n'
    '需要時可在 Revit 內對特定梁手動重新啟用接合。\n\n'
    '是否繼續？'.format(len(beams)),
    options=['繼續', '取消'])
if confirm != '繼續':
    raise SystemExit

ok = 0
fail = 0
with revit.Transaction('禁用梁端接合'):
    for b in beams:
        try:
            DB.Structure.StructuralFramingUtils.DisallowJoinAtEnd(b, 0)
            DB.Structure.StructuralFramingUtils.DisallowJoinAtEnd(b, 1)
            ok += 1
        except Exception:
            fail += 1

forms.alert(
    '完成！\n\n禁用接合：{0} 支\n失敗：{1} 支\n\n'
    '建議現在轉動 3D 視圖看看，應該明顯變順。'.format(ok, fail),
    title='完成')
print('禁用梁端接合：{0} 支 OK / {1} 失敗'.format(ok, fail))
