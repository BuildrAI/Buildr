## Why

当前国际版 `Qoder`（`native-qoder`）模型来源仍绑定在 `qoder` 智能体接入名下，用户在「智能体与模型 → 模型」页无法直接登录，必须先到「智能体」页准备并连接 Qoder Harness 才能使用其订阅模型。然而与 `Qoder CN` 一样，Qoder 国际版的模型列表、额度查询和模型推理完全走官方 HTTP 接口，仅有登录阶段按需调用官方 CLI；因此需要将 Qoder 国际版改造为与 `Qoder CN` 一致的独立订阅账号来源。

## What Changes

- 将 `Qoder`（`native-qoder`）模型来源从 `qoder` 智能体连接托管改为独立订阅登录账号，凭据保存在独立的账号配置域（`model-access/accounts/native-qoder/qoder-config`），并在未准备/未启用 `qoder` 智能体连接时也可直接登录（按需通过受管程序管理器准备官方 `qodercli`）。
- 调整 `qoder` 执行器策略为独立模型账号共享模式（`defaultSourceAccountId: 'native-qoder'`、`accountConfigScope: 'model-account'`、`readySourceSupersedesConnection: true`、`upgradeVerification: 'account-probe'`），移除连接与账号的反向观察耦合（`observeViaModelAccount`）；未单独接入 `qoder` 智能体时，Codex、DSH、Claude Code 等兼容执行方即可通过本机模型网关使用 `Qoder` 模型。
- **兼容性与迁移**：升级加载既有 `accounts.json` 时，原托管在 `qoder` 连接名下的 `native-qoder` 记录由既有迁移机制自动转为独立未登录订阅账号，用户仅需在「模型」页重新登录一次即可继续使用；存量 `qoder` 会话若此前绑定在 `connections/qoder/qoder-config`，续发时自动开启新会话参与者并本地交接上下文，历史原生工具详情与中断恢复记录保持可读。

## Capabilities

### New Capabilities

### Modified Capabilities
- `unified-model-subscriptions`: 将国际版 `Qoder` 从智能体接入托管模型来源移入独立订阅登录来源，使 `Qoder` 与 `Qoder CN` 对齐支持在模型页直接登录、可删除管理及共享账号不因连接旧观察被先行拒绝。

## Impact

- 规范与文档：`projects/product/openspec/specs/unified-model-subscriptions/spec.md`、`projects/product/knowledge/docs/architecture/agent-integration.md`
- 后端服务（`buildr-agent`）：Qoder 账号登录器与独立模型来源提供者、`qoder` 执行器描述与升级探针策略、历史工具详情与持久化历史解析、存量会话跨配置目录接续迁移处理
- 宿主接口说明（`buildr`）：`programmatic-help` 帮助说明
