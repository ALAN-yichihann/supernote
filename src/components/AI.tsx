import { useRef, useState } from 'react';
import { Bot, ChevronRight, ImagePlus, Network, Plus, Send, Square, X } from 'lucide-react';
import { api, isDesktop } from '../bridge';
import { useStore } from '../store';
import { normalizeOperations } from '../ai-ops';
import type { Operation } from '../core';

type Kind = 'qa' | 'graph';
interface ChatMessage { role: 'user' | 'assistant'; text: string; kind: Kind }

export default function AI({ width, setWidth, incomingNodes = [], onConsumeNodes }: { width: number; setWidth: (w: number) => void; incomingNodes?: string[]; onConsumeNodes?: (id?: string) => void }) {
  const { note } = useStore(); const [messages, setMessages] = useState<ChatMessage[]>([]); const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [attached, setAttached] = useState<string[]>([]); const [kind, setKind] = useState<Kind>('qa'); const id = useRef(crypto.randomUUID());
  const selected = [...new Set([...attached, ...incomingNodes])];

  // 图谱 AI 返回的操作先规范化为可执行命令，再校验笔记版本并一次性提交。
  function applyGraph(revision: number, raw: Operation[]) {
    try {
      const state = useStore.getState();
      if (state.revision !== revision) throw new Error('笔记在 AI 处理期间被修改，本次改动未应用');
      const operations = normalizeOperations(state.note, raw);
      if (!operations.length) throw new Error('没有可应用的图谱修改');
      state.operate(operations);
      return `\n\n✓ 已应用 ${operations.length} 项图谱修改。`;
    } catch (e) {
      return `\n\n⚠️ 图谱修改未应用：${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function ask() {
    const text = input.trim(); if (!text || busy) return;
    setInput(''); setMessages(m => [...m, { role: 'user', text, kind }]); setBusy(true);
    const revision = useStore.getState().revision;
    try {
      if (!isDesktop()) throw new Error('AI 对话需要桌面模式并完成 API 设置');
      const r = await api().start_ai(id.current, text, selected, [], note, messages.map(m => ({ role: m.role, content: m.text })), kind);
      if (!r.ok) throw new Error(r.error);
      let answer = '', operations: Operation[] = [];
      for (;;) {
        const events = await api().poll_ai(id.current);
        if (!events.ok) throw new Error(events.error);
        for (const event of events.value) {
          if (event.type === 'text') answer += event.text || '';
          if (event.type === 'operations' && event.operations) operations = event.operations;
          if (event.type === 'error') throw new Error(event.text);
        }
        if (events.value.some(e => e.type === 'done')) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (operations.length) answer += applyGraph(revision, operations);
      setMessages(m => [...m, { role: 'assistant', text: answer || '已完成。', kind }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', text: `⚠️ ${e instanceof Error ? e.message : String(e)}`, kind }]);
    } finally { setBusy(false); setAttached([]); }
  }

  return <aside className="ai-panel" style={{ width }}><div className="resize-handle ai-resize" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.max(320, Math.min(window.innerWidth - 100, window.innerWidth - e.clientX))); }}/><header className="ai-header"><div><span className="eyebrow"><Bot size={13}/> AI 学习助手</span><h2>{kind === 'graph' ? '整理知识图谱' : '问问你的知识'}</h2></div><button className="round-button" title="新建对话" onClick={() => { setMessages([]); setAttached([]); }}><Plus size={17}/></button></header>
    <div className="ai-modes"><button className={kind === 'qa' ? 'active' : ''} onClick={() => setKind('qa')}><Bot size={13}/>问答</button><button className={kind === 'graph' ? 'active' : ''} onClick={() => setKind('graph')}><Network size={13}/>图谱编辑</button></div>
    <div className="ai-messages">{!messages.length && (kind === 'qa' ? <div className="ai-welcome"><Bot size={36}/><h3>从一个问题开始</h3><p>在导图节点右键选择“添加到 AI 对话框”，再输入你的问题。</p><div className="suggestions"><button onClick={() => setInput('帮我解释当前导图中的核心结论')}>解释核心结论 <ChevronRight size={14}/></button><button onClick={() => setInput('检查这部分推导是否完整')}>检查推导 <ChevronRight size={14}/></button></div></div> : <div className="ai-welcome"><Network size={36}/><h3>把整理任务交给图谱 AI</h3><p>描述要新增或整理的内容，图谱 AI 会拆分单位、建立连接并自动应用修改。</p><div className="suggestions"><button onClick={() => setInput('把当前推导整理成基本单位并连接')}>整理当前推导 <ChevronRight size={14}/></button><button onClick={() => setInput('检查图谱中的孤立单位和重复内容')}>检查图谱结构 <ChevronRight size={14}/></button></div></div>)}{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><span className="message-role">{m.role === 'user' ? '你' : m.kind === 'graph' ? '图谱 AI' : 'AI'}</span><div>{m.text}</div></div>)}</div>
    <div className="ai-composer">{selected.length > 0 && <div className="attachments">{selected.map(nodeId => <span key={nodeId}>{note.nodes.find(n => n.id === nodeId)?.content.slice(0, 22)} <button onClick={() => { setAttached(a => a.filter(x => x !== nodeId)); onConsumeNodes?.(nodeId); }}><X size={12}/></button></span>)}</div>}<textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder={kind === 'graph' ? '描述要整理的图谱内容，Enter 发送' : '输入问题，Enter 发送'}/><div className="composer-actions"><label title="添加图片"><ImagePlus size={17}/><input type="file" accept="image/*" hidden/></label><span className="composer-tip">{kind === 'graph' ? '修改会自动写入当前笔记' : '右键节点添加 · Shift+Enter 换行'}</span>{busy ? <button className="send-button stop" onClick={() => api().cancel_ai(id.current)}><Square size={15}/></button> : <button className="send-button" disabled={!input.trim()} onClick={() => { onConsumeNodes?.(); ask(); }}><Send size={15}/></button>}</div></div></aside>;
}
