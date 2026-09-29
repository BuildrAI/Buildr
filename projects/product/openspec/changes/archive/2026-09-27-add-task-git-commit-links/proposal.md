## Why

任务目前不能直接查看关联的 Git 提交（Commit），从提交说明（Commit Message）也无法稳定回到任务目标。用户需要在同一任务内查看多次提交的说明与哈希值（Hash），并在有明确任务时把任务编码写入实际提交，以支持回顾和接续。

## What Changes

- 有明确任务的 Git 提交（Commit）保留语义化主题，在正文末尾加入 `Buildr-Task: <taskId>` 尾注（Trailer）；无任务的提交继续可用，不补建任务。
- 提供任务限定的只读提交查询，读取任务范围内真实代码库（Repository）的当前可达提交，包括本机尚未推送的提交。以真实代码库和完整哈希值（Hash）去重，用实际尾注解析唯一任务归属。
- 任务详情在“任务收尾”后增加第五个阅读标签“提交记录”；它是阅读入口，不增加工作阶段或任务状态。展示说明、哈希值（Hash）、作者、提交时间及代码库，支持展开与复制。
- 明确双向关联的成立条件、读取覆盖范围及局部失败；旧提交不因补编码而改写，历史重写后的旧身份不冒充当前结果。
- 更新随包提交和收尾技能（Skill）的使用指引，让智能体（Agent）写入并回读任务编码，用户无需逐条手动登记。

本变更不包含破坏性变更（Breaking Change）或现有数据迁移，不改变任务记录的顶层结构，不增加强制钩子（Hook）、代码差异浏览、分支管理或复杂统计。用户已确认界面原型（UI Prototype）并授权实施真实 Git 查询和提交关联；展开详情去掉重复的“关联当前任务”提示，完整提交说明中的任务编码继续保留。

用户已另行明确授权修复“有任务却在任务中看不到原型”的长期问题：已有任务的原型默认归入任务可发现范围，不以决定实施或必须先建规范变更（OpenSpec Change）为前提；没有关联变更时，允许从明确的本机任务原型目录受限读取，并补齐源技能（Skill）指引和安全验证。

## Capabilities

### New Capabilities

- `task-git-commit-links`：定义任务与真实 Git 提交（Commit）的编码约定、当前可达范围的双向读取、局部诊断、智能体（Agent）使用边界及任务详情阅读入口。

### Modified Capabilities

- `ui-prototype`：已有任务的原型默认归入，支持没有关联变更时的任务限定本机发现，保持标记、大小、路径及只读边界。
- `buildr-web-client`：任务详情不再以关联变更为读取前置；原型接口（API）区分本机任务与变更来源，并保持局部失败隔离。

## Impact

- `services/buildr/src/modules/task/`：新增任务提交读取应用及命令行（CLI）、超文本传输协议（HTTP）客户端入口，复用任务范围与真实代码库（Repository）解析。
- `services/buildr-web/src/features/task/`：在现有任务详情和阅读状态中承载提交列表，使用同源客户端与生成类型。
- `services/buildr/resources/workspace/skills/buildr/git-operations/SKILL.md`、`task-finish/SKILL.md`：补充明确任务编码、真实回读及读取失败的表述，不恢复已退役的收尾执行应用。
- `knowledge/docs/architecture/task-system.md`、`knowledge/code-map/task-system.md` 和任务交付图的来源说明：按实际实现校准新增读取职责，并区分候选代码和已安装运行版。
- 本机只读 Git 能力及现有契约、任务测试和浏览器检查；不引入外部托管服务或新的数据库权威。
- 本轮已授权修复涉及 `services/buildr/src/modules/task/change/`、任务原型客户端和随包 `ui-prototype`、`task-triage` 技能（Skill）；本机任务原型只存于 `.buildr/local/task-prototypes/<task-id>/`，不制造规范变更引用。
