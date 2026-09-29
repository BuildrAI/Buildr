## 背景

本变更把 Buildr 的 Agent runtime 接入面从"每个品牌一套适配器"收敛为"标准协议 + 有证据的例外"。判据不是趋势判断，而是逐品牌的宿主原生能力取证，以及现有代码的真实依赖结构。

## 决策一：唯一保留的例外是 Claude Code，且它的规则桥反而比原生路径更可靠

Claude Code 官方文档（`How Claude remembers your project`、`Extend agents with skills`）给出的证据是双向的：

| 能力 | 结论 |
|---|---|
| 原生读 `AGENTS.md` | 有条件：需 v2.1.277 及以上；默认只在工作目录及其所有上层目录都不存在 `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md` 时才读；版本过低、内置 `agents-md` 插件被关、升级后首次会话，以及 v2.1.281 之前关闭遥测或走 Amazon Bedrock 的会话都不读 |
| 原生读 `.agents/skills/` | 不支持。技能发现路径只有 `~/.claude/skills/`、`.claude/skills/`（含嵌套与 `--add-dir`）与插件 `skills/`；官方规则文档明确写出 `.agents/` 目录下的内容不被读取 |

因此退役 `claude-code` 会让 Claude Code 用户完全失去 Buildr 的 Skill，并让规则生效依赖"用户本机不存在任何 CLAUDE.md"这一脆弱前提。这与本变更要减少的静默失败恰好相反。

一个反直觉但重要的结论：现有实现写在 `CLAUDE.md` 里的受管区块内容就是 `@AGENTS.md` 一行引用，而官方文档把"从 `CLAUDE.md` import `AGENTS.md`"列为老版本与会话受限时的**推荐兜底**，且该路径下 `InstructionsLoaded` 钩子照常触发。所以引用桥不是遗留负担，它是让规则在所有模式下都成立的最小机制，符合"例外只填补缺口"的契约。

对照之下，其余四个品牌不需要例外：Cursor 官方文档声明原生读取项目根与子目录 `AGENTS.md`，并从 `.agents/skills/`（含嵌套目录）自动加载技能；Qoder 官方文档声明 IDE 规则兼容 `AGENTS.md`；TRAE 与 WorkBuddy 的公开证据不足或明确受限，但它们在本仓已有 `standard-default` 政策下按标准投射处理，不再单独维护品牌文件约定。

## 决策二：保留 `runtimeId` 身份模型，退役品牌解析到标准

`runtimeId` 是归属回执、doctor 的 `requested`/`selected` 事实和"以后新增例外适配器"开关的底座。删除它需要重新发明身份模型，成本远大于收益。

因此 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 仍然可以出现在 `--agent`、`buildr sync <brand>` 等入口，只是解析结果从"品牌适配器"变为 `agents-standard`，身份被原样保留。这样既有用户的命令继续可用，且 `runtime list` 的 `runtimeMappings` 不再需要为每个退役品牌写条目——它们走 `standard-default`。

`codex`、`dsh` 的 host profile（例如 `agents/openai.yaml` 发布扩展）与 `unknownRuntimePolicy: standard-default` 保持不变；它们是上一个变更刚建立的标准默认事实，不属于本次要退役的厂商适配器。

## 决策三：拆除既有投射是产品能力，不是一次性脚本

`.gitignore` 忽略 `.claude/`、`.trae/`、`.cursor/`、`.qoder/`、`.agents/` 与 `.buildr/agent-runtime/`，所以退役后的残留对代码评审不可见。如果只删代码不处理投射，141 个文件的陈旧副本会永久留在每台开发机上，内容与 `AGENTS.md` 悄悄漂移，而没有任何入口会报告它。

因此本变更把退役处理做成产品能力：在受管操作中识别已知退役适配器的投射，按受管标记或所有权回执证明所有权后删除，无法证明时保留并报告。约束沿用既有不变式——只删能证明所有权的、冲突时整组零写入且可回滚、幂等。这样无论哪台机器上残留了哪个品牌的投射，都会在下一次同步时被正确处理，而不是依赖某个人记得跑脚本。

本机现状（`codex` 空命名空间、`.qoder/` 146 个文件）说明上一次"收揽到标准"没有做完整拆除，正是本决策要修掉的那类问题。

## 决策四：删除安装与版本探测机制，而不是保留

核对发现 `installationProbe` 与 `versionProbe` 在生产 descriptor 中没有任何真实声明：只有 `claude-code` 与 `agents-standard` 显式写 `kind: 'none'`，其余品牌连字段都没有。也就是说 doctor 的品牌安装与版本探测是一段**没有生产者的机制**。

删除它同时满足两个目标：减少用户可见的品牌报告面，以及去掉不会被任何调用方验证的死代码。规范中对应要求一并移除，而不是留成"以后可能用"的扩展点。

## 决策五：`--adapter` 收紧取值，但不删除参数

`--adapter` 出现在 `init`、`sync`、`render`、`doctor`、组件修复命令串与诊断建议文案中。直接删除会让用户手上照抄的旧命令变成另一条命令，而且 `claude-code` 例外仍然需要一个显式入口。

因此保留参数，把取值收紧为 `{agents-standard, claude-code}`；其他值明确失败并报告当前支持的取值，不静默回退。

## 决策六：不保留空的 registry 或 trait catalog

收敛后 `RUNTIME_ADAPTERS` 仍有 `agents-standard` 与 `claude-code` 两个真实条目，是活代码而非空扩展点，因此保留现有 registry 与 trait 校验。被删除的是这五个品牌的 descriptor 数据，以及随之失去调用方的 `vendor-rule-files` 规则组装实现。重新接入一个品牌的真实成本在调研取证，依据保留在归档的 OpenSpec change、接入指南与 Git 历史中。

## 代码结构事实（影响实施方式）

- 规则组装只有三个共享实现：`native-recursive`（标准）、`reference-bridge`（例外）、`vendor-rule-files`（五个退役品牌）。退役后只剩两个，`vendor-rule-files` 成为死代码并删除。
- `render-claude-code-rules.ts`（444 行）虽然以品牌命名，但通用投射引擎 `projection.ts`、`module.ts`、`components.ts`、`runtime-selection.ts`、`check-runtime.ts` 都从它取 `buildRuleDiscoveryPlan`、`hasManagedRulesMarker`、`planRulesRender`、`resolveRuleScope`。它是被厂商名字掩盖的共享基础设施，本变更只改名、不删除；把它当成品牌实现删除会同时打断标准投射路径。
- 品牌专属实现只有 Claude Code 的引用桥渲染，它随例外保留。

## 兼容策略与迁移风险

- 兼容：`--agent <brand>`、`buildr sync <brand>`、`runtimeId` 保留；标准投射路径与 Claude Code 桥的行为不变。
- 破坏：五个品牌不再是 `--adapter` 取值；依赖其品牌规则文件与技能镜像的宿主需要原生读取标准文件。CHANGELOG 与退役报告必须逐条说明"已移除哪个桥、宿主需要满足什么前提"，避免规则失效时用户面对静默的谜。
- 风险一：宿主版本低于其原生 `AGENTS.md` 支持门槛时规则不生效。缓解：文档与报告说明前提，不声称已证明宿主加载。
- 风险二：退役处理误删用户内容。缓解：只删可证明所有权的文件，冲突时整组零写入。
- 风险三：既有用户现场存在多份不等价受管接入。缓解：沿用既有选择规则，多个不等价选择时暂停写入并请求明确选择，不静默切换。
- 风险四（本次已修）：CLI 路由把运行时身份当成适配器标识（Adapter ID）查找。`buildr runtime check`、`skills render`、`skill install` 与 `render` 都受影响；退役前 `cursor` 等身份同时是适配器标识，掩盖了该缺陷，`buildr runtime check codex` 则一直报 `Unsupported runtime adapter: codex`。本变更新增 `resolveRuntimeAdapter(runtimeId)` 按选择规则解析身份，并把路由传入的身份显式归一为 `null`；`--adapter` 仍走严格查找，不放宽。其中 `render` 路由原先写死 `argv.slice(4)`，省略身份时会吞掉 `--target` 并把它当成身份，已改为与 `parseRuntimeCommandArgs` 同一规则。
- 遗留缺陷（不在本次范围）：共享分派器 `src/bootstrap/cli/registry.ts` 用固定下标取身份（`rawArgs[2]`），因此 `buildr skills render --target <dir>` 这类省略身份的形式仍会把 `--target` 读成身份。修根因要改所有模块共用的分派器与路由上下文契约，属独立变更；本次在测试中显式记录该真实行为，不用放宽断言掩盖。

## 验证策略

- `openspec validate retire-vendor-runtime-adapters --strict` 与 `buildr openspec convergence preflight`。
- 项目既有检查：runtime projection、adapter contract、CLI 选择、doctor、共享所有权与诊断相关测试；退役处理需要新增幂等与"不可证权只报告"的用例。
- 退役处理在隔离工作根的实测：构造可证权与不可证权两种现场，确认删除与报告行为。
- 交付后的自举同步与最终 Doctor 由唯一执行器完成。
