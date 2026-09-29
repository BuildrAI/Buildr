## Why

Buildr 目前把 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 注册为五个独立 supported runtime adapter，并为每个品牌维护专属规则桥与技能镜像。本工作空间实测：`.agents/skills/` 与 `.qoder/skills/` 各有 33 个技能、141 个文件且逐同名，另有双份归属回执。宿主原生能力取证表明标准协议已能服务其中多数品牌：Cursor 官方文档声明原生读取项目根与子目录 `AGENTS.md`，并从 `.agents/skills/`（含嵌套目录）自动加载技能；Qoder 官方文档声明 IDE 规则兼容 `AGENTS.md`；Buildr 已有 `standard-default` 政策把未知有效品牌映射到标准适配器。继续保留逐品牌投射，等于用长期镜像同步成本换取宿主已经提供的能力，并让"专有实现"缺少证据门槛。

## What Changes

- **BREAKING**：`runtime list --json` 的 `supportedAdapters` 只保留 `agents-standard` 与 `claude-code`。`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 不再注册为独立适配器（Adapter），但仍是有效运行时身份（Runtime ID），按既有 `standard-default` 规则解析为 `agents-standard`，身份不被改写也不被伪造。
- **BREAKING**：`--adapter` 只接受 `agents-standard` 与 `claude-code`，其他值明确失败，不静默回退。
- **BREAKING**：`runtime list` schema 升为 `buildr.runtime-list/v3`。
- 删除五个适配器的 descriptor、品牌专属规则投射（`.cursor/rules/buildr.mdc`、`.qoder/rules/buildr/*.md`、`.trae/rules/buildr.md`、root `CLAUDE.local.md` 桥、root `CODEBUDDY.md` 桥）与 `.qoder`、`.trae`、`.codebuddy` 技能镜像。
- 删除已无生产者的安装与版本探测机制，以及 doctor 与 runtime check 中品牌专属的安装、版本和 surface 报告。
- 新增一次性、幂等、按所有权证明的退役处理：清理 Buildr 自己写过的厂商投射与状态命名空间；不可证权只报告不猜；冲突时整组零写入且可回滚。
- 规范改为正向契约：Buildr 只支持标准 `AGENTS.md` 与 `.agents/skills/` 协议；专有实现属于例外，必须独立立项并附可审计的宿主原生能力缺口证据。已注册的例外是 `claude-code`：官方文档证明它不读取 `.agents/skills/`，且 `AGENTS.md` 规则路径受版本门槛与既有 `CLAUDE.md`/`CLAUDE.local.md` 遮蔽条件限制，因此保留一行 `@AGENTS.md` 引用桥与 `.claude/skills/` 技能根。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-first-runtime-projection`: 删除五个厂商适配器的注册、规则投射、技能根、checker、兼容证据与 Qoder 多 surface 要求；改为标准协议正向契约加有证据的例外；收敛标准默认选择，并新增退役投射的所有权清理要求。
- `human-agent-onboarding`: 删除"覆盖新增 adapters"的 onboarding 要求，改为只引导标准适配器与已注册例外。

## Impact

- 代码：`services/buildr` 的 runtime adapter contract、projection、runtime reconciler、check-runtime、CLI（`init`、`sync`、`render`、`runtime`、`doctor`、诊断与组件修复命令串）。
- 观察面：`runtime list`、`runtime check`、`doctor` 的品牌报告面收缩；`--adapter` 取值收紧。
- 用户现场：既有厂商投射（`.cursor/`、`.qoder/`、`.trae/`、`.codebuddy/`、root `CODEBUDDY.md`、root `CLAUDE.local.md`）由退役处理清理或报告。
- 不改变：`runtimeId` 身份模型；`codex`/`dsh` 的 host profile 与 `unknownRuntimePolicy: standard-default`；Claude Code 的 `CLAUDE.md` 引用桥与 `.claude/skills/` 投射；标准 `AGENTS.md` 与 `.agents/skills/` 的既有语义。
- 破坏性：是。五个原本受支持的 adapter id 不再可作为 `--adapter` 取值；依赖其品牌投射的用户需要宿主原生读取标准文件，CHANGELOG 与退役报告必须说明已移除的桥与对宿主版本的前置要求。
