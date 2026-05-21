# -*- coding: utf-8 -*-
"""Re-enable join at both ends for all structural beams.

與「禁用梁接合」相對 —— 把所有結構梁的兩端接合重新開啟，
Revit 會重新計算 cope/mitre 切角，梁端與柱齊整。
出圖給結構技師前執行此工具。

注意：重新計算近千支梁的接合是重運算，執行時 Revit 會「沒有回應」
一段時間（正常），完成後即恢復。
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
    '將對 {0} 支結構梁「重新啟用」兩端接合（cope/mitre）。\n\n'
    'Revit 會重新計算梁端切角 → 梁端與柱齊整、出圖乾淨。\n\n'
    '注意：\n'
    '• 此操作會重設所有梁的接合，若你曾手動調整過個別梁\n'
    '  的接合，會一併被覆蓋。\n'
    '• 重算近千支梁的接合需時間，Revit 會短暫「沒有回應」。\n\n'
    '是否繼續？'.format(len(beams)),
    options=['繼續', '取消'])
if confirm != '繼續':
    raise SystemExit

ok = 0
fail = 0
with revit.Transaction('啟用梁端接合'):
    for b in beams:
        try:
            DB.Structure.StructuralFramingUtils.AllowJoinAtEnd(b, 0)
            DB.Structure.StructuralFramingUtils.AllowJoinAtEnd(b, 1)
            ok += 1
        except Exception:
            fail += 1

forms.alert(
    '完成！\n\n啟用接合：{0} 支\n失敗：{1} 支\n\n'
    '梁端 cope/mitre 切角已重新計算。\n'
    '出圖前記得存檔。'.format(ok, fail),
    title='完成')
print('啟用梁端接合：{0} 支 OK / {1} 失敗'.format(ok, fail))
