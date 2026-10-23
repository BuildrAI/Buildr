import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeConfigurationPrompt } from '../src/features/service-runtime/configurationPrompt.ts';

const workspace = { name: '演示工作空间', rootPath: '/workspaces/team one' };
const context = { workspace, serviceCode: 'operator-front', serviceName: '运营页面' };

test('配置请求绑定规范工作空间，缺少身份时不生成可复制操作', () => {
  const prompt = runtimeConfigurationPrompt(context);
  assert.ok(prompt.includes(JSON.stringify(workspace.rootPath)));
  assert.ok(prompt.includes(JSON.stringify(workspace.name)));
  assert.ok(prompt.includes(JSON.stringify(context.serviceCode)));
  assert.ok(prompt.includes('services/operator-front/runtime.yml'));
  assert.notEqual(prompt, runtimeConfigurationPrompt({ ...context, workspace: { ...workspace, rootPath: '/workspaces/another-team' } }));
  for (const unavailable of [null, { name: '未读取', rootPath: '' }, { name: '未读取', rootPath: '  ' }]) {
    assert.equal(runtimeConfigurationPrompt({ ...context, workspace: unavailable }), '');
  }
  assert.equal(runtimeConfigurationPrompt({ ...context, serviceCode: null }), '');
});

test('服务展示名保持为引用数据，不改变目标编码或引入终端命令', () => {
  const name = '运营 "界面"\n其他服务';
  const prompt = runtimeConfigurationPrompt({ ...context, serviceName: name });
  assert.ok(prompt.includes(`服务名称：${JSON.stringify(name)}`));
  assert.ok(prompt.includes('服务编码："operator-front"'));
  assert.ok(prompt.includes('服务名称："运营 \\"界面\\"\\n其他服务"'));
});

test('配置请求让智能体调查真实代码及双模式连接，不把名字当作服务类型', () => {
  const prompt = runtimeConfigurationPrompt(context);
  for (const requirement of ['Buildr Skill', 'references/local-services.md', 'buildr service-runtime --help', 'show 和 worktrees', '不凭服务名称猜测', '工作目录', 'portOverride', 'flag=port', '就绪检查', 'local.backend', 'serviceCode、environmentVariable 和 remoteUrl', '没有下游切换需求的服务不添加 backends', '目标确实注入进程', '只读请求验证实际连接']) assert.ok(prompt.includes(requirement), requirement);
});

test('重配保全已有事实与授权边界，不虚构配置命令或已验证结果', () => {
  const prompt = runtimeConfigurationPrompt(context);
  for (const requirement of ['候选命令与正式已验证定义要区分', '不为未验证内容更新 verifiedAt', '保留未知字段与旧 environments', '不静默停止或重启', '当前没有配置 validate/save 命令', '现有同范围的配置、启动和验证授权继续有效，不重复询问', '远程业务写入', '尚存缺口']) assert.ok(prompt.includes(requirement), requirement);
  assert.doesNotMatch(prompt, /buildr service-runtime (?:validate|save)/);
});


test('发现配置要求真实接入与运行身份，不为未知结果补写验证事实', () => {
  const prompt = runtimeConfigurationPrompt(context);
  for (const text of ['version: 2', 'kind: service-discovery', 'local.routing', '自身 serviceId', 'buildr.local-service-routing/v1', 'expectedRoutingDigest', '接收方须拒绝旧运行编号', '注册受理、当前可发现', '不为通过结构校验伪造 verifiedAt', '变量只传入身份上下文文件路径']) assert.ok(prompt.includes(text), text);
});
