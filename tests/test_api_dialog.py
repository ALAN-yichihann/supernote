import json

import webview

from desktop.main import API


class FakeWindow:
    """模拟 pywebview 6 的窗口：文件对话框返回路径元组。"""

    def __init__(self, result):
        self.result = result
        self.calls = []

    def create_file_dialog(self, dialog_type, **kwargs):
        self.calls.append(dialog_type)
        return self.result


def test_save_file_accepts_path_tuple(tmp_path):
    target = tmp_path / 'note.json'
    api = API()
    api._window = FakeWindow((str(target),))
    result = api.save_file({'kind': 'supernote', 'version': 1, 'title': '测试'})
    assert result == {'ok': True, 'value': True}
    assert api._window.calls == [webview.FileDialog.SAVE]
    assert json.loads(target.read_text(encoding='utf-8'))['title'] == '测试'


def test_save_file_cancel_keeps_untouched(tmp_path):
    api = API()
    api._window = FakeWindow(None)
    assert api.save_file({'title': '测试'}) == {'ok': True, 'value': False}
    assert api._storage.path is None


def test_open_file_accepts_path_tuple(tmp_path):
    target = tmp_path / 'note.json'
    target.write_text('{"version": 1}', encoding='utf-8')
    api = API()
    api._window = FakeWindow((str(target),))
    assert api.open_file() == {'ok': True, 'value': {'version': 1}}
    assert api._window.calls == [webview.FileDialog.OPEN]
