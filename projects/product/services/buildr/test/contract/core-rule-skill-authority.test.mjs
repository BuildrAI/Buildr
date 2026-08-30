import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const core = fs.readFileSync('resources/workspace/AGENTS.md', 'utf8');
const staticValidation = fs.readFileSync('src/agent-assets/application/package-maintenance/static-validation.mjs', 'utf8');

test('Core 以责任和结果边界约束 Buildr 治理', () => {
  assert.match(core, /## 责任与治理/);
  assert.match(core, /智能体（Agent）向用户说明目标、结果、影响与必要决定/);
  assert.match(core, /不把 Buildr 内部术语和流程问题转交用户/);
  assert.match(core, /发布版 Buildr 的用户不承担 Buildr 内部问题的诊断、修复或操作责任/);
  assert.match(core, /只有涉及用户授权或业务判断时，才向用户请求决定/);
  assert.match(core, /只有继续推进会造成越权、错误对象写入/);
  assert.match(core, /内部登记、派生证据或自动化信心不足，不得否定可从权威来源验证的事实/);
  assert.doesNotMatch(core, /## 产品哲学|反复犯错|新增或收紧硬门禁|Buildr 约束智能体（Agent）不要做错事/);
});

test('Core 为用户 Workspace 提供简明且按需可视化的共性表达', () => {
  assert.match(core, /## 用户沟通/);
  assert.match(core, /面向用户时，使用直接、简练、易于理解的表达/);
  assert.match(core, /仅在准确表达所必需时使用专业术语/);
  assert.match(core, /专业术语每次出现都必须使用“中文（English Term）”/);
  assert.match(core, /无稳定中文译名时使用“中文释义（English Term）”/);
  assert.match(core, /不得单独使用中文或英文专业术语/);
  assert.doesNotMatch(core, /优先使用稳定中文|首次出现时使用/);
  assert.match(core, /必须精确对应实现/);
  assert.match(core, /输出环境支持时，关系、时序、分支或状态转换用文字不易准确理解，就使用 Mermaid/);
  assert.match(core, /并用一句话说明结论；简单线性内容使用文字或表格/);
  assert.match(core, /说明明确、可执行的下一步/);
  assert.match(core, /任务已经完整结束时明确说明完成，不机械追加无关建议/);
});

test('Core 只保留 Rule 与专业 owner 的稳定职责', () => {
  assert.match(core, /## 工作资产职责/);
  assert.match(core, /当前作用域（scope）继承组织根（Organization\/Root）→ 项目（Project）→ 服务（Service）的 `AGENTS\.md`/);
  assert.match(core, /项目表示业务、产品线、系统或长期工作单元/);
  assert.match(core, /运行时、本机状态、凭证、临时提示词（prompt）和一次性聊天不是源资产/);
  assert.match(core, /`AGENTS\.md` 只能增加当前作用域的这些内容/);
  assert.match(core, /规则不承担技能路由、命令序列、生命周期、恢复或专业状态/);
  assert.match(core, /可以命名唯一责任主体（owner）和禁止绕过的不变量/);
  assert.match(core, /不得复制流程或当前状态/);
  assert.match(core, /技能说明（Skill description）发现用户意图/);
  assert.match(core, /能力绑定（capability binding）选择提供者（provider）/);
  assert.match(core, /项目声明（Project declaration）说明适用性与证明范围/);
  assert.match(core, /技能正文（Skill body）承担任务流程/);
  assert.doesNotMatch(core, /## 规则边界|## 工作空间模型|## 工作空间硬边界/);
});

test('Core 明确不可绕过的 Workspace 边界', () => {
  assert.match(core, /## 不可绕过边界/);
  assert.match(core, /当前作用域已选择且可用的能力提供者/);
  assert.match(core, /不得猜测或绕过能力绑定/);
  assert.match(core, /Git 边界必须按实际仓库判断/);
  assert.match(core, /受管区块（Managed Block）内联核心规则/);
  assert.match(core, /Buildr 受管区块由 Buildr 管理，不得手工改写/);
  assert.doesNotMatch(core, /components\/manifest\.yml|commands\/manifest\.yml|workspace transition check/);
});

test('package static 不把 Product Rule 文案当作专业流程契约', () => {
  assert.doesNotMatch(staticValidation, /Product AGENTS\.md must include/);
  assert.doesNotMatch(staticValidation, /Buildr Core must include/);
  assert.doesNotMatch(staticValidation, /合并前候选验证使用临时 workspace/);
  assert.doesNotMatch(staticValidation, /继续等待同一进程，不重复启动相同命令/);
});
