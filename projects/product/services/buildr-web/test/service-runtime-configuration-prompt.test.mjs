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

test('配置请求只保留目标、技能入口和验证后保存要求，不复制技能方法', () => {
  const prompt = runtimeConfigurationPrompt(context);
  for (const requirement of ['Buildr Skill', 'references/local-services.md', '核对服务登记、真实代码和已有定义', '验证候选后按差异更新 services/operator-front/runtime.yml 并读回', '保留已有运行和无关配置', '不伪造验证结果']) assert.ok(prompt.includes(requirement), requirement);
  for (const copiedMethod of ['buildr service-runtime --help', 'show 和 worktrees', 'portOverride', 'local.remoteEnvironments', 'kind: service-discovery', 'expectedRoutingDigest', '当前没有配置 validate/save 命令']) assert.ok(!prompt.includes(copiedMethod), copiedMethod);
});

test('请求明确本次本地验证授权及不扩大的边界', () => {
  const prompt = runtimeConfigurationPrompt(context);
  for (const requirement of ['本地候选启动、只读验证和上述运行定义修改', '不包括远程业务写入、部署、共享配置修改或凭证读取', '最后简要说明配置、实际验证和剩余缺口']) assert.ok(prompt.includes(requirement), requirement);
});
