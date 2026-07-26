## Context

`projects/product/buildr` 是自举 workspace 的稳定开发入口，目前同时承担 shebang 和 Service CLI import。由于 shebang 固定为 `/usr/bin/env node`，PATH 中首个 Node 低于 package 声明的 `>=20` 时，入口会在任何 Buildr 诊断逻辑执行前失败。Codex 等 Agent 已经携带可用 Node，但该目录不一定直接位于 PATH。

## Goals / Non-Goals

**Goals:**

- 让 Project bridge 在当前 Agent 已提供兼容 Node 时直接启动，不要求 Agent 先改 PATH。
- 让 Node 选择可测试、可覆盖且不绑定某个用户或 Codex 的绝对路径。
- 保持 Service 是启动逻辑和 runtime 实现的唯一源码根。

**Non-Goals:**

- 不为普通用户安装或升级 Node。
- 不改变 npm 安装后的 `buildr` bin；npm 的 `engines.node` 仍是该入口的版本契约。
- 不让 Buildr 管理 Agent runtime 或猜测任意磁盘位置。

## Decisions

1. **Project bridge 改为 POSIX shell 薄转发器。** bridge 只解析自身目录并 `exec` Service 的开发启动器，避免 Node 版本检查逻辑在不兼容 Node 下先被解析。继续使用 JavaScript bridge 无法在 shebang 失败前自救；把完整选择逻辑放在 Project root 又会形成第二份实现责任。
2. **Service 启动器使用确定性候选顺序。** 先检查 `BUILDR_NODE`，再逐项检查 PATH 目录中的 `node`，最后检查每个 PATH 目录相邻的 `../../node/bin/node` bundled-runtime 结构。每个候选必须可执行且实际主版本不少于 20；首个合格候选通过 `exec` 启动 `bin/buildr.mjs`。这覆盖常规安装、版本管理器以及 Agent runtime，又不硬编码供应商或用户目录。
3. **显式 override 采用 fail-fast。** 设置了 `BUILDR_NODE` 但其不可执行或版本不足时立即失败，不静默换用其他候选，避免用户的明确选择被掩盖。
4. **最低版本与 package metadata 保持同一受测值。** 启动器当前检查 Node 20，并由 contract test 同时断言 `package.json#engines.node`，降低两处事实漂移风险；未来 engines 变化必须同步更新启动器和测试。

## Risks / Trade-offs

- [PATH 相邻目录规则不是通用标准] → 仅把它作为普通 PATH Node 之后的封闭补充，并验证候选版本；不递归搜索磁盘。
- [shell bridge 限定 POSIX 环境] → 该文件是仓库内 macOS/Linux 自举入口；Windows 和 npm 安装继续使用 package bin，不改变现有支持边界。
- [版本检查增加一次或多次短进程] → 只发生在开发 bridge 启动，候选数量受 PATH 长度限制，成功后使用 `exec` 不保留额外进程。
