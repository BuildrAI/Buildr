## Why

Buildr 当前把自举开发 CLI 安装到机器默认 PATH，并要求 self-bootstrap 通过该默认入口完成身份验证和最终 Doctor。这会让开发 checkout 覆盖团队与普通 Workspace 应使用的 npm 发布版，也使一次开发安装改变整台机器的默认产品身份。

## What Changes

- **BREAKING**：机器默认 `buildr` 只代表 npm 安装版；Buildr 自举 Workspace 的开发命令统一显式使用 retained checkout 的 `projects/product/buildr`。
- self-bootstrap 不再安装、卸载或验证 PATH 中的 development CLI；它以 Environment Receipt 绑定的 retained Node 执行 retained `projects/product/buildr`，核对 checkout、CLI entry、Node、package/version 后完成最终 Doctor 或 same-run resume。
- `npm run install:development` 只安装或刷新隔离的 `Buildr Web Dev`，不再创建或覆盖 `~/.local/bin/buildr` 等默认命令。
- 发布准备分别验证 npm 发布入口与 retained checkout 开发入口，不能以开发 wrapper 代替 npm 安装身份。
- 同步更新 root Rule、self-bootstrap/release Skills、current knowledge、实现文档和测试；本 Change 不发布新版本、不切换本机 PATH，也不同步外部 Workspace。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `npm-cli-package`：开发准备只维护 checkout-backed `Buildr Web Dev`，Project bridge 成为 Buildr Workspace 的唯一开发 CLI 入口，机器默认命令保留给 npm 安装版。
- `task-closeout-orchestration`：self-bootstrap runner 删除 development CLI install 与 PATH identity 阶段，改为验证 retained checkout 显式入口并通过该入口 finalize。
- `buildr-package-assets`：自举 Component 的动作分类、结果证据与恢复语义不再拥有默认 PATH development CLI。
- `agent-task-workflows`：post-Finish activation 的成功条件改为 retained checkout 显式入口和最终 Doctor，而非默认 PATH 开发入口。

## Impact

- Workspace：`AGENTS.md`、`skills/buildr-self-bootstrap-sync/**`、`skills/buildr-release/SKILL.md` 及 Component integrity/projection。
- Buildr Service：development installer、CLI wrapper 兼容清理、self-bootstrap runner integration/contract/system tests、安装与发布验证。
- Product：相关 canonical specs、`openspec/knowledge/services/buildr.md`、产品/维护文档。
- 外部影响：交付后现有 Buildr-owned development wrapper 需要在单独的本机迁移步骤中备份或清理；本 Change 本身不执行该迁移。
