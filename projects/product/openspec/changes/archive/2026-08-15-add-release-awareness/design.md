## Context

当前 npm 更新计划只执行一次 `npm view @buildr-ai/buildr version --json`，把单一版本与当前安装做比较。该结果无法表达 GA 与 RC 并存，也无法被 Doctor、Buildr Web 和 Buildr Skill 共同消费。发布流程已经把 prerelease 映射到 `next`、稳定版本映射到 `latest`，但只确认本次发布选择的一个 tag。

本 Change 保留现有 npm/development 安装来源、可信 npm CLI、prefix、Workspace 更新边界和发布 authority；Registry 只是现有 npm 命令的查询目标，不新增面向用户的 Registry 或 channel 模型。

## Goals / Non-Goals

**Goals:**

- 用一个 Release Awareness Application 同时解释 `latest` 与 `next`。
- 让 CLI、Doctor、Buildr Web 和 Buildr Skill 使用同一结构化事实与用户文案。
- 让用户明确选择 `stable` 或 `candidate`，且不自动切轨、不自动降级。
- 用最小用户级状态避免相同轨道头在多个入口反复提醒。
- 让发布流程证明目标 tag 已推进且非目标 tag 未变化。

**Non-Goals:**

- 不新增 Workspace 配置、远程通知服务、后台 daemon 或第二套更新器。
- 不让 Buildr Web 直接执行 npm 更新。
- 不改变 development checkout 的 Git 更新语义。
- 不自动安装、自动切换轨道、自动降级或修改 Workspace Node/Agent runtime。

## Decisions

### 1. 一个 Application，四种只读投影

新增 Release Awareness Application。它通过现有可信 npm 执行入口一次读取 `dist-tags`，生成包含当前安装、`stable`、`candidate`、notices、freshness、blocking reasons 与 next actions 的 snapshot。CLI、Doctor、HTTP/Web 和 Skill 不各自解析 npm 输出或重新实现版本判断。

选择该结构而不是分别修改四个入口，是为了保证“GA/RC 是否存在、是否更新、该给出什么命令”只有一份语义。

### 2. 发布轨道只映射两个 npm tag

- `stable` 映射 `latest`，只接受没有 prerelease 的有效 semver。
- `candidate` 映射 `next`，只接受 prerelease semver，并在用户文案中称为 RC 候选版。

tag 缺失或类型不匹配时，该轨道不可安装并形成 notice；例如 `latest=0.1.0-rc.1` 时 GA 显示“尚未发布”，同时保留 `latest` 配置异常诊断。轨道分别与当前版本比较，不使用一次跨轨道 winner 比较。

### 3. 更新始终由用户选择，安装精确版本

`buildr update --track stable|candidate` 在执行时刷新 Release Awareness，选择对应轨道头，并继续复用现有 npm update authority 安装精确 `package@version`。目标版本不高于当前版本时不安装；低于当前版本时明确报告不会自动降级。

兼容既有无参数 `buildr update`：当前安装是 prerelease 时默认检查 `candidate`，当前安装是稳定版本时默认检查 `stable`。显式 `--track` 只选择本次更新目标，不写 Workspace 配置。development 模式仍只更新 Git checkout，拒绝 npm release track 参数。

### 4. 通知状态保持用户级和最小

在 Buildr Data Root 保存单一 `release-awareness.json`，每个轨道只记录 `lastSeenVersion`、`lastNotifiedVersion` 与检查时间。成功观测更新 `lastSeenVersion`；入口实际形成用户可见的新版本 notice 时更新 `lastNotifiedVersion`。该文件不保存 Workspace、Agent runtime 或 npm 凭证，也不是 Registry/tag authority。

### 5. Doctor 非阻断，Web 只读

Doctor 将 snapshot 放在独立 `releaseAwareness` 与 `notices` 字段，完全不进入 findings、repair plan、next steps、`ok` 或 readiness。网络失败只形成 release awareness 的 unavailable 状态。

Buildr Web 使用全局只读 `/api/v1/release-awareness`，在 App shell 顶部显示通知。按钮只复制精确命令或可交给 Agent 的 prompt；HTTP 不提供 npm update mutation endpoint。

### 6. 发布冻结并核验两个 tag

发布 job 在公开 mutation 前读取并保存 `{latest,next}`，发布后再次读取两者：RC 要求 `next` 等于新版本且 `latest` 等于发布前值；GA 要求 `latest` 等于新版本且 `next` 等于发布前值。两次读取都校验 `latest` 为稳定 semver、`next` 为 prerelease；历史上 `latest` 已错误指向 prerelease 时，RC 发布允许保留该既有异常但不得改变它，GA 发布必须修正为新稳定版本。

## Risks / Trade-offs

- [Registry 查询增加 Doctor/Web 延迟] → 使用有界查询与 freshness cache；失败只影响版本通知。
- [旧 Agent 只理解 update-check/v1] → 使用明确的 v2 schema major，并同步更新产品 Skill 与 contract tests。
- [CLI、Doctor、Web 同时通知造成打扰] → 共用每轨道最小 notified 状态，不建立复杂订阅系统。
- [发布期间 tag 被外部修改] → 比较发布前后两个 tag，发现非目标漂移立即失败。
- [开发 checkout 被误当成 npm 更新目标] → 保留现有 installation source 分支，`--track` 只允许 npm 模式。

## Migration Plan

1. 先交付 additive Release Awareness Application 与用户级状态 repository。
2. 将 update check/update JSON 切换到 v2，并同步 CLI text 与 Buildr Skill。
3. 接入 Doctor、Buildr Web API/UI 和前端构建产物。
4. 最后收紧 release workflow 的双 tag readback；不执行真实发布。

回滚时可以移除 Doctor/Web/Skill 投影并恢复旧 update JSON，但已经写入的用户级通知文件保持无害、可忽略，不影响 Workspace。

## Open Questions

无。用户已确认完整通知渠道、简单双轨道模型和显式更新选择。
