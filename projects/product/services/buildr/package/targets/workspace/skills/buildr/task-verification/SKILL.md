---
name: task-verification
description: 用户要求运行已有测试、验证改动、查看 current 验证结果、报告验证耗时、初始化或更新 Project 验证能力声明，或者 Task Development 对稳定 Content Target 到达正式验证节点时使用；不用于设计测试框架、开发测试、生成 Candidate 或 Finish。
---

# Task Verification Skill

本 Skill 是 `buildr.task-verification/v3` 的默认 provider。它只负责两部分：Project 的 Verification Capability Declaration，以及针对正式 Task 目标的 transient Execution + Workspace本地current Result。它不开发测试，不拥有 Task Environment、Task Review、Task Development、Candidate generation、Task progression、风险接受、部署或业务验收。

开始行动时必须读取 `references/project-verification-v2.md`；初始化或更新声明时再使用 `templates/project-verification.yml`。正式 Result 必须通过 Task Verification Application 维护，不能直接读写Workspace SQLite或旧`.buildr/tasks/<task-id>/verification.yml`。

## 1. 建立验证边界

先确认：

- 正式 Task ID、Intent、Project/Service scope 和 active 状态；
- canonical Workspace，以及由 Task Environment 交接的实际 execution root；
- 当前交付目标的明确、稳定 target identity 和可移植 summary；
- operation：`inspect`、`execute`、`record` 或 transient `cleanup`；
- Task scope 内每个 Project 当前 `verification.yml`，以及实际变更路径、条件、环境和副作用。

没有正式 Task 时可以按用户要求执行已有测试并报告 transient 事实，但不得伪造 Task Result。没有稳定 target identity 时可以 inspect 为 `unknown`，不能 record。

先运行：

```bash
buildr task verification inspect <task-id> --target-identity <identity> --target <canonical-workspace> --json
```

current Result 只有在 target 与全部 declaration identities 都 `current` 时才适用于当前目标。target 未提供为 `unknown`；任一声明缺失/出现、内容、path、Project scope 或有效性变化为 `stale`。不要写回 applicability 标记。

当前目标来自 ready Task Environment 且其中的 declaration bytes 尚未进入 canonical Workspace 时，inspect/record 都追加 `--declaration-root <task-environment-root>`。Application 只接受该 Task 当前 ready Environment 的精确根目录；本机路径只用于读取，不进入 current Result。

## 2. 读取和维护 Project declaration

`buildr.project-verification/v2` 只登记已经存在的能力：identity、Project/Service scope、command 或 bounded Agent invocation、applicability、proves、是否 delivery required，以及确有需要的 environment/effects/resource claims。

- 不存在声明或适用能力时，只记录 `project:<code>` 或 `service:<project>/<service>` coverage gap；不自动创建测试、脚本、CI 或框架。
- 声明无效时停止执行其中的能力，先报告具体字段诊断。
- `requiredForDelivery` 是 Project policy，不是 Verification 的 proceed/blocked 决定。
- 不使用 minimal/affected/candidate、maturity、mode、enforcement、dependsOn 或 supersedes。
- `coordinated`/`external` resource 只有被真实能力 claim 时才保留；本地临时文件不建设资源平台。

用户明确要求初始化或更新声明时，读取真实 package/POM scripts、CI、AGENTS 和项目文档，只写已确认事实并保留已有稳定 capability id。测试不存在时保持空声明或 coverage gap，不借此任务开发测试。

声明前还必须核对真实测试入口、内部 registry、环境、副作用和可用的近期耗时 evidence；必要且已授权时可以有界运行现有入口取得事实。不得根据 capability id、`fast`、`unit`、目录名或技术栈惯例推断成本与覆盖。

只声明少量、稳定、可独立选择的 capability 接口，不复制每个测试文件或内部 registry step。测试意图、Static/Unit/Component/Integration/System 边界、Quick 成本约束、affected/full 范围、Candidate/Release 验证目标和目标耗时属于 Project Testing 或项目 registry，不进入 `verification.yml` v2。入口命名、成本或分层不合理时报告测试建设 gap，并交给 `project-testing` 或后续实现任务；不要在声明更新中暗中重构测试。

## 3. 选择并执行已有能力

针对 target 逐项核对 capability 的 Project/Service scope、paths/conditions、environment、effects 和授权：

- command capability 使用正式 executor：

```bash
buildr verification run --project <code> \
  --capability <id> [--capability <id> ...] \
  --target-identity <identity> \
  --target <execution-root> \
  --environment <task-id> --workspace <canonical-workspace> \
  --json
```

声明 `effects.authorization: explicit` 时，取得对应授权后逐项增加 `--authorize-capability <id>`；声明为 explicit 的资源同理增加 `--authorize-resource <id>`。不得用一次宽泛授权覆盖其他 capability 或 resource。

- Agent capability 按声明 instructions 做有界操作，保留实际事实；不要硬塞进 command runner。
- external resource 或持久副作用必须取得对应授权；无授权时不执行，并在完整 Result 中形成 gap 或 failed fact。
- Product 内部测试可以使用其专用 registry/DAG；不要把它提升为通用 Project declaration policy。
- coordinated resource 由 runner 通过 owner-bound waiting ticket 公平排队；最早的有效 waiter 优先取得可用容量。取消、timeout、崩溃或过期 ticket 由 coordinator 按 owner/token 与 expiry 精确恢复；Agent 不清空共享队列、不删除其他 waiter/lease，也不通过重复启动 verification 抢占容量。

完整 stdout/stderr、命令、耗时、排队、waiting ticket、资源 lease、临时路径和 Environment 诊断属于 `buildr.verification-execution/v1` transient evidence。运行中或暂时无输出时继续等待同一 execution，不启动重复 verifier。整体耗时只从 execution wall-clock 读取，不相加并行检查耗时。

## 4. 提炼并原子记录 current Result

只有能力执行、Agent operation、coverage gaps 和整体结论都已经完整形成后，才一次性 record：

```bash
buildr task verification record <task-id> \
  --target-identity <identity> \
  --target-summary <portable-summary> \
  --capability '<project>/<id>::<passed|failed>::<portable-fact>' \
  --coverage-gap '<project:code|service:project/service>::<summary>' \
  --outcome <passed|not-passed> \
  --summary <portable-conclusion> \
  --target <canonical-workspace> --json
```

同一 capability 的多个 `--capability` 会合并 facts。至少需要一个实际 capability 或 coverage gap。存在 failed capability 或 coverage gap 时 outcome 必须为 `not-passed`。

Result 只回答 target、采用的 declarations、实际执行能力及事实、coverage gaps 和总体验证结论。不要复制 stdout/stderr、耗时、临时 evidence path、Environment Receipt、本机绝对路径、applicability、digest、history/revision，或写入 proceed/blocked、Task 状态和 Candidate generation。

完整测试失败且 evidence 完整时可以形成 `not-passed` Result；execution 中断、输出不完整、结论未形成或 Application 写入失败时不得覆盖原 current。Repository 的整值原子替换和 rollback 由 Application 负责，Agent 不补写 sibling store。

## 5. Development consumer 与清理

Task Development 通过同一 Application inspect Result 的 target/declaration applicability，并对照独立 verification policy 检查 required facts 或 coverage gaps。Result 可以是完整的 `not-passed`；是否继续由 Development 记录用户风险决定。Task Finish 不读取、解释、补跑或记录 Result，只消费 formal Development handoff。

current Result 形成且没有其他 consumer 后，使用 evidence 返回的精确 summary 清理 transient run：

```bash
buildr verification cleanup --summary <file> --json
```

只清理 provider-owned、identity 可证明的单次 transient evidence；非 transient、越界、symlink 或归属不明时保留并报告。

## 6. 面向用户报告

简洁报告：

```text
验证：passed / not-passed / incomplete
目标：<target summary + identity>
声明：<Project/path identity；current/stale>
能力：<实际执行及事实>
缺口：<coverage gaps 或 none>
耗时：<本次 transient execution wall-clock；如有>
Result：<digest；current/stale/unknown>
临时 evidence：<cleaned/retained + 原因>
```

不要把测试通过等同于业务验收、风险接受、开发完成、Task 完成、提交、推送或上线。
