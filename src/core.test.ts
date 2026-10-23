import { describe, expect, it } from 'vitest';
import { defaults, proofRegion, resolveProof, snapshot, topoOrder, validOrder, validateProof, type Notebook, type Tag } from './core';

const unit = (id: string, tags: string[], content = id) => ({ id, domainId: 'd1', content, tags, annotation: '', position: { x: 0, y: 0 } });
const link = (id: string, source: string, target: string, direction: 'single' | 'both' = 'single') => ({ id, source, target, direction });
const note = (nodes: ReturnType<typeof unit>[], edges: ReturnType<typeof link>[]): Notebook => ({ kind: 'supernote', version: 1, id: 'notebook', title: '示例', domains: [{ id: 'd1', name: '示例域', position: { x: 0, y: 0 } }], nodes, edges, tags: structuredClone(defaults) as Tag[], proofs: [] });

// 需求中的示例：F1->U2，F1->U3->U4，U2&U4->U5，U5|F6->C7。
const sample = () => note(
  [unit('F1', ['fact']), unit('F6', ['fact']), unit('U2', ['inside']), unit('U3', ['inside']), unit('U4', ['inside']), unit('U5', ['inside']), unit('C7', ['conclusion'])],
  [link('e-u2', 'F1', 'U2'), link('e-u3', 'F1', 'U3'), link('e-u4', 'U3', 'U4'), link('e-u5a', 'U2', 'U5'), link('e-u5b', 'U4', 'U5'), link('e-c7a', 'U5', 'C7'), link('e-c7b', 'F6', 'C7')],
);

describe('推导闭包', () => {
  it('非结论单位要求全部必要条件，结论单位只取一种推导方式', () => {
    const result = resolveProof(sample(), 'C7');
    expect(result.error).toBe('');
    expect([...result.nodes].sort()).toEqual(['C7', 'F1', 'U2', 'U3', 'U4', 'U5']);
    expect(result.nodes).not.toContain('F6');
    expect([...result.edges].sort()).toEqual(['e-c7a', 'e-u2', 'e-u3', 'e-u4', 'e-u5a', 'e-u5b']);
    expect(validOrder(result.order, result.deps)).toBe(true);
  });

  it('切换结论的入连接后只保留该分支', () => {
    const result = resolveProof(sample(), 'C7', { C7: 'e-c7b' });
    expect([...result.nodes].sort()).toEqual(['C7', 'F6']);
    expect([...result.edges]).toEqual(['e-c7b']);
  });

  it('推导子图显示所有可能分支', () => {
    const region = proofRegion(sample(), 'C7');
    expect([...region].sort()).toEqual(['C7', 'F1', 'F6', 'U2', 'U3', 'U4', 'U5']);
  });

  it('循环依赖会报告错误而不是死循环', () => {
    const cyclic = note([unit('A', ['inside']), unit('B', ['inside'])], [link('e1', 'A', 'B'), link('e2', 'B', 'A')]);
    expect(resolveProof(cyclic, 'A').error).not.toBe('');
    expect(topoOrder(['A', 'B'], [['A', 'B'], ['B', 'A']])).toBeNull();
  });
});

describe('推导顺序', () => {
  it('并行分支可以互换，但不能颠倒依赖', () => {
    const result = resolveProof(sample(), 'C7');
    expect(validOrder(['F1', 'U3', 'U2', 'U4', 'U5', 'C7'], result.deps)).toBe(true);
    expect(validOrder(['F1', 'U4', 'U3', 'U2', 'U5', 'C7'], result.deps)).toBe(false);
  });

  it('拓扑排序把依赖放在前面', () => {
    const result = resolveProof(sample(), 'C7');
    const position = (id: string) => result.order.indexOf(id);
    expect(position('F1')).toBe(0);
    expect(position('U3')).toBeLessThan(position('U4'));
    expect(position('U2')).toBeLessThan(position('U5'));
    expect(position('U4')).toBeLessThan(position('U5'));
    expect(position('U5')).toBeLessThan(position('C7'));
  });
});

describe('推导快照', () => {
  it('保存全部必要单位并接受合法的自定义顺序', () => {
    const source = sample();
    const result = resolveProof(source, 'C7');
    const proof = snapshot(source, 'C7', result.nodes, result.edges, result.order);
    expect(proof.nodeIds).toHaveLength(6);
    expect(proof.order).toEqual(result.order);
    expect(validateProof(proof).order).toEqual(result.order);
  });

  it('顺序与依赖冲突时拒绝保存', () => {
    const source = sample();
    const result = resolveProof(source, 'C7');
    expect(() => snapshot(source, 'C7', result.nodes, result.edges, ['F1', 'U4', 'U3', 'U2', 'U5', 'C7'])).toThrow('推导顺序与连接方向冲突');
  });

  it('缺少 order 的旧版快照按节点顺序补齐', () => {
    const source = sample();
    const result = resolveProof(source, 'C7');
    const proof = snapshot(source, 'C7', result.nodes, result.edges, result.order);
    const legacy = { ...proof, order: undefined };
    expect(validateProof(legacy).order).toEqual(result.order);
  });
});
