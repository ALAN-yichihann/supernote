from desktop.ai import build_system_prompt


def test_level_hints_are_appended_to_qa_prompt():
    assert '简略' in build_system_prompt('qa', 'brief')
    assert '详细' in build_system_prompt('qa', 'detailed')
    assert '中等' in build_system_prompt('qa')
    assert '不要只列公式' in build_system_prompt('qa', 'brief')


def test_unknown_level_falls_back_to_normal():
    assert '中等' in build_system_prompt('qa', 'unknown')


def test_graph_prompt_ignores_level():
    assert build_system_prompt('graph', 'brief') == build_system_prompt('graph', 'detailed')
