import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourceControlCache} from '../src/features/code/source-control-cache.ts';

const PREFIX = 'buildr:source-control-cache:v1:';
const MAX_BYTES = 2 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
const TIME = Date.parse('2026-10-13T10:00:00.000Z');
const iso = time => new Date(time).toISOString();
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

/** @returns {import('../src/features/code/api/code-api.ts').CodeSourceControlResponse} */
function fixture(time = TIME) {
  const source = {repositoryId:'product', worktreeId:'main-worktree', taskId:null, commitHash:null,
    checkoutId:'checkout-product', worktreeGroupId:'group-product', location:'/workspace/product', version:'source-v1', kind:'default'};
  const diagnostic = {code:'code_source_control_partial', message:'部分来源暂不可用', repositoryId:'product', worktreeId:'main-worktree'};
  const change = {repositoryId:'product', worktreeId:'main-worktree', area:'unstaged', path:'src/cache.ts', previousPath:'src/old.ts',
    kind:'tracked', status:'renamed', additions:3, deletions:1, preview:null, previewTruncated:false};
  const refs = {branch:'main', head:'abc123', upstream:'origin/main', ahead:1, behind:2};
  const worktreeCoverage = {limit:128, total:1, read:1, truncated:false};
  return {readAt:iso(time), observedRevision:'catalog-revision', coverage:{limit:128, truncated:false, nextCursor:null}, diagnostics:[{...diagnostic}],
    selectedRepositoryIds:['product'], selectedWorktreeIds:['main-worktree'], selectedWorktrees:[{repositoryId:'product', worktreeId:'main-worktree'}],
    scopeReason:'all', worktreeCoverage:{...worktreeCoverage}, repositories:[{
      id:'product', code:'product', name:'产品', location:'/workspace/product', available:true, gitId:'git-product', source:{...source},
      status:'partial', clone:{state:'failed', diagnostic:'克隆失败', startedAt:iso(time - 1000)}, ...refs,
      fileCount:1, changes:[{...change}], observedRevision:'repository-revision', diagnostics:[{...diagnostic}], worktreeCount:1,
      worktreeCoverage:{...worktreeCoverage}, worktrees:[{
        worktreeId:'main-worktree', name:'主工作树', location:'/workspace/product', isMain:true, isRegistered:true, available:true,
        source:{...source}, status:'partial', ...refs, taskId:null, taskTitle:null, taskDiagnostic:null,
        fileCount:1, changes:[{...change}], observedRevision:'worktree-revision', readAt:iso(time),
        coverage:{fileLimit:1000, truncated:false}, diagnostics:[{...diagnostic}],
      }],
    }]};
}
const envelope = (data = fixture(), workspaceId = 'a', savedAt = TIME) => ({version:1, workspaceId, savedAt, data});
const store = (storage, value, workspaceId = 'a') => storage.setItem(PREFIX + workspaceId, JSON.stringify(value));

function setup() {
  const storage = new MemoryStorage();
  let time = TIME;
  return {storage, cache:createSourceControlCache('a', storage, () => time), advance:amount => { time += amount; }};
}

test('完整元信息往返保留原观察、真实来源、标识、变更及诊断，读取返回独立对象', () => {
  const {storage, cache} = setup(), data = fixture();
  assert.equal(cache.read(), null);
  assert.equal(cache.write(data), undefined);
  assert.deepEqual(cache.read(), data);
  assert.deepEqual(JSON.parse(storage.getItem(PREFIX + 'a')), envelope(data));
  const first = cache.read(); first.repositories[0].worktrees[0].changes.length = 0;
  assert.deepEqual(cache.read(), data);
  assert.equal(createSourceControlCache('b', storage, () => TIME).read(), null);
});

test('空目录和不可用来源的合法空值可往返', () => {
  const {cache} = setup(), data = fixture();
  Object.assign(data.repositories[0], {source:null, gitId:null, clone:null, available:false, status:'unavailable', branch:null, head:null,
    upstream:null, ahead:null, behind:null, fileCount:null, observedRevision:null, changes:[], worktrees:[], worktreeCount:null,
    worktreeCoverage:{limit:128, total:null, read:0, truncated:false}});
  data.selectedWorktreeIds = []; data.selectedWorktrees = [];
  cache.write(data); assert.deepEqual(cache.read(), data);
  data.repositories = []; data.selectedRepositoryIds = [];
  data.worktreeCoverage = {limit:128, total:0, read:0, truncated:false};
  cache.write(data); assert.deepEqual(cache.read(), data);
});

test('真实类型允许省略的来源和诊断工作树标识仍可往返', () => {
  const {cache} = setup(), data = fixture();
  delete data.repositories[0].source.worktreeId;
  delete data.repositories[0].worktrees[0].source.worktreeId;
  delete data.diagnostics[0].worktreeId;
  cache.write(data); assert.deepEqual(cache.read(), data);
});

test('跨时区观察时间按实际时间比较而不是字符串排序', () => {
  const {cache, storage} = setup(), newer = fixture();
  newer.readAt = '2026-10-13T11:00:00.000+01:00'; cache.write(newer);
  const previous = storage.getItem(PREFIX + 'a');
  const older = fixture(TIME - 1000); older.readAt = '2026-10-13T18:59:59.000+09:00';
  cache.write(older); assert.equal(storage.getItem(PREFIX + 'a'), previous);
});

test('读写均递归投影白名单，正文、preview和任意敏感字段不会进入结果', () => {
  const {cache, storage} = setup(), data = fixture();
  const inject = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(inject); return; }
    Object.values(value).forEach(inject);
    Object.assign(value, {content:'SECRET_BODY', token:'SECRET_TOKEN', imagePreview:{content:'SECRET_IMAGE'}});
  };
  inject(data);
  for (const change of [data.repositories[0].changes[0], data.repositories[0].worktrees[0].changes[0]]) {
    change.preview = 'SECRET_PREVIEW'; change.previewTruncated = true;
  }
  cache.write(data);
  assert.doesNotMatch(storage.getItem(PREFIX + 'a'), /SECRET/);
  assert.deepEqual(cache.read(), fixture());
  store(storage, {...envelope(data), secret:'SECRET_ENVELOPE'});
  assert.deepEqual(cache.read(), fixture());
});

test('损坏、未知格式、错工作空间、未来时间及过期数据均忽略并删除', async t => {
  const cases = {
    '损坏JSON': () => '{',
    'null': () => 'null',
    '数组': () => '[]',
    '缺版本': entry => { delete entry.version; },
    '未知版本': entry => { entry.version = 2; },
    '工作空间不匹配': entry => { entry.workspaceId = 'b'; },
    '保存时间未来': entry => { entry.savedAt = TIME + 1; },
    '保存时间负数': entry => { entry.savedAt = -1; },
    '保存时间非数字': entry => { entry.savedAt = iso(TIME); },
    '保存时间过期': entry => { entry.savedAt = TIME - DAY; },
    '观察时间未来': entry => { entry.data.readAt = iso(TIME + 1); },
    '观察时间非法': entry => { entry.data.readAt = 'not-a-time'; },
    '观察时间非时间串': entry => { entry.data.readAt = '2026'; },
    '观察时间过期但刚保存': entry => { entry.data.readAt = iso(TIME - DAY); },
    '工作树观察时间未来': entry => { entry.data.repositories[0].worktrees[0].readAt = iso(TIME + 1); },
    '缺data': entry => { delete entry.data; },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, () => {
    const {cache, storage} = setup(), entry = envelope();
    const raw = mutate(entry); storage.setItem(PREFIX + 'a', raw ?? JSON.stringify(entry));
    assert.doesNotThrow(() => assert.equal(cache.read(), null));
    assert.equal(storage.getItem(PREFIX + 'a'), null);
  });
});

test('未知对象必须具有完整可用结构，缺失或错误嵌套字段不能进入页面', async t => {
  const cases = {
    '目录缺少诊断': data => { delete data.diagnostics; },
    '目录诊断不是列表': data => { data.diagnostics = {}; },
    '观察版本缺失': data => { delete data.observedRevision; },
    '覆盖范围缺失': data => { delete data.coverage; },
    '覆盖游标非法': data => { data.coverage.nextCursor = {}; },
    '选择项不是字符串': data => { data.selectedRepositoryIds = [12]; },
    '工作树选择缺失': data => { delete data.selectedWorktreeIds; },
    '选择对象不完整': data => { data.selectedWorktrees = [{repositoryId:'product'}]; },
    '仓库非列表': data => { data.repositories = {}; },
    '仓库为空值': data => { data.repositories = [null]; },
    '仓库缺少变更': data => { delete data.repositories[0].changes; },
    '仓库缺少工作树': data => { delete data.repositories[0].worktrees; },
    '仓库标识非法': data => { data.repositories[0].gitId = {}; },
    '仓库状态未知': data => { data.repositories[0].status = 'ready'; },
    '来源缺少版本': data => { delete data.repositories[0].source.version; },
    '来源类型未知': data => { data.repositories[0].source.kind = 'unknown'; },
    '来源位置非字符串': data => { data.repositories[0].source.location = []; },
    '工作树缺少诊断': data => { delete data.repositories[0].worktrees[0].diagnostics; },
    '工作树缺少变更': data => { delete data.repositories[0].worktrees[0].changes; },
    '工作树布尔值非法': data => { data.repositories[0].worktrees[0].isRegistered = 'true'; },
    '工作树覆盖非法': data => { data.repositories[0].worktrees[0].coverage.truncated = null; },
    '诊断消息非法': data => { data.repositories[0].diagnostics[0].message = {}; },
    '文件路径非法': data => { data.repositories[0].changes[0].path = {}; },
    '文件范围未知': data => { data.repositories[0].changes[0].area = 'other'; },
    '文件状态未知': data => { data.repositories[0].changes[0].status = 'other'; },
    '文件数量负值': data => { data.repositories[0].fileCount = -1; },
    '文件数量非整数': data => { data.repositories[0].changes[0].additions = 1.5; },
    '覆盖数量非法': data => { data.worktreeCoverage.total = 'one'; },
    '克隆状态非法': data => { data.repositories[0].clone.state = 'ready'; },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, () => {
    const {cache, storage} = setup(), data = fixture(); mutate(data); store(storage, envelope(data));
    assert.equal(cache.read(), null); assert.equal(storage.length, 0);
    assert.doesNotThrow(() => cache.write(data)); assert.equal(storage.length, 0);
  });
});

test('24小时边界与读取不续期，重复保存旧观察也不能延长观察寿命', () => {
  const {cache, advance, storage} = setup(); cache.write(fixture());
  advance(DAY - 1); assert.notEqual(cache.read(), null);
  cache.write(fixture());
  assert.equal(cache.read().readAt, iso(TIME));
  advance(1); assert.equal(cache.read(), null); assert.equal(storage.length, 0);
});

test('超限按完整序列化UTF-8字节计算，恰好2MiB可保存，多一个字节删除旧份', () => {
  const {cache, storage} = setup(), data = fixture();
  data.repositories[0].name = '';
  const size = Buffer.byteLength(JSON.stringify(envelope(data)), 'utf8');
  const remaining = MAX_BYTES - size;
  data.repositories[0].name = '中'.repeat(Math.floor(remaining / 3)) + 'a'.repeat(remaining % 3);
  cache.write(data);
  assert.equal(Buffer.byteLength(storage.getItem(PREFIX + 'a'), 'utf8'), MAX_BYTES);
  assert.deepEqual(cache.read(), data);
  data.repositories[0].name += 'a';
  cache.write(data); assert.equal(storage.getItem(PREFIX + 'a'), null);
  assert.equal(cache.read(), null);
  store(storage, envelope(data)); assert.equal(cache.read(), null);
});

test('写入只保留四个工作空间，按保存时间淘汰最旧项且不动其他产品存储', () => {
  const storage = new MemoryStorage(); storage.setItem('user-preference', 'keep');
  storage.setItem('buildr:source-control-cache:v2:other', 'keep');
  for (let index = 0; index < 5; index++) createSourceControlCache(String(index), storage, () => TIME + index).write(fixture());
  assert.equal(storage.getItem(PREFIX + '0'), null);
  for (let index = 1; index < 5; index++) assert.notEqual(createSourceControlCache(String(index), storage, () => TIME + 5).read(), null);
  assert.equal(storage.length, 6); assert.equal(storage.getItem('user-preference'), 'keep');
  createSourceControlCache('1', storage, () => TIME + 6).write(fixture(TIME + 1));
  createSourceControlCache('5', storage, () => TIME + 7).write(fixture());
  assert.equal(storage.getItem(PREFIX + '2'), null); assert.notEqual(storage.getItem(PREFIX + '1'), null);
});

test('第五份写入失败不淘汰其他工作空间有效结果', () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < 4; index++) createSourceControlCache(String(index), storage, () => TIME + index).write(fixture());
  const before = [...storage.values];
  storage.setItem = () => {throw Error('QuotaExceededError');};
  createSourceControlCache('fifth', storage, () => TIME + 5).write(fixture());
  assert.deepEqual([...storage.values], before);
});

test('清理遍历先收集键，损坏和过期项不会占用名额', () => {
  const {cache, storage} = setup();
  storage.setItem(PREFIX + 'broken', '{');
  store(storage, envelope(fixture(TIME - DAY), 'expired', TIME - DAY), 'expired');
  for (let index = 0; index < 6; index++) store(storage, envelope(fixture(), String(index), TIME - 10 + index), String(index));
  cache.write(fixture());
  assert.equal(storage.length, 4);
  assert.deepEqual([...storage.values.keys()].sort(), ['3', '4', '5', 'a'].map(id => PREFIX + id));
});

test('多个页面每次写入重读存储，旧readAt不能覆盖或删除更新观察', () => {
  const storage = new MemoryStorage(); let time = TIME;
  const first = createSourceControlCache('a', storage, () => time), second = createSourceControlCache('a', storage, () => time);
  first.write(fixture()); time++;
  const newer = fixture(time); newer.repositories[0].branch = 'newer'; second.write(newer);
  const saved = storage.getItem(PREFIX + 'a'); time += 100;
  first.write(fixture()); assert.equal(storage.getItem(PREFIX + 'a'), saved);
  const oversized = fixture(); oversized.repositories[0].name = 'x'.repeat(MAX_BYTES);
  first.write(oversized); assert.equal(storage.getItem(PREFIX + 'a'), saved);
  assert.deepEqual(first.read(), newer);
  // A malformed prior save is not treated as evidence of a newer observation.
  store(storage, {...envelope(), data:{readAt:iso(time + 100)}});
  first.write(fixture()); assert.deepEqual(first.read(), fixture());
});

test('拒绝存储的每个方法或属性均不抛错，失败替换不保留假完整旧份', async t => {
  for (const operation of ['getItem', 'setItem', 'removeItem', 'key', 'length']) await t.test(operation, () => {
    const {cache, storage} = setup(); cache.write(fixture());
    if (operation === 'length') Object.defineProperty(storage, operation, {get() { throw new Error('SecurityError'); }});
    else storage[operation] = () => { throw new Error('QuotaExceededError'); };
    assert.doesNotThrow(() => cache.write(fixture(TIME - 1)));
    assert.doesNotThrow(() => cache.read());
    // A newer response reaches enumeration/setItem rather than old-read protection.
    const newer = createSourceControlCache('a', storage, () => TIME + 1);
    assert.doesNotThrow(() => newer.write(fixture(TIME + 1)));
    if (operation === 'getItem') assert.deepEqual(JSON.parse(storage.values.get(PREFIX + 'a')), envelope());
    else if (operation !== 'removeItem') assert.equal(storage.values.has(PREFIX + 'a'), false);
    storage.values.set(PREFIX + 'a', '{');
    assert.doesNotThrow(() => assert.equal(cache.read(), null));
  });
});

test('缺少或拒绝默认localStorage、时钟异常均安全降级', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const getter of [() => undefined, () => { throw new Error('SecurityError'); }]) {
      Object.defineProperty(globalThis, 'localStorage', {configurable:true, get:getter});
      let cache; assert.doesNotThrow(() => { cache = createSourceControlCache('a'); });
      assert.equal(cache.read(), null); assert.doesNotThrow(() => cache.write(fixture()));
    }
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:storage});
    const cache = createSourceControlCache('a', undefined, () => TIME);
    cache.write(fixture()); assert.deepEqual(cache.read(), fixture());
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
  for (const now of [() => NaN, () => Infinity, () => -1, () => { throw new Error('clock'); }]) {
    const cache = createSourceControlCache('a', new MemoryStorage(), now);
    assert.equal(cache.read(), null); assert.doesNotThrow(() => cache.write(fixture()));
  }
});

test('非法写入、未来写入和已过期观察不能保留旧缓存', () => {
  const {cache, storage} = setup();
  for (const value of [null, {}, fixture(TIME + 1)]) {
    cache.write(fixture()); assert.doesNotThrow(() => cache.write(value)); assert.equal(cache.read(), null);
  }
  const stale = createSourceControlCache('a', storage, () => TIME + DAY);
  assert.doesNotThrow(() => stale.write(fixture())); assert.equal(stale.read(), null);
});
