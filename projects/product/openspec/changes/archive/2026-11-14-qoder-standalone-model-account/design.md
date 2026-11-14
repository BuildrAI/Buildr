## Context

见 `proposal.md` 的背景说明。当前国际版 `Qoder`（`native-qoder`）模型来源声明了 `connectionId: 'qoder'`，凭据存放在智能体配置域 `connections/qoder/qoder-config`；而国内版 `Qoder CN`（`native-qoder-cn`）已经是独立订阅来源（`linked: true`、无 `connectionId`），凭据保存在 `model-access/accounts/native-qoder-cn/qoder-cn-config`，缺少本地 CLI 时由模型侧按需准备官方程序并拉起登录，不强制连接或启用 `qoder-cn` 智能体。

## Goals / Non-Goals

**Goals:**
- 让国际版 `Qoder`（`native-qoder`）与 `Qoder CN` 采用同一套独立订阅账号与执行器共享模型：模型页直接展示在「订阅账号」分组、可独立登录与删除、可在未准备 `Qoder` 智能体时供 Codex/DSH/Claude Code 等兼容智能体使用。
- 准备或升级 `Qoder` 智能体时，直接共享 `native-qoder` 模型账号凭据与身份探测，断连智能体程序不影响独立账号状态。
- 升级后自动迁移旧版受连接托管的 `native-qoder` 持久化记录，并保证升级前存于 `connections/qoder/qoder-config` 的存量对话和原生工具历史记录不中断、可读回。

**Non-Goals:**
- 不修改现有 `Qoder` 模型 HTTP API 协议、签名算法与模型目录结构。
- 不替用户自动把旧 `connections/qoder/qoder-config` 凭据文件复制到 `model-access/accounts/native-qoder`（沿用 `Qoder CN` 迁出时的账号边界策略：托管转独立后重置为未登录，由用户显式重新登录确认授权归属）。
- 不新增前端供应商硬编码分支（保持 `buildr-web` 架构约束，仅依赖后端元数据驱动）。

## Decisions

### 1. 参数化复用 Qoder 独立订阅账号提供者与登录器
- **选择**：将原 `Qoder CN` 专属的独立账号登录器与 `ModelProvider` 工厂参数化为接收 `productId: 'qoder' | 'qoder-cn'`，分别产出 `native-qoder`（`Qoder`，凭据目录 `model-access/accounts/native-qoder/qoder-config`，环境变量 `QODER_CONFIG_DIR`，登录域 `qoder.com`）与 `native-qoder-cn`（`Qoder CN`，凭据目录 `model-access/accounts/native-qoder-cn/qoder-cn-config`，环境变量 `QODERCN_CONFIG_DIR`，登录域 `qoder.sh`）。两者在模型目录注册表中均作为无 `connectionId` 的 `linked` 订阅来源注册；保留既有 `createQoderModelProvider` 导出以兼容单测对原生客户端工厂的直接调用。
- **备选与取舍**：也可为国际版复制一份登录器与 provider 文件，但会产生大量重复的登录子进程管理、URL 提取、程序准备与诊断逻辑。参数化复用既保证国际版与国内版行为完全对齐，也避免后续维护分叉。

### 2. 对齐 `qoder` 执行器策略与升级验证模式
- **选择**：`qoder` 执行器描述中的 `modelPolicy.native` 与 `qoder-cn` 统一使用 `defaultSourceAccountId: 'native-qoder'`、`accountConfigScope: 'model-account'`、`readySourceSupersedesConnection: true`，移除 `{ observeViaModelAccount: 'native-qoder' }`，并将 `runtimeTraits.upgradeVerification` 从 `'runtime'` 改为 `'account-probe'`。保留底层通用 `observeViaModelAccount` 能力（其他执行器仍使用）。
- **原因与取舍**：如果 `upgradeVerification` 保留 `'runtime'`，在 `Qoder` 转为 `'model-account'` 配置域后，智能体程序升级检查会去探测无凭据的 `connections/qoder` 目录并失败；改为 `'account-probe'` 才能通过 `native-qoder` 的独立账号配置域完成升级健康检查。

### 3. 旧账号迁移与存量会话/历史内容兼容
- **选择**：
  1. 账号状态迁移复用 `ModelAccessApplication.load()` 既有分支（检测到持久化 `accounts.json` 中存在 `connectionId` 但当前 provider 已转为独立 `linked` 账号时，自动清除 `connectionId` 并重置为 `not-authenticated`）。
  2. 在对话准备阶段，当执行器声明 `accountConfigScope === 'model-account'` 且最新会话参与者（Participant）的 `bindingData.config` 不在当前独立账号配置域下时，视为跨配置域延续（开启新会话参与者并触发本地上下文交接），而不把它当作异常阻塞。
  3. 原生工具详情与未结轮次恢复解析优先检查参与者 `bindingData.config` 是否落在旧智能体连接配置域 `connections/qoder`（并在国际版未携带路径命中时检查旧目录回退），确保历史对话的工具详情与未结恢复仍可读取。
- **替代方案**：若直接复用旧 `bindingData.config`（`connections/qoder/qoder-config`）或要求用户手动删除重建旧对话，都会导致即使用户重登了同一个 Qoder 账号，新运行时因 `config` 目录改变产生不同 `bindingIdentity` 而命中 `409 agent_binding_changed`。通过识别配置域迁移开启新参与者并做本地交接，既保持新旧配置域隔离，又让老对话无缝续聊。

## Risks / Trade-offs

- **[升级后需重登一次旧国际版 Qoder 账号]** → 这是延续 `Qoder CN` 迁移策略的明确选择，不自动搬运旧智能体目录下的私有凭据；在切换提示与文档中说明升级后在「模型」页点一次登录即可恢复，历史对话继续可用。
- **[跨对话继续使用旧 Qoder 会话]** → 首次续聊会以新参与者开启新原生会话并通过交接保留摘要上下文；同时旧轮次生成的原生工具详情通过兼容路径解析保持可读。
- **[多测试夹具假设 `native-qoder` 依赖连接托管]** → 相关单元测试与集成测试需同步更新以反映新契约，并补充不接入 Qoder 智能体直接跨智能体调用及存量会话迁移用例。

## Migration Plan

1. 升级启动后，`ModelAccessApplication.load()` 自动把已持久化的托管 `native-qoder` 记录清理为未登录的独立订阅账号，无需数据库结构变更或离线脚本。
2. 用户在「模型 → 订阅账号 → Qoder」完成一次登录后，新账号凭据写入 `model-access/accounts/native-qoder/qoder-config`。
3. 存量历史对话继续访问旧工具详情走 `connections/qoder/qoder-config` 兼容读取；继续向旧 Qoder 对话发消息时自动建立新会话参与者完成无缝延续。
