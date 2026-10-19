"""从项目外部 Markdown 文件加载可编辑的 AI 提示词。"""
from __future__ import annotations

import os
from pathlib import Path


def load_prompt(name: str) -> str:
    """读取 qa.md 或 graph.md；修改文件后下次调用会自动读取新内容。"""
    if name not in {"qa", "graph"}:
        raise ValueError("未知提示词类型")
    candidates = []
    configured = os.environ.get("SUPERNOTE_PROMPT_DIR")
    if configured:
        candidates.append(Path(configured) / f"{name}.md")
    candidates.extend((Path.cwd() / "prompts" / f"{name}.md", Path(__file__).resolve().parents[1] / "prompts" / f"{name}.md"))
    for path in candidates:
        if path.is_file():
            return path.read_text(encoding="utf-8")
    raise FileNotFoundError(f"找不到提示词文件：{name}.md")
