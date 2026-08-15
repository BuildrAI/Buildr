---
name: openspec-contract-guard
description: 创建、审查、实现、收敛或归档 OpenSpec change，且需要检查语义就绪、active change 冲突、隔离验证、canonical 并发漂移或恢复事实时使用。此 Skill 是 Buildr 的 OpenSpec sidebar，不修改外部 openspec-* Skills。
metadata:
  author: buildr
  version: "1.2"
  supportedOpenSpec: "1.6.0"
---

# OpenSpec Contract Guard

父子任务场景额外执行单owner检查：同一个具体规范变化在同一时间只能由一个active Change持有。Parent Plan不是delta Change；Parent自己的Change只能覆盖亲自承担的窄集成实现或验收能力，不能复制Child Change。启动Child或Parent reconcile后若发现active delta重叠，先缩窄/放弃对应Change并重新Planning Review，不得依靠归档后的canonical convergence反复rebase重复authority。

本 Skill 只保留 OpenSpec 1.6 未提供的 Buildr 契约保证：Planning Review前的语义就绪预检、并行 active change 冲突、确定性 expected tree、隔离严格验证、条件式 canonical 写入、写后确认和基于文件事实的断点恢复。

OpenSpec 1.6 负责 delta 格式与 Requirement 结构、单个 change 的规范校验、canonical spec 重建和 archive 的场景保全检查。先运行上游 `openspec validate <change> --strict`；本 Skill 不重复实现这些解析或 archive 安全规则。

本 Skill 不修改外部 `openspec-*` Skills、外部 OpenSpec CLI 或本机 CLI 安装。

## 1. Apply 前门禁

change artifacts complete 且上游严格验证通过后运行：

```bash
openspec validate <change> --strict
buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json
```

`<task-execution-root>`必须来自matching Task Environment Receipt的`execution.workdir`。Preflight只读复用正式convergence planner、active Change scan和projected strict validation，不检查实现期checklist，不写canonical、Receipt、archive、Task或Review事实。它把blocked区分为`active-change-conflict`、`scenario-omission`、`identity-conflict`、`projected-validation`与其他`semantic-resolution-required`：Agent只处理对应依赖、Change artifact语义或用户决定，再重新运行strict与preflight，不得自动补回Scenario、选择rename或修改canonical。

只有preflight返回current `ready`后，正式Task才使用Task Environment声明的Node与Buildr Service execution root调用`task-planning-identity-driver.mjs inspect --task <task-id> --target <canonical-workspace>`；只把`resolved`结果的`target.identity`和`planningNodes`交给Task Development与Planning Review。Preflight或resolver `blocked`时停止Planning Review和apply，禁止把blocker写入Review Result代替处理，也禁止用raw digest、文件路径、mtime、checklist progress、Git ref或旧Review target回退。Planning Review不拥有、不复制也不解释preflight逻辑。Buildr 不提供 baseline/create 或阶段型 check，也不创建、刷新、读取或依赖这些 sidecar。

`ready`只绑定本次delta、canonical、全部active Change observation与OpenSpec executable/algorithm identity；任一事实变化后旧ready陈旧。它不是写入授权，也不替代实现验证。最终`buildr openspec converge`永远重新读取最新事实、重新规划并重新验证，不接受或读取旧preflight结果。

## 2. 单一收敛事务

```bash
openspec validate <change> --strict
buildr openspec converge <change> --project <project> --target <task-execution-root> --json
```

`<task-execution-root>`必须原样取自matching Task Environment Receipt的`execution.workdir`，不是canonical Workspace，也不得从cwd、其他worktree或目录扫描猜测。target中看不到active Change时保持零写入，按CLI next action回到同一Environment Receipt纠正target。

产品计算单一 identity/plan，在临时 Project 投射 expected files并运行 `validate --all --strict`；随后重验 delta、executable 与全部 canonical before digests，条件一致才替换文件。首次canonical mutation前写入唯一事务期`.buildr/convergence-receipt.json`；写后只确认expected digests与真实strict validation，再执行`archive --skip-specs`，正常archive成功后释放本次Receipt再返回`passed`。

## 3. OpenSpec Convergence Inspect

`buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`只在Converge中断、返回`recovery-unprovable`或事务终态释放失败，且当前Task Environment恢复现场仍存在时使用。它只读比较当前事务Receipt的before/expected与canonical actual；active Change没有Receipt或Change已经archived时返回`not-applicable`。

正常Converge返回`passed + archived`后，正式Task再次调用Task Planning Identity resolver。target与apply前相同则复用current Planning Review并继续Development；不同或`blocked`则停止并按当前计划重新审查。该检查不运行Convergence Inspect；Formal Task Finish与Environment cleanup不调用Inspect。Worktree清理后不得恢复环境、追索Receipt或把Receipt缺失报告为恢复失败。正常长期事实使用Archived Change、Canonical Specs、Git与Task Development/Finish事实。

## 4. 失败处理

- Preflight `active-change-conflict`：列出冲突Change/capability/Requirement，由Agent处理前序依赖、合并语义或重划范围。
- Preflight `scenario-omission|identity-conflict|projected-validation|semantic-resolution-required`：在Planning Review前停止，由Agent修订Change artifact或请求用户决定后重新检查。
- `blocked`：列出语义冲突、冲突 change/Requirement 或 strict validation 诊断，修订 artifacts 后重试。
- `recovery-unprovable`：canonical 出现 before/expected 之外的值、混合状态或旧 identity 链不完整；停止并人工核对，禁止自动覆盖。
- delta identity 变化：丢弃旧 plan，以当前 canonical 重新规划，不恢复旧 before。
- executable identity 变化：旧 validation 不复用，以当前 executable 重新投射验证。
- archive 失败：canonical 保持 `applied-and-matched`，重试只做确认和 archive。
- archive成功但Receipt释放失败：保持canonical和archive终态，重试Converge只完成事务Receipt release。
- upstream strict validation 失败：修复上游诊断后再运行 Buildr 门禁。
- CLI/Component version 不一致：使本机 OpenSpec CLI 与 Component 声明一致；Buildr 不代为安装。

用户可见Preflight状态必须包含change、`ready|blocked`、readiness/plan identity、active Change observations、blockers、`effects: []`和`nextActions`；Converge状态必须包含change、`passed|blocked|recovery-unprovable`、disposition、Receipt是否已释放、耗时、命令次数和`nextActions`；Inspect另外使用`not-applicable`表达未开始或已终结。Agent不拼装内部guard命令，不解释多个Receipt，也不把preflight或事务Receipt升级为长期authority。外部`openspec-*` Skills继续承担explore、propose、update和apply；确定性sync/archive由Buildr事务持有。
