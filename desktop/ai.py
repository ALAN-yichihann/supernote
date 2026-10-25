"""基于可编辑 Markdown 提示词的 Chat Completions 会话。"""
from __future__ import annotations

import json
import re
import threading
from dataclasses import dataclass, field
from queue import Empty, Queue
from typing import Any

import httpx

from .prompts import load_prompt


def iter_json_objects(text: str) -> list[str]:
    """找出文本中括号配平的 JSON 对象，跳过字符串内的花括号。"""
    blocks: list[str] = []
    for start, char in enumerate(text):
        if char != '{':
            continue
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            current = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif current == '\\':
                    escaped = True
                elif current == '"':
                    in_string = False
                continue
            if current == '"':
                in_string = True
            elif current == '{':
                depth += 1
            elif current == '}':
                depth -= 1
                if depth == 0:
                    blocks.append(text[start:index + 1])
                    break
    return blocks


def extract_operations(text: str) -> list[dict[str, Any]]:
    """从回答中提取事务块，兼容代码块标记、大小写、无标记 JSON 与前后说明。"""
    candidates = [match.group(1) for match in re.finditer(r"```(?:json|jsonc)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)]
    candidates.extend(iter_json_objects(text))
    for source in candidates:
        try:
            data = json.loads(source)
        except json.JSONDecodeError:
            continue
        operations = data.get("operations") if isinstance(data, dict) else None
        if isinstance(operations, list) and all(isinstance(item, dict) for item in operations):
            return operations
    return []


@dataclass
class Session:
    events: Queue[dict[str, Any]] = field(default_factory=Queue)
    stop: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None


class AIService:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}

    def start(self, ident: str, endpoint: str, key: str, model: str, prompt: str, note: dict[str, Any], kind: str = "qa") -> None:
        session = Session()
        self.sessions[ident] = session

        def run() -> None:
            parts: list[str] = []
            try:
                body = {"model": model, "stream": True, "messages": [{"role": "system", "content": load_prompt(kind)}, {"role": "user", "content": f"当前笔记：{json.dumps(note, ensure_ascii=False)}\n\n用户问题：{prompt}"}]}
                headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                with httpx.Client(timeout=90) as client, client.stream("POST", endpoint.rstrip("/") + "/chat/completions", headers=headers, json=body) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if session.stop.is_set():
                            break
                        if not line.startswith("data:"):
                            continue
                        value = line[5:].strip()
                        if value == "[DONE]":
                            break
                        try:
                            delta = json.loads(value)["choices"][0].get("delta", {}).get("content", "")
                        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
                            continue
                        if delta:
                            parts.append(delta)
                            session.events.put({"type": "text", "text": delta})
                operations = extract_operations("".join(parts))
                if operations:
                    session.events.put({"type": "operations", "operations": operations})
                session.events.put({"type": "done"})
            except Exception as exc:  # noqa: BLE001 网络错误需要返回到界面
                session.events.put({"type": "error", "text": f"AI 请求失败：{exc}"})

        session.thread = threading.Thread(target=run, daemon=True)
        session.thread.start()

    def poll(self, ident: str) -> list[dict[str, Any]]:
        session = self.sessions[ident]
        events: list[dict[str, Any]] = []
        while True:
            try:
                events.append(session.events.get_nowait())
            except Empty:
                return events

    def cancel(self, ident: str) -> None:
        if ident in self.sessions:
            self.sessions[ident].stop.set()
