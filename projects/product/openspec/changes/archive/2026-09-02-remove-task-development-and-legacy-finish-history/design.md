## Context

Task Development 当前通过唯一 Application 和 `task_development_current` 聚合 Task Record、OpenSpec planning、Environment scopes、内容摘要、Current Knowledge、Task Candidate、`proceed|blocked` 与 Development Handoff。消费者解耦后，Review、Verification、Parent、Overview完成判断和默认 Task Finish 已能在没有 Development Receipt 时工作；剩余调用者主要是 OpenSpec sidebar、只读研发页、runtime/Doctor、自身测试和发布任务关联中的可选字段。

Task Planning Identity 是只读 OpenSpec 语义摘要器，现有强消费者只是 Development planning；Planning Review 可以直接审查当前 proposal、design、delta specs 和 tasks，并由 Agent 判断非语义 checkbox/provenance 变化。旧 Task Finish Application 已停止创建 run，只剩 `task_finish_current`、`task finish inspect`、`task delivery inspect`、Terminal Delivery 和 Web 历史展示。用户明确接受删除两张表全部数据及旧机器交付证据。

当前单一 Git 仓库包含 Product governance、Buildr Service 和 Buildr Web Service。迁移必须使用 Node 24.15.0，保留 OpenSpec、Task Record、Environment、Review、Verification、Retrospective、Current Knowledge、默认 Skill-only Task Finish 与 Product/Release Candidate。

## Goals / Non-Goals

**Goals:**

- 删除 Task Development 与 Task Planning Identity 的领域、应用、持久化、接口、Skill、binding、UI、规范和专属测试。
- 删除旧 Task Finish/Terminal Delivery 历史应用、接口、UI、规范和全部 `task_finish_current` 数据。
- 让 OpenSpec、Current Knowledge、Review、Verification、Overview、Task Record、Environment、Retrospective、默认收尾和发布任务关联只依赖自己的真实事实。
- 保留并修改的相关人工源码和测试使用 TypeScript 单一来源，删除 `@ts-nocheck` 与不必要的 `any`/类型断言。
- 在 fresh database 与现有 Workspace 升级中直接删除两张表，不建立兼容读取或历史替代表。

**Non-Goals:**

- 不修改 Product/Release Candidate source、generation、verification owner、CI shard、aggregate、唯一 tarball、release selection、tag、npm 或 protected publication transaction。
- 不重新设计 Task Record、Environment、Review、Verification、Parent、Retrospective、Current Knowledge 或默认 Task Finish。
- 不保留、导出、转换或备份 Task Development/旧 Finish 数据。
- 不修改 archived Changes，不建立新的统一流程、状态机、许可层或历史系统。

## Decisions

### 1. 整体删除，不保留缩小版研发能力

Task Context、planning、Content Target、Current Knowledge 和交付事实都能从真实 owner 重新观察；Candidate、generation、decision 和 handoff 已无 current consumer。删除 Application、capability 和全部接口，不保留只读 stub、转发或 `missing` 占位。

替代方案是保留 Content Target observer 或 Development history reader，但当前没有独立消费者，仍会维持第二事实源和兼容负担，因此不采用。

### 2. Task Planning Identity 一并删除

OpenSpec strict validation 和 Buildr convergence preflight 已保护结构、冲突和 canonical 写入。Planning Review 是 Agent 选择的可选专业动作，可以直接读取当前 artifacts，并使用真实文件/Git/Change identity作为审查对象。删除专用 parser、Application 和 internal route。

替代方案是把它保留为无状态 helper；但其唯一稳定调用链仍来自 Development，且 Task Review Application不比较适用性，独立模块收益不足，因此不采用。

### 3. 两张 current 表直接 DROP

新增连续 migration，在既有 0026 Parent Plan迁移之后执行 `DROP TABLE task_development_current` 与 `DROP TABLE task_finish_current`。不复制数据，不改写 Task Record，不建立 `_history` 表。旧 Parent Plan 已在 `tasks.legacy_parent_plan_json`，继续由 Task Record只读展示。

Migration 在 drop 前校验目标表存在，fresh install 与现有升级使用同一顺序。删除是用户明确授权的不可逆副作用；代码回滚不能恢复数据，数据库恢复只能依赖用户自行持有的外部备份，本产品不生成新备份。

### 4. 删除旧 Finish 集群，保留默认收尾

删除 Task Finish Domain/Application/repository、五阶段 Result projection、Terminal Delivery Application、`task finish inspect`、`task delivery inspect`、Finish HTTP/read worker/Web历史区域及专属 tests。`task-finish` Skill继续组合 Task Record、Git、业务工具和 Task Environment cleanup，不调用旧 Application。

Overview 以 Task Record表达 completed/abandoned；没有旧机器交付标签。已成立的当前 Git/外部结果仍由 Agent在收尾时实时回读，不迁移到新表。

### 5. OpenSpec 与 Current Knowledge 直接退出聚合

OpenSpec propose/update/apply 保留 Task Record、必要 Environment、strict validation、semantic preflight、Current Knowledge 和 convergence；删除 `begin/planning/observe/freeze/decide/handoff` 以及 Planning Identity调用。Current Knowledge provider直接向 Agent返回结果，真实文档与 Change sidecar保持authority；`blocked`只影响真实依赖该冲突的Agent判断，不写统一决定。

### 6. 发布只解除 Task evidence 残留

Release task correlation 新输入/输出删除 `development` 与旧 `finish` role，使用 Task Record、Environment、真实Git/remote、self-bootstrap和Product Candidate owner facts。历史 correlation schema只在仍被正式发布证据读取时有界解码，不重新引入 Task Development/Finish Application。

Product Candidate 的冻结source、generation、CI、aggregate和tarball字段不变，并用现有release测试保护。

### 7. TypeScript 切换不保留双源码

专属 Task Development/Planning Identity/旧 Finish实现和测试直接删除。仍需修改的共享 composition、Overview、HTTP、read worker、release correlation、contract generator、Doctor/static validation及测试一次迁移到 `.ts`，同步更新显式import和package构建入口；不保留同名 `.mjs`。

Buildr Web已有 `.tsx/.ts` 保持严格类型，删除研发/历史状态和 `any`。生成的Application Payload、DTO投影、JavaScript和声明只作为构建产物；`web-dist`若仍由package manifest要求则由正式构建生成，不手改。

## Risks / Trade-offs

- [历史机器交付证据永久丢失] → 用户已明确接受；migration不声称可恢复，也不建立新历史系统。
- [旧自动化仍调用内部 route、HTTP 或 inspect命令] → 同一版本删除Skill、help、binding和调用者；旧入口返回未知命令/404且零副作用，不提供兼容转发。
- [OpenSpec sidebar遗漏真正的语义保护] → 保留strict validation、semantic preflight和convergence，测试覆盖proposal/apply在无Development/Planning Identity时完成。
- [删除共享Finish代码误伤默认收尾或self-bootstrap] → 以Task Finish Skill、Task Record、Environment cleanup和self-bootstrap直接模式为保留边界，分别验证。
- [发布回归误改Product Candidate] → release candidate实现不做结构性重构；运行candidate/release contract与correlation测试确认source/generation/tarball不变。
- [大范围TypeScript迁移扩大改动] → 只迁移本次实际保留且修改的共享边界；删除文件不迁移，不触及无关领域。

## Migration Plan

1. 先切断OpenSpec、Current Knowledge、Review/Verification说明、release correlation、Overview、HTTP、Web和runtime composition消费者。
2. 删除Task Development、Task Planning Identity、旧Finish/Terminal Delivery实现、Skill、contract、JSON schema和专属测试。
3. 增加连续SQLite migration，直接删除两张表，并验证现有Workspace升级和fresh database。
4. 将保留且修改的共享源码/测试切换为TypeScript单一人工源码，更新build/package/runtime入口。
5. 更新canonical specs、当前认知、术语和路线图；不修改archive。
6. 运行类型、Unit/Component/Contract/Integration/System、OpenSpec、Web Browser、package/npm和release candidate回归。

代码回滚只能恢复接口与实现，不能恢复已删除历史数据；本变更发布后若需重新提供历史能力，必须从新的真实需求设计新模型，不能从旧字段推断。

## Open Questions

无。整体删除、历史数据丢失、不做UI Prototype和发布候选非目标均已由用户确认。
