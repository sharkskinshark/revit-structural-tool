# -*- coding: utf-8 -*-
"""pyRevit pushbutton — 執行 scripts/01_read_project.py。

實作維持在 scripts/ 下；本檔僅為薄包裝，讀取該檔並以
__name__='__main__' 執行，使其進入專案資訊匯出流程。
"""
import io
import os

_target = os.path.abspath(os.path.join(
    os.path.dirname(__file__), '..', '..', '..', '..',
    'scripts', '01_read_project.py'))

with io.open(_target, 'r', encoding='utf-8') as _f:
    _code = _f.read()

exec(compile(_code, _target, 'exec'),
     {'__name__': '__main__', '__file__': _target})
