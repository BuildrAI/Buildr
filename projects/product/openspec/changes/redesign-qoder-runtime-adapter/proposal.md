## Why

Qoder 已从早期的单一 IDE 形态演变为三种并存安装（桌面 App `com.qoder.app`、Qoder IDE `com.qoder.ide`、独立 Qoder CLI），而 Buildr 的 `qoder` adapter 仍按旧形态声明能力，产生两类真实错误：

1. Skills 投射根不完整。本机可核验事实：`.qoder/skills` 缺少 `archify` 与 `code-map` 时，宿主 Qoder 会话仍然发现了这两个 workspace Skill，因为它们只存在于 `.agents/skills`。官方文档只承诺 `.qoder/skills` 与 `~/.qoder/skills`，而 `.agents/skills`（业界通用 Agent Skills 目录）在 Qoder 侧由 `skills.loadFromAgentsDirectory` 控制：CLI 默认关闭，桌面 App 主进程显式开启。当前 adapter 声明单一 `.qoder` root，等于把桌面 App 的真实发现根留在投射之外。
2. 环境探测与门禁错配。adapter 的 installation/version probe 是 PATH 上的 `qoder --version`，而 Qoder CLI 是需另行安装的独立产品，因此该 probe 在只有桌面 App 或只有 IDE 的机器上必然失败；探测失败被无条件标为 `userActionRequired: true`，进而使 `health.ready` 为 false，并阻塞以 `ready` 为完成条件的正式自举激活——投射一致性明明已经验证通过，却因宿主可执行文件缺席被否定。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：Qoder Skills 投射改为 `.agents/skills` 与 `.qoder/skills` 双根并声明两种根各自的发现语义与 activation；Qoder checker 改为平台化的安装形态探测（macOS bundle 与 CLI 命令并存，且 surfaces 声明含 `cli`），不再要求 PATH 上存在 `qoder` 命令。
- `agent-readable-doctor`：明确"宿主安装形态探测缺席但投射 identity 已核对一致"属于非行动型诊断，不得计入 actionable 或降低 `health.ready`。

Rules 投射（`.qoder/rules/buildr/*.md` 与 `trigger: always_on` / `trigger: glob` 映射）经与官方规则 frontmatter 语义核对后确认正确，本变更不修改。

## What Changes

- Qoder adapter 的 Skills trait 声明双 workspace destination root：`.agents/skills` 与 `.qoder/skills`，两处都受 Buildr 管理、各自出具所有权回执，并纳入统一 preflight 的名称冲突治理与 orphan 清理。
- Qoder adapter 的 `surfaces` 增加 `cli`，与既有 `ide` 并列，使 Qoder CLI 与桌面 App/IDE 成为各自可探测的一等安装形态。
- Qoder installation/version probe 改为平台适配的组合探测：macOS 按 bundle identifier 判定桌面 App 与 IDE 是否存在，CLI 面保留静态 `qoder --version`；任一安装形态命中即视为安装存在，全部无法自动确认时按既有规则使用 `manual` probe 与确认 guidance。
- 环境探测缺席的 finding 不再要求用户动作，不再阻塞 `health.ready`、`sync` 与正式自举激活；需要用户行动的仍是投射缺失、过期或冲突。
- 无 **BREAKING**：`.qoder/skills` 继续投射，既有 workspace 的 Skills 内容、Rules 与命令接口不变；新增的 `.agents/skills` 投射是增量文件，不影响其它 adapter 共用的 `.agents` 内容归属。

## Impact

- 实现：`services/buildr/src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts`（qoder descriptor：skills roots、surfaces、checker probes）、`projection.ts`（双根 Skill 投射与 discovery inventory）、`skills/…` 通用 roots 抽象（如需支持一个 adapter 声明多个 Skills root）、`services/buildr/src/modules/agent-assets/infrastructure/runtime/check-runtime.ts`（probe 结果与 `userActionRequired` 判定）、`modules/diagnostics/application/result-model.ts` 的消费侧不变但需覆盖新语义。
- 公开输出：`runtime list --json`、`runtime check qoder`、`doctor --agent qoder` 的 traits、evidence 与 findings；`buildr sync qoder` 写入的 runtime 文件集合。
- 验证：adapter descriptor/plan/projection/checker 的 contract tests，Qoder 双根投射与清理用例，doctor readiness 用例，以及本机 Qoder 真实加载观察。
- 文档与知识：runtime adapter 相关代码地图、`archify/flows/skill-projection` 技术图与 adapter 说明需按真实成果校准。
