import { useState } from 'react';
import { type Unit, type Operation } from '../core';
import { safely, useStore } from '../store';
import { Markdown, Modal } from './Common';
export interface EditDraft { unit: Unit; extra?: Operation[]; isNew?: boolean }
export default function Editor({ draft, close }: { draft: EditDraft; close: () => void }) {
  const { note, locked, operate } = useStore(); const [unit, setUnit] = useState(structuredClone(draft.unit));
  function toggle(id: string) { const pairs: Record<string, string> = { fact: 'conclusion', conclusion: 'fact', inside: 'outside', outside: 'inside' }; setUnit({ ...unit, tags: unit.tags.includes(id) ? unit.tags.filter(t => t !== id) : [...unit.tags.filter(t => t !== pairs[id]), id] }); }
  return <Modal title={draft.isNew ? '添加基本单位' : '编辑基本单位'} onClose={close}><div className="editor-columns"><label>Markdown 内容<textarea autoFocus value={unit.content} onChange={e => setUnit({ ...unit, content: e.target.value })} placeholder={'写下一个事实、步骤或结论…\n支持 $E=mc^2$ 与 Markdown'}/></label><div className="preview"><span className="eyebrow">实时预览</span><Markdown>{unit.content || '内容预览'}</Markdown></div></div><label>所属域<select value={unit.domainId} onChange={e => setUnit({ ...unit, domainId: e.target.value })}>{note.domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>批注<textarea rows={2} value={unit.annotation} placeholder="可选，默认折叠显示" onChange={e => setUnit({ ...unit, annotation: e.target.value })}/></label><footer><div className="tag-list">{note.tags.map(t => <button key={t.id} className={`tag ${unit.tags.includes(t.id) ? 'selected' : ''}`} style={{ '--tag': t.color } as React.CSSProperties} onClick={() => toggle(t.id)}>{t.name}</button>)}</div><button className="primary" disabled={locked || !unit.content.trim()} onClick={() => safely(() => { operate([{ action: 'put', entity: 'nodes', id: unit.id, value: unit }, ...(draft.extra || [])]); close(); })}>保存</button></footer></Modal>;
}
