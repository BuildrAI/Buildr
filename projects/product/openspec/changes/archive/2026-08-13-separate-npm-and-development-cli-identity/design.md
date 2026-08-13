## Context

Buildr 同时存在两种合法 CLI 身份：团队和普通 Workspace 使用 npm 发布版；Buildr 自举 Workspace 需要运行当前 retained checkout 的开发版。当前实现把后者安装到机器默认 PATH，并让 self-bootstrap 依赖该默认入口，导致一次开发准备改变整台机器的默认产品身份。

本变更跨越开发安装脚本、self-bootstrap runner、Workspace Rule、发布 Skill、规格、当前知识和验证。关键约束是：Formal Finish 与 post-Finish self-bootstrap 的 authority 不变；最终 activation 仍由唯一 runner 编排；显式开发入口必须使用 Environment Receipt 绑定的 retained Node，并且不能通过 PATH 猜测来源。

## Goals / Non-Goals

**Goals:**

- 机器默认 `buildr` 只代表 npm 安装版，开发 checkout 不再创建、覆盖或验证该入口。
- Buildr 自举 Workspace 统一显式使用 retained checkout 的 `projects/product/buildr`。
- `npm run install:development` 只维护隔离的 `Buildr Web Dev`。
- self-bootstrap 继续以单一 runner 完成 sync、Git、Buildr Web Dev、显式开发入口验证和最终 Doctor 或 same-run resume。
- 发布准备分别验证 retained checkout 和 npm 发布物，避免身份混用。

**Non-Goals:**

- 不发布 rc.9 或其他 npm 版本。
- 不修改本机 PATH、全局 npm 安装或现有 legacy development wrapper。
- 不同步集鲜或其他外部 Workspace。
- 不改变 Formal Finish、Task Environment、Candidate、Verification 或 Review authority。

## Decisions

### 1. 机器默认入口与开发入口按命令所有权隔离

机器默认 `buildr` 保留给 npm installation；Buildr Workspace 的开发入口固定为 `<retained-root>/projects/product/buildr`。保留 Project bridge 而不是让调用方直接执行 Service `bin/buildr.mjs`，因为 bridge 已负责兼容 Node 选择和 Product checkout source discovery，是稳定的开发命令边界。

替代方案是继续安装 development wrapper、只调整 PATH 顺序。该方案仍允许不同 shell 或工具环境误命中开发版，不能形成机器级稳定身份，因此不采用。

### 2. retained Node 通过环境显式注入 Project bridge

self-bootstrap runner 使用 Environment Receipt 的 retained Node 启动，并在执行 `projects/product/buildr` 时注入 `BUILDR_NODE=<retained-node>`。runner 通过显式入口执行 `version --json`，核对 package/version/channel/source 与 retained checkout，再通过同一入口执行最终 Doctor 或 same-run resume。

这样既复用 bridge 的公开开发契约，又保留 Environment Node identity 的 fail-closed 约束；不再读取 PATH 中的 `buildr`，也不要求 development wrapper 专用 probe。

### 3. development 安装只拥有 Buildr Web Dev

`scripts/install-buildr-development` 删除 `install-buildr-cli` 调用和 PATH smoke，只调用 development launcher manager，并验证 manager 的 closed identity。`install-buildr-cli` 与 `uninstall-buildr-cli` 暂时保留为 legacy 迁移兼容工具，但不再由 canonical 开发准备、自举或发布流程调用。

直接删除 legacy 工具会把本机已有 wrapper 的清理与产品行为切换混在同一变更中，增加不可逆迁移风险；清理动作留给发布后的独立本机迁移步骤。

### 4. self-bootstrap 保留单一 runner，但重命名动作与阶段

CLI 影响路径仍需要触发自举验证，因为源码变化可能改变显式开发入口行为；动作从 `install-development-cli` 改为 `verify-development-entry`。阶段序列移除 `install-cli` 和 `verify-cli-identity`，改为 `install-local-app → verify-development-entry → finalize`。Buildr Web 影响不再隐含依赖 CLI 安装，但所有适用 plan 都必须在 finalize 前验证显式开发入口。

结构化结果中的身份字段改为 development entry evidence，包含 Project bridge、Service CLI entry、retained Node、package/version/channel/source。恢复计划也只声明显式入口验证，不声明 PATH mutation。

### 5. 发布准备分开验证 checkout 与发布物

release Skill 在实现影响 CLI 时只通过 retained `projects/product/buildr` 验证当前 checkout；npm identity 继续由 tarball/registry 安装和发布后 smoke 证明。任何一方的证据都不能替代另一方。

## Risks / Trade-offs

- [现有自动化仍调用 `install-buildr-cli`] → 通过全仓 contract/integration 搜索与测试阻止 canonical 流程残留；legacy 脚本本身保留但不得被正常流程引用。
- [Project bridge 可能回退到错误 Node] → runner 注入 `BUILDR_NODE` 并核对实际 `version --json` identity；入口启动或 identity 不一致即停止 finalize。
- [旧 self-bootstrap Result/测试依赖阶段名] → self-bootstrap result schema 保持 v1，但阶段和 action 是内部编排事实；同一 Change 同步更新 Skill、runner、spec 与所有直接消费者。
- [本机 legacy wrapper 继续抢占默认 PATH] → 本 Change 不静默删除用户入口；交付后以独立、可恢复的本机迁移步骤备份或清理。
- [rc.8 不包含新 Workspace 能力] → 外部 Workspace 暂不执行 rc.8 doctor/sync；发布 rc.9 与外部同步是后续独立授权边界。

## Migration Plan

1. 先交付产品契约、实现和测试，使开发与自举流程不再依赖默认 PATH。
2. 发布包含该能力的新 npm 候选版，并分别验证 registry 安装与 retained checkout。
3. 备份或移除本机 legacy development wrapper，安装新 npm 版作为默认入口。
4. 最后用已发布版本验证并同步外部 Workspace。

回滚仅回滚本 Change 的代码与契约；由于本 Change 不修改机器 PATH 或全局安装，不需要恢复本机命令。

## Open Questions

无。legacy wrapper 的本机清理由后续发布/迁移任务决定，不阻塞本 Change。
