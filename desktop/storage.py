"""笔记与设置的安全本地存储。"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

import keyring


class Storage:
    def __init__(self) -> None: self.path: Path | None = None
    def read(self, path: str) -> Any:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('version') != 1: raise ValueError('文件格式版本不受支持')
        return data
    def write(self, data: dict[str, Any], path: str | None = None) -> str:
        target = Path(path) if path else self.path
        if target is None: raise ValueError('尚未选择保存位置')
        target.parent.mkdir(parents=True, exist_ok=True); fd, temp = tempfile.mkstemp(prefix=f'.{target.name}.', suffix='.tmp', dir=target.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as handle: json.dump(data, handle, ensure_ascii=False, indent=2); handle.flush(); os.fsync(handle.fileno())
            os.replace(temp, target)
        except Exception: Path(temp).unlink(missing_ok=True); raise
        self.path = target; return str(target)
    def set_secret(self, name: str, value: str) -> None: keyring.set_password('supernote', name, value)
    def get_secret(self, name: str) -> str | None: return keyring.get_password('supernote', name)
