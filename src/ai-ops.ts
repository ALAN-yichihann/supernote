import { uid, type Domain, type Link, type Notebook, type Operation, type Unit } from './core';

// AI 输出的操作可能使用临时 ID、省略坐标或使用中文标签名，这里统一补全为可执行操作。
interface RawOperation { action?: unknown; entity?: unknown; id?: unknown; value?: unknown }
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

function nodePosition(units: Unit[], domainId: string) {
  const siblings = units.filter(unit => unit.domainId === domainId);
  const right = siblings.reduce((max, unit) => Math.max(max, unit.position.x), 0);
  return { x: siblings.length ? right + 380 : 40, y: 80 + (siblings.length % 4) * 120 };
}
function domainPosition(domains: Domain[]) {
  const right = domains.reduce((max, domain) => Math.max(max, domain.position.x), 0);
  return { x: domains.length ? right + 760 : 60, y: 60 };
}

export function normalizeOperations(note: Notebook, raw: unknown): Operation[] {
  const items = (Array.isArray(raw) ? raw : []).filter(object) as RawOperation[];
  const operations: Operation[] = [];
  const idMap = new Map<string, string>();
  const mapId = (id: unknown) => idMap.get(String(id)) ?? String(id);
  const domains: Domain[] = [...note.domains];
  const units: Unit[] = [...note.nodes];
  const links: Link[] = [...note.edges];
  const resolveTag = (tag: string) => note.tags.find(defined => defined.id === tag)?.id ?? note.tags.find(defined => defined.name === tag)?.id;

  // 域优先，保证单位可以引用新建的域。
  for (const item of items) {
    if (item.action !== 'put' || item.entity !== 'domains' || !item.id || !object(item.value)) continue;
    const id = String(item.id);
    const existing = domains.find(domain => domain.id === id);
    if (existing) {
      const value = { ...existing, name: text(item.value.name, existing.name) };
      domains[domains.indexOf(existing)] = value;
      operations.push({ action: 'put', entity: 'domains', id, value });
      continue;
    }
    const nextId = uid();
    idMap.set(id, nextId);
    const domain: Domain = { id: nextId, name: text(item.value.name, 'AI 整理'), position: domainPosition(domains) };
    domains.push(domain);
    operations.push({ action: 'put', entity: 'domains', id: nextId, value: domain });
  }

  for (const item of items) {
    if (item.action !== 'put' || item.entity !== 'nodes' || !item.id || !object(item.value)) continue;
    const id = String(item.id), value = item.value;
    const tags = (Array.isArray(value.tags) ? value.tags : []).map(String).map(resolveTag).filter((tag): tag is string => !!tag);
    const existing = units.find(unit => unit.id === id);
    const domainId = mapId(value.domainId ?? existing?.domainId ?? '');
    if (!domains.some(domain => domain.id === domainId)) continue;
    if (existing) {
      const unit: Unit = {
        ...existing,
        content: typeof value.content === 'string' ? value.content : existing.content,
        tags: tags.length ? tags : existing.tags,
        annotation: typeof value.annotation === 'string' ? value.annotation : existing.annotation,
        domainId,
      };
      units[units.indexOf(existing)] = unit;
      operations.push({ action: 'put', entity: 'nodes', id, value: unit });
    } else {
      const nextId = uid();
      idMap.set(id, nextId);
      const unit: Unit = { id: nextId, domainId, content: text(value.content), tags: tags.length ? tags : ['inside'], annotation: text(value.annotation), position: nodePosition(units, domainId) };
      units.push(unit);
      operations.push({ action: 'put', entity: 'nodes', id: nextId, value: unit });
    }
  }

  const pairs = new Set(links.map(link => [link.source, link.target].sort().join('|')));
  for (const item of items) {
    if (item.action !== 'put' || item.entity !== 'edges' || !object(item.value)) continue;
    const existing = links.find(link => link.id === String(item.id));
    if (existing) {
      const value = { ...existing, direction: item.value.direction === 'both' ? 'both' as const : 'single' as const };
      links[links.indexOf(existing)] = value;
      operations.push({ action: 'put', entity: 'edges', id: value.id, value });
      continue;
    }
    const source = mapId(item.value.source), target = mapId(item.value.target);
    if (!source || !target || source === target) continue;
    if (!units.some(unit => unit.id === source) || !units.some(unit => unit.id === target)) continue;
    const key = [source, target].sort().join('|');
    if (pairs.has(key)) continue;
    pairs.add(key);
    const link: Link = { id: uid(), source, target, direction: item.value.direction === 'both' ? 'both' : 'single' };
    links.push(link);
    operations.push({ action: 'put', entity: 'edges', id: link.id, value: link });
  }

  for (const item of items) {
    if (item.action !== 'delete' || !item.id) continue;
    const entity = String(item.entity);
    if (!['domains', 'nodes', 'edges', 'tags'].includes(entity)) continue;
    operations.push({ action: 'delete', entity: entity as 'domains' | 'nodes' | 'edges' | 'tags', id: mapId(item.id) });
  }

  return operations.slice(0, 200);
}
