import json

from desktop.storage import Storage


def test_atomic_roundtrip(tmp_path):
    store = Storage(); path = tmp_path / 'note.json'; data = {'kind': 'supernote', 'version': 1, 'title': '测试'}
    assert store.write(data, str(path)) == str(path)
    assert json.loads(path.read_text(encoding='utf-8')) == data
    assert store.read(str(path)) == data
