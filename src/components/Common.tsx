import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X } from 'lucide-react';
export function Markdown({ children }: { children: string }) { return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown></div>; }
export function IconButton({ title, children, onClick, disabled = false, active = false }: { title: string; children: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean }) { return <button className={`icon-button ${active ? 'active' : ''}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-shade" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><IconButton title="关闭弹窗" onClick={onClose}><X size={19}/></IconButton></header>{children}</section></div>; }
export function ResizeHandle({ side, setWidth }: { side: 'left' | 'right'; setWidth: (w: number) => void }) { return <div className={`resize-handle ${side}`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.max(330, Math.min(window.innerWidth - 110, side === 'left' ? window.innerWidth - e.clientX : e.clientX - 84))); }} onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)} />; }
