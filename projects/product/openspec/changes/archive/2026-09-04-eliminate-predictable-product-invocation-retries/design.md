## Context

Product checkout 通过 `.node-version` 固定精确开发 Node，内部 verification executor 也已经使用 `process.execPath` 和同一发行版旁的 npm；但第一条 Agent 命令仍可能是系统 `npm`，而 `resolve-development-node` 当前只检查 `BUILDR_NODE` 与 PATH。当前 Codex 环境提供 `NVM_DIR`，精确 Node 已安装但不在 PATH，因此第一次调用仍会失败。

Task Verification report 的 SQLite writer provenance 会正确拒绝 linked task worktree runtime 写 canonical retained Workspace。随包 Skill 只写了通用 `buildr task verification inspect|record`，没有在执行前区分测试 runtime 与 writer runtime，导致 Agent 先触发一次无副作用拒绝。

## Goals / Non-Goals

**Goals:**

- repository-owned development wrapper 能从显式 `BUILDR_NODE`、受控版本管理器位置或 PATH 中选择精确开发 Node，并在第一条 npm 生命周期前完成选择。
- Agent 从 Project declaration 与 Product 文档看到的首选验证入口都经过 development wrapper。
- 自举 Task Verification 在首次调用前选择 retained checkout Buildr 写 current report。
- hostile PATH 与 candidate writer 保护继续 fail closed 并有回归证据。

**Non-Goals:**

- 不管理、下载或升级 Node，不恢复 Workspace Node authority。
- 不改变 npm 正式安装使用的 Host Node。
- 不让 candidate runtime 代理、伪装或获得 canonical writer authority。
- 不恢复 Verification Plan、Run、Candidate、Execution Record 或统一流程状态。
- 不改变 Verification Report、Task Record 或 Workspace SQLite schema。

## Decisions

### 1. 有界扩展 development Node 解析

`resolve-development-node` 保持 `BUILDR_NODE` 第一优先级；未设置时，在 PATH 前检查 `NVM_DIR/versions/node/v<required>/bin/node`。该候选必须是可执行文件且版本精确相等，否则继续现有解析或最终失败。只消费显式 `NVM_DIR`，不扫描用户目录、不猜版本、不下载 runtime。

选择这一方式，是因为当前失败现场已经提供明确的版本管理器根和精确安装；把机器绝对路径写入仓库不可移植，重新引入 Workspace managed Node 又会扩大已退役的 authority。

### 2. Agent 首选入口统一为 repository-owned wrapper

Project verification declaration 已使用 `tools/development/run-development-npm`，继续作为事实入口。更新当前文档、Candidate 指引与随包 Skill，要求 Agent 按 declaration `argv` 原样执行；裸 `npm run ...` 只保留为已正确激活 Node 后的兼容 npm script，不再作为 Agent 首选命令。

### 3. Task Verification 通过 Skill 选择 writer，不在 candidate CLI 内自动转发

随包 `task-verification` Skill 明确两类动作：项目测试在真实 execution root 执行；`task verification inspect|record` 在 canonical Workspace 选择合法 writer。Buildr 自举 worktree 使用 `<canonical-workspace>/projects/product/buildr`；普通 Workspace 使用其已安装/retained Buildr。`inspect` 与 `record` 必须使用同一 writer invocation。

不在 candidate CLI 内自动 exec retained checkout，因为 candidate 不应替 canonical authority 选择或启动任意目标代码。SQLite provenance guard 继续作为不可绕过的最后边界。

### 4. 失败诊断只做恢复兜底

当 candidate writer 仍被拒绝时，Task Verification CLI 根据 canonical target 是否存在 Product bridge，返回可定位的 retained entry 提示。诊断不自动重试、不读取或修改报告、不改变 writer identity。

## Risks / Trade-offs

- [仅支持显式 `NVM_DIR`] → 当前问题被确定性覆盖；其他版本管理器仍通过 `BUILDR_NODE` 或受控 PATH，避免无界扫描。
- [Skill 路由依赖 Agent 遵循指令] → package contract/static tests 固定关键语义，CLI 诊断保留最后兜底；不以自动转发换取权限边界模糊。
- [文档仍需保留 npm script 名称] → 同时展示 wrapper 与 script 关系，防止把兼容入口重新误认为首选入口。
