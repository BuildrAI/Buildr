import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const projectRoot = path.resolve(serviceRoot, '../..');

test('代表代码地图的每个文件与函数符号存在于实际源码声明', () => {
  const mapFile = path.join(projectRoot, 'knowledge/code-map/skill-projection.md');
  const map = fs.readFileSync(mapFile, 'utf8');
  let checked = 0;
  for (const row of map.split('\n')) {
    const target = row.match(/\]\(([^)]+\.ts)\)/)?.[1];
    if (!row.startsWith('|') || !target) continue;
    const file = path.resolve(path.dirname(mapFile), target);
    const source = fs.readFileSync(file, 'utf8');
    const functions = new Set([...source.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm)].map((match) => match[1]));
    for (const symbol of row.split('|')[1].matchAll(/`([A-Za-z][A-Za-z0-9]+)`/g)) {
      assert.ok(functions.has(symbol[1]), `${file}: missing function ${symbol[1]}`);
      checked++;
    }
  }
  assert.ok(checked >= 15, '地图应保留可核验的代表方法，而不只是目录名');
});

test('代表图每个节点和关系均有可追溯说明，展示包含同一语义对象', () => {
  const base = path.join(projectRoot, 'knowledge/archify/flows/skill-projection');
  const source = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
  const evidence = fs.readFileSync(`${base}.md`, 'utf8');
  const html = fs.readFileSync(`${base}.html`, 'utf8');
  for (const item of [...source.nodes, ...source.flows]) {
    assert.ok(evidence.includes(`\`${item.id}\``), `未说明来源：${item.id}`);
    assert.ok(html.includes(item.id), `展示遗漏对象：${item.id}`);
  }
});
