"""pywebview 桌面入口及 JavaScript 文件 API。"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import webview

from .ai import AIService
from .storage import Storage


class API:
    """暴露给前端的接口。

    内部对象一律使用下划线前缀：pywebview 会递归扫描公开属性并尝试读取，
    窗口对象带有 WebView2 控件，跨线程读取其属性会触发 COM 异常，且会把
    存储与 AI 服务的内部方法一并暴露给页面。
    """

    def __init__(self, dev: bool = False) -> None:
        self._storage = Storage()
        self._ai = AIService()
        self._window: Any = None
        self.dev = dev
        self.dirty_value = False

    @staticmethod
    def _selected_path(result: Any) -> Path | None:
        """pywebview 6 的文件对话框返回路径元组，这里同时兼容字符串。"""
        if not result:
            return None
        value = result[0] if isinstance(result, (list, tuple)) else result
        return Path(value) if value else None

    def open_file(self) -> dict[str, Any]:
        path = self._selected_path(self._window.create_file_dialog(webview.FileDialog.OPEN, file_types=('Supernote JSON (*.json)', '所有文件 (*.*)')))
        if path is None:
            return {'ok': True, 'value': None}
        try:
            return {'ok': True, 'value': self._storage.read(str(path))}
        except Exception as exc:  # noqa: BLE001 统一转为界面错误
            return {'ok': False, 'error': f'打开失败：{exc}'}

    def save_file(self, data: dict[str, Any], save_as: bool = False) -> dict[str, Any]:
        try:
            if save_as or self._storage.path is None:
                path = self._selected_path(self._window.create_file_dialog(webview.FileDialog.SAVE, save_filename=f"{data.get('title', '笔记')}.json", file_types=('Supernote JSON (*.json)',)))
                if path is None:
                    return {'ok': True, 'value': False}
                self._storage.path = path
            self._storage.write(data)
            self.dirty_value = False
            return {'ok': True, 'value': True}
        except Exception as exc:  # noqa: BLE001 统一转为界面错误
            return {'ok': False, 'error': f'保存失败：{exc}'}

    def save_text(self, text: str, filename: str = '推导.md') -> dict[str, Any]:
        try:
            path = self._selected_path(self._window.create_file_dialog(webview.FileDialog.SAVE, save_filename=filename, file_types=('Markdown (*.md)',)))
            if path is None:
                return {'ok': True, 'value': False}
            path.write_text(text, encoding='utf-8', newline='\n')
            return {'ok': True, 'value': True}
        except Exception as exc:  # noqa: BLE001 统一转为界面错误
            return {'ok': False, 'error': f'导出失败：{exc}'}

    def reset_file(self) -> dict[str, Any]:
        self._storage.path = None
        self.dirty_value = False
        return {'ok': True, 'value': None}

    def dirty(self, value: bool) -> None:
        self.dirty_value = value

    def close_window(self) -> None:
        self._window.destroy()

    def get_settings(self) -> dict[str, Any]:
        return {'ok': True, 'value': {ident: {'endpoint': self._storage.get_secret(f'{ident}_endpoint') or '', 'model': self._storage.get_secret(f'{ident}_model') or '', 'hasKey': bool(self._storage.get_secret(f'{ident}_key'))} for ident in ('qa', 'graph')}}

    def save_settings(self, value: dict[str, Any]) -> dict[str, Any]:
        for ident in ('qa', 'graph'):
            entry = value.get(ident, {})
            self._storage.set_secret(f'{ident}_endpoint', str(entry.get('endpoint', '')))
            self._storage.set_secret(f'{ident}_model', str(entry.get('model', '')))
            if entry.get('key'):
                self._storage.set_secret(f'{ident}_key', str(entry['key']))
        return {'ok': True, 'value': None}

    def start_ai(self, ident: str, prompt: str, nodes: list[str], images: list[str], note: dict[str, Any], history: list[dict[str, str]], kind: str = 'qa', level: str = 'normal') -> dict[str, Any]:
        del nodes, images, history
        kind = kind if kind in ('qa', 'graph') else 'qa'
        level = level if level in ('brief', 'normal', 'detailed') else 'normal'
        label = '思维导图' if kind == 'graph' else '问答'
        endpoint = self._storage.get_secret(f'{kind}_endpoint') or ''
        model = self._storage.get_secret(f'{kind}_model') or ''
        key = self._storage.get_secret(f'{kind}_key') or ''
        if not endpoint or not model or not key:
            return {'ok': False, 'error': f'请先配置{label} AI 的端点、模型和 KEY'}
        self._ai.start(ident, endpoint, key, model, prompt, note, kind, level)
        return {'ok': True, 'value': None}

    def poll_ai(self, ident: str) -> dict[str, Any]:
        return {'ok': True, 'value': self._ai.poll(ident)}

    def cancel_ai(self, ident: str) -> dict[str, Any]:
        self._ai.cancel(ident)
        return {'ok': True, 'value': None}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dev', action='store_true')
    args = parser.parse_args()
    api = API(args.dev)
    url = 'http://127.0.0.1:5173' if args.dev else str(Path(__file__).resolve().parents[1] / 'dist' / 'index.html')
    window = webview.create_window('Supernote', url, js_api=api, width=1440, height=900, min_size=(1000, 650))
    api._window = window
    webview.start(debug=args.dev)


if __name__ == '__main__':
    main()
