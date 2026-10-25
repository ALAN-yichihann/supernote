from desktop.ai import extract_operations


def test_extract_operations_from_json_block():
    text = '整理结果：\n\n```json\n{"summary": "新增一步", "operations": [{"action": "put", "entity": "nodes", "id": "n1", "value": {"content": "a"}}]}\n```'
    assert extract_operations(text) == [{"action": "put", "entity": "nodes", "id": "n1", "value": {"content": "a"}}]


def test_ignore_missing_or_invalid_block():
    assert extract_operations('没有事务块') == []
    assert extract_operations('```json\n{"summary": "只有说明"}\n```') == []
    assert extract_operations('```json\nnot json\n```') == []
    assert extract_operations('```json\n{"operations": "string"}\n```') == []
