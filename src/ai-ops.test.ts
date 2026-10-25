import { describe, expect, it } from 'vitest';
import { normalizeOperations } from './ai-ops';
import { applyOperations, defaults, type Notebook } from './core';

const base = (): Notebook => ({
  kind: 'supernote', version: 1, id: 'notebook', title: '测试', domains: [{ id: 'd1', name: '域一', position: { x: 0, y: 0 } }],
  nodes: [{ id: 'u1', domainId: 'd1', content: '已有单位', tags: ['fact'], annotation: '', position: { x: 40, y: 80 } }],
  edges: [], tags: structuredClone(defaults), proofs: [],
});

const withLink = (): Notebook => {
  const note = base();
  note.nodes.push({ id: 'u2', domainId: 'd1', content: '已有结论', tags: ['conclusion'], annotation: '', position: { x: 420, y: 80 } });
  note.edges.push({ id: 'e1', source: 'u1', target: 'u2', direction: 'single' });
  return note;
};

describe('AI 图谱操作规范化', () => {
  it('为临时 ID 的域、单位和连接补全真实 ID、坐标与标签', () => {
    const operations = normalizeOperations(base(), [
      { action: 'put', entity: 'domains', id: 'new-d', value: { name: '新域' } },
      { action: 'put', entity: 'nodes', id: 'new-1', value: { domainId: 'new-d', content: '新事实', tags: ['基本事实'] } },
      { action: 'put', entity: 'nodes', id: 'new-2', value: { domainId: 'new-d', content: '新结论', tags: ['结论'] } },
      { action: 'put', entity: 'edges', id: 'new-e', value: { source: 'new-1', target: 'new-2', direction: 'single' } },
    ]);
    const next = applyOperations(base(), operations);
    expect(next.domains).toHaveLength(2);
    expect(next.nodes).toHaveLength(3);
    expect(next.edges).toHaveLength(1);
    const edge = next.edges[0];
    expect(next.nodes.find(unit => unit.id === edge.source)?.content).toBe('新事实');
    expect(next.nodes.find(unit => unit.id === edge.source)?.tags).toContain('fact');
    expect(next.nodes.find(unit => unit.id === edge.target)?.tags).toContain('conclusion');
  });

  it('修改已有单位时保留位置和所属域', () => {
    const source = base();
    const operations = normalizeOperations(source, [{ action: 'put', entity: 'nodes', id: 'u1', value: { content: '更新内容', tags: ['结论'] } }]);
    const next = applyOperations(source, operations);
    expect(next.nodes[0].content).toBe('更新内容');
    expect(next.nodes[0].position).toEqual(source.nodes[0].position);
    expect(next.nodes[0].domainId).toBe('d1');
    expect(next.nodes[0].tags).toEqual(['conclusion']);
  });

  it('跳过重复连接并忽略无效操作', () => {
    const source = withLink();
    const operations = normalizeOperations(source, [
      { action: 'put', entity: 'edges', id: 'new-e', value: { source: 'u2', target: 'u1', direction: 'single' } },
      { action: 'put', entity: 'nodes', id: 'bad', value: { domainId: 'missing', content: '无归属' } },
      { action: 'delete', entity: 'unknown', id: 'x' },
    ]);
    expect(operations).toHaveLength(0);
  });

  it('删除操作保留真实 ID', () => {
    const source = withLink();
    const operations = normalizeOperations(source, [{ action: 'delete', entity: 'edges', id: 'e1' }]);
    expect(operations).toEqual([{ action: 'delete', entity: 'edges', id: 'e1' }]);
    expect(applyOperations(source, operations).edges).toHaveLength(0);
  });
});
