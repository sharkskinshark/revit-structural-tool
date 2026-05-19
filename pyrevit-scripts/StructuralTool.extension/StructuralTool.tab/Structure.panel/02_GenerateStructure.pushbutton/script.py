# -*- coding: utf-8 -*-
"""pyRevit pushbutton — 執行 scripts/02_generate_structure.py。

實作維持在 scripts/ 下（同時供 CLI / --dry-run 使用），本檔僅為薄包裝：
讀取該檔並以 __name__='__main__' 執行，使其進入 Revit 生成流程。
"""
import io
import os

_target = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '..', '..', '..', '..',
    'scripts', '02_generate_structure.py'))

with io.open(_target, 'r', encoding='utf-8') as _f:
    _code = _f.read()

exec(compile(_code, _target, 'exec'),
     {'__name__': '__main__', '__file__': _target})
