# 稳定验证执行的终态回读与重复启动保护

## 一句话摘要

让Agent在终端或工具session丢失后，从既有Task Execution Record恢复同一次正式Verification的状态和结果，并默认阻止相同active invocation重复执行。

## 背景与问题

Formal Verification通常需要50～110秒。虽然Buildr已在执行前创建持久record，并在结束后保存受控summary、timeline和diagnostics，但Agent公共CLI只有GC，没有list/inspect。原终端不可用时，Agent无法稳定找回execution，常被迫重新运行完整验证。

## 目标与非目标

目标是开放Task-scoped只读list/inspect、持久化closed invocation identity，并在Application transaction内阻止相同active execution的默认重复启动。显式`--retry`仍保留新run和独立record。

本Change不把Verification改成后台job系统，不自动判断open record已经死亡，不让Execution Record代替current Verification Result，也不开放任意正文path或SQLite细节。

## 受影响角色

- Agent：可只凭Task ID恢复读取，不再依赖原终端句柄保存最终输出。
- Buildr维护者：可从同一authority诊断open、attention、retained和cleaned execution，并保留失败/重试历史。

## 核心流程

1. Agent启动formal Verification。
2. Buildr在capability/process副作用前生成invocation identity并原子open record。
3. 相同active invocation再次到达时，默认返回existing record和list/inspect下一动作，不启动第二份process。
4. 原终端丢失后，Agent按Task list Verification records，再inspect目标record读取lifecycle、timing、failures和正文文件入口。
5. 只有Agent明确选择`--retry`时，Buildr才创建新run与独立record。

## 关键变化

- 新增Task execution record `list`、`inspect` CLI。
- execution record metadata增加nullable closed `invocationIdentity`。
- `verification run`增加active duplicate保护与显式`--retry`。
- list/inspect和duplicate结果增加稳定portable JSON contract。

## 影响、风险与兼容性

旧record保持可读但不补造invocation identity。不可捕获进程死亡留下的open record会继续阻止默认重复启动；这是fail-closed策略，Agent必须inspect后明确retry。现有同步单JSON协议、Execution Record单一authority、Verification Result和Task推进边界保持不变。

## 验收摘要

- 原终端丢失后可按Task与record ID恢复读取同一次execution。
- 两个默认相同active请求只启动一份capability process。
- 显式retry产生独立run/record且不覆盖旧record。
- list/inspect不泄漏SQLite、locator、本机路径或敏感正文。

## 技术artifacts

- `proposal.md`
- `design.md`
- `specs/task-verification/spec.md`
- `specs/task-execution-artifacts/spec.md`
- `specs/cli-product-surface/spec.md`
- `specs/public-json-contracts/spec.md`
- `tasks.md`
