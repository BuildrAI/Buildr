# GPT-6 Astra 指令审计

2026-09-08：已完成项目指令源文件的精简与验证。依据 [GPT-6 Astra 官方模型指南](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) 的指令敏感性、授权延续、简明表达和适量验证建议，修正重复、过时及冲突的指导；业务承诺和具体写入边界继续有效。

## 范围与来源

审计覆盖 49 份当前源文档：5 份 `AGENTS.md`、28 份 `SKILL.md`、10 份参考文档和 6 份 OpenSpec 扩展片段。另核对相关能力契约（Capability Contract）、资源清单、引导校验声明、当前规范和测试，并修订受影响的兜底指南与校验位置。

- 产品随包规则和技能从 `services/buildr/resources/` 修改；工作空间（Workspace）中的 `skills/buildr/` 与 `.agents/skills/` 是生成副本，本轮未手改。
- 根 `AGENTS.md` 只精简区块外的重复语言说明。核心规则修改位于随包模板，根受管区块（Managed Block）的原字节保持不变。
- 6 份第三方 OpenSpec 技能原文、已有扩展片段、发布与自举技能、历史案例均保留。未修改个人安装的其他技能、模型参数、应用权限或业务代码。

## 修改与依据

| 问题 | 实际修改 | 保留的边界 |
|---|---|---|
| 同一任务跨轮次后重复索取授权 | [核心规则](../services/buildr/resources/workspace/AGENTS.md) 与 [Git 技能](../services/buildr/resources/workspace/skills/buildr/git-operations/SKILL.md) 明确已有授权的适用条件；需要暂停时说明具体条款 | 每次写入仍检查对象、版本、范围与副作用；其他任务、目标变化或授权撤回不能沿用 |
| Buildr 入口重复说明更新、同步、资产生命周期 | [入口技能](../services/buildr/resources/runtime/skills/buildr/SKILL.md) 各保留一条更新与同步路径；新增按需读取的资产维护与运行时（Runtime）参考文档 | 更新轨道由用户选择；组件（Component）卸载需完整范围确认；绑定、所有权和诊断继续检查 |
| 调用方一律要求长期声明写入再次确认 | Buildr 资产参考与 [任务分流技能](../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md) 对齐现有 `routine-maintenance` / `user-decision-required` 分类 | 新范围、新能力、外部效果和长期边界变化仍需用户决定，由原声明所有者写入 |
| 普通分流总要加载完整 Git 创建与恢复流程 | 将逐仓库基线放入 [按需参考](../services/buildr/resources/workspace/skills/buildr/task-triage/references/task-create-git-baseline.md)，只在新建或激活正式任务时读取 | 完整仓库集合、独立 `fetch` / `rebase`、有界恢复与部分成功的报告要求保留 |
| 前端规则重复，并混用旧页面目录与现有功能目录 | [前端规则](../services/buildr-web/AGENTS.md) 合并组件、样式和状态约束，按当前 `features/` 结构说明归属 | Ant Design、同源打包、生产托管验收、稳定 DOM 钩子、数据访问与全局状态引入授权保留 |
| 产品规则仍正向要求已退役的 Task Environment | [产品规则](../AGENTS.md) 改为真实隔离目录及内容归属；产品专用冒烟隔离指导移到 [服务规则](../services/buildr/AGENTS.md) | 未集成候选不能更新保留的自举工作空间（Workspace）或共享用户运行时（Runtime）；唯一自举执行器不变 |
| 测试模型重复，常规维护被引向不必要的额外验证 | [测试技能](../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md) 按实际风险选择，模型定义留在参考文档；补上验证声明参考入口 | 项目必需检查、已知受影响重型测试、可证伪断言、状态隔离和真实未覆盖项仍保留 |
| 复盘技能源文件写死 Codex 路径与所选提供者 | [复盘技能](../services/buildr/resources/workspace/skills/buildr/task-retrospective/SKILL.md) 删除生成绑定块，改为消费当前运行时（Runtime）的绑定 | `buildr.task-record/v3` 依赖、终态限制、本机文件与用户决定边界不变 |
| 查看每日演进可能进入同步与写入流程 | [每日演进技能](../services/buildr/resources/workspace/skills/buildr/project-daily-progress/SKILL.md) 显式区分查看与生成 | 查看只读已保存文件；生成和重跑仍执行原同步与记录检查 |
| 引导校验强制旧标题及完整内联维护正文 | 更新 [引导校验声明](../services/buildr/resources/contracts/bootstrap.yml) 与两份测试的读取位置，补充资源映射；[兜底指南](../services/buildr/docs/bootstrap-guide.md) 同步授权表述 | 关键命令、当前宿主身份、禁止跨适配器借用、源与投射分离、随包完整性检查保留 |

## 体量

以 UTF-8 文件字节数比较，新增按需参考计入相应总量；这不是词元（Token）或运行耗时测量。

| 文档 | 修改前 | 修改后 | 减少 |
|---|---:|---:|---:|
| Buildr 入口 `SKILL.md` | 32,455 | 10,146 | 68.7% |
| 前端 `AGENTS.md` | 8,673 | 4,709 | 45.7% |
| 任务分流入口 `SKILL.md` | 14,007 | 11,356 | 18.9% |

原 49 份文档合计 266,903 字节；加上新增的 3 份按需参考后为 257,161 字节，减少 3.7%。上述合计不包含本审计报告与校验声明；主要收益来自减少入口默认加载的细节，不把移动到参考文档的内容算作删除。

## 验证结果

- 53 项相关契约检查通过；最终文案调整后，受影响的 13 项检查再次通过。
- 随包 `static,skills,runtime` 检查通过，覆盖 12 个包含项、137 个文件。
- 7 种受支持运行时（Runtime）的 25 个随包技能完整目录投射通过，参考文件按源字节保留。
- Codex 隔离初始化与重复同步验证新增参考文件、单一生成绑定块及最新核心规则；最终 Doctor 无警告、无错误。
- 通用技能格式校验通过 22 份自有技能。6 份第三方 OpenSpec 原文包含通用校验器不支持的 `compatibility` 字段，保持上游格式，使用已通过的 Buildr 随包及适配器检查验证。
- 新增引用可解析，资源映射覆盖新增文件，`git diff --check` 通过；测试使用的隔离目录均已清理。

初次随包检查发现旧标题和内联正文要求，已修订声明后通过。额外 Codex 场景最初因测试工作空间（Workspace）缺少说明触发 `workspace.description_todo`，补全测试输入后通过，未放宽诊断断言。

人工按文案核对了授权延续、范围扩大、只读查看、正式任务基线、声明维护、发布、删除及父任务完成分支。本轮没有运行模型行为对照试验，不以静态检查或字节减少宣称模型质量、成本或速度已提升。

## 审计阶段的生效范围

以下记录源文件审计完成时的现场，后续交付以 Git 与实际同步结果为准。当时尚未提交、推送、发布或激活受管副本；工作空间（Workspace）Doctor 为零错误、两项待同步警告：`rules.required_block_invalid` 与 `runtime.codex_stale`，分别对应旧核心区块与旧 Codex 投射尚未匹配新源文件，并非隔离验证失败。

正式交付后，仍由 [唯一自举技能](../../../skills/buildr-self-bootstrap-sync/SKILL.md) 激活。该技能明确要求“任务已经完成，且明确的基线到交付提交命中实际自举输入时”才使用其执行器。本轮不补造任务或交付证据来同步受管副本。
