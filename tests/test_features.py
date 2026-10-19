from pathlib import Path

import pytest

from desktop.prompts import load_prompt
def test_prompt_files_are_external_and_editable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    prompt_dir = tmp_path / "prompts"
    prompt_dir.mkdir()
    (prompt_dir / "qa.md").write_text("自定义问答提示词", encoding="utf-8")
    monkeypatch.setenv("SUPERNOTE_PROMPT_DIR", str(prompt_dir))
    assert load_prompt("qa") == "自定义问答提示词"
