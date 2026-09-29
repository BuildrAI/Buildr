# 接入新的智能体运行时

本章面向 Buildr 维护者，说明如何增加智能体运行时适配器（Agent Runtime Adapter）。现有接入方式和限制见[适配说明](../../../services/buildr/docs/agent-runtime-adapters.md)，当前支持清单由 `buildr runtime list --json` 提供。普通用户无需执行本章流程。

## 先确定要接入的对象

先区分运行时身份 `runtimeId` 与文件适配器（Adapter）身份 `adapterId`。`agents-standard` 提供原生 `AGENTS.md` 和一级 `.agents/skills/<skill-id>/SKILL.md`；`codex`、`dsh`、已退役品牌（`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy`）及未登记但语法有效的品牌默认复用它，无需先新增描述符（Descriptor）或扩展通用技能（Skill）的品牌白名单。品牌未知时可省略身份，不冒用另一个品牌。

只把品牌注册为独立的专有例外（Exception）时，必须先给出可审计的宿主原生能力缺口证据：说明宿主为什么不读标准 `AGENTS.md`（含版本门槛与遮蔽条件）或不读 `.agents/skills/`（含官方文档明确排除的路径）。缺少这类证据时不得注册适配器（Adapter），因为逐品牌投射会把镜像同步成本变成长期默认维护面。仅刷新说明或可选附加资源校验优先作为宿主资料（Host Profile）表达，不复制同一标准实现。只调查相关事实，不收集目标产品的全部功能。

同一品牌的命令行（CLI）、集成开发环境（IDE）、桌面或云端入口可能使用不同机制，应分别记录入口、版本和操作系统。未知品牌选择标准是预先确定的选择规则，不是执行失败后的回退；显式未知 `--adapter` 必须报错，已选实现失败不得换目录重试。

## 收集必要事实

在目标产品的实际入口中，请智能体（Agent）按下表回答。优先保存当前版本的直接观察、官方资料或发现机制源码；不确定填 `null`，无法执行的检查写 `not_run`。不要修改现有项目，需要试验时使用临时工作空间（Workspace）。

| 信息 | 需要回答的问题 |
| --- | --- |
| 身份与入口 | 正式产品名、真实 `runtimeId`、实际入口、版本、构建号、操作系统；是否复用 `agents-standard`，或什么文件差异需要专用 `adapterId`；其他入口是否共用配置；如何只读查询版本 |
| 规则（Rule）发现 | 准确文件路径、嵌套作用域、合并顺序、兄弟目录与多根目录隔离、引用语法或专用格式 |
| 技能（Skill）发现 | 项目路径与用户路径、同名优先级、新增和删除后的生效方式；每条路径究竟承担发现、内置资源、界面展示还是写入白名单职责 |
| 生效与刷新 | 规则（Rule）和技能（Skill）分别是在写入后、读取路径时、新会话开始时还是显式刷新后生效；需要刷新时的准确命令或操作 |
| 安装与版本事实 | 宿主如何只读查询版本或安装形态；产品不再执行安装与版本探测，这里只记录给人看的事实与前提，不能假造探测方式 |

对应特征（Trait）的候选值为：

- 规则（Rule）：`native-recursive`、`native-root`、`reference-bridge`。
- 技能（Skill）：`agents-compatible`、`vendor-root`。
- 生效方式：`immediate`、`path-read`、`session-start`、`explicit-reload`、`host-dependent`；最后一项保持宿主行为未确认，不虚构刷新保证。

路径存在、安装包出现字符串或文件生成成功，都不能证明智能体（Agent）会发现它。每条路径记录用途：`project_discovery`、`user_discovery`、`builtin`、`editor_ui`、`sandbox_writable` 或 `unknown`。项目发现目录须有明确资料、发现机制源码或可重复的本机观察支持；推测不能独立作为注册依据，证据冲突时保留冲突并暂停受影响能力的登记。

## 保留可复核的调研结果

用简短结论说明已知事实及缺口，再提供结构化材料。下面是调研交接示例，不是产品接口或自动注册格式；字段可补充，未知值保持 `null`，不要用空字符串伪装已知事实。

```json
{
  "identity": {
    "name": null,
    "runtimeId": null,
    "adapterId": "agents-standard",
    "dedicatedFormatReason": null,
    "surface": null,
    "version": null,
    "build": null,
    "os": null,
    "sharedWithOtherSurfaces": null
  },
  "rules": {
    "kind": null,
    "entries": [],
    "discovery": null,
    "mergeOrder": null,
    "siblingIsolated": null,
    "multiRootIsolated": null,
    "referenceOrFormat": null,
    "activation": null
  },
  "skills": {
    "kind": null,
    "projectRoot": null,
    "userRoot": null,
    "otherObservedPaths": [],
    "duplicatePriority": null,
    "activation": null
  },
  "reloadGuidance": null,
  "checker": {
    "installation": { "kind": null, "command": null, "evidence": null },
    "version": { "kind": null, "command": null, "evidence": null }
  },
  "tests": [],
  "evidence": [],
  "blockingUnknowns": []
}
```

`evidence` 的每项包含 `claim`、`level` 和 `source`；`level` 区分 `observed`、`official_documentation`、`source_code` 和 `inferred`。`tests` 的每项包含 `name`、`status` 和 `observation`，其中 `status` 使用 `pass`、`fail` 或 `not_run`。`otherObservedPaths` 的每项记录 `path`、`purpose` 和 `evidence`。这些标签描述调研依据，不是适配器（Adapter）的支持等级。

需要核对真实发现行为时，按问题选择临时试验：根及子目录规则（Rule）、兄弟目录隔离、项目技能（Skill）发现、修改后的刷新。能使用产品自带的无界面命令时记录准确入口；兄弟目录隔离须保留实际工具路径或等价证据，不能只采信智能体（Agent）自述。无法验证的范围明确保留，文件投射成功不能描述为当前会话已经加载。

## 实现与完成标准

标准文件准备无需逐品牌登记。若只补充宿主资料（Host Profile），核对其当前事实及证据，不能将未经验证的发现/加载写成保证。新增专用文件行为时，再通过任务分流形成独立 OpenSpec 变更并在隔离位置实现；每个文件适配器（Adapter）须覆盖 `rules-entry`、`product-buildr-skill`、`workspace-project-skills`、`skill-install-plans`、`runtime-check` 五项能力。

只读取根规则（Rule）的专用产品还需覆盖嵌套作用域，`native-root` 不能单独证明完整的 `rules-entry`。只能通过界面上传、Buildr 无法检查更新和删除的技能（Skill），应提供连接或手工说明，不伪装成完整文件适配器（Adapter）。这些限制不否定标准文件可以独立准备的事实。

实现使用严格的 `getRuntimeAdapter(adapterId)` 查找文件描述，品牌选择通过 `resolveRuntimeSelection({ runtimeId, adapterId })`；不要让严格查找接受任意未知值。保留请求身份、实际适配器（Adapter）、选择原因与宿主证据。标准没有厂商元数据（Vendor Metadata）；例如 Codex 的可选 `agents/openai.yaml` 只由对应宿主资料（Host Profile）校验。

标准技能（Skill）采用一级标识目录，随附资源保持相对路径；共享 `.agents/skills/` 的所有文件归属为 `agents-standard`，不再有按品牌的技能根。运行计划、路径保护、冲突预检、归属证明和清理机制统一复用，不为新品牌重写。退役适配器的既有投射由退役处理按所有权证明清理：可证明属于 Buildr 的删除，无法证明的保留并报告，无法安全分离时整组零写入，不能凭名称或生成标记接管。

完成时核对：

- 特征（Trait）组合通过校验，五项能力分别有可复核依据。
- 按真实差异验证：标准复用覆盖选择、真实身份与证据边界，专用实现另覆盖格式、作用域顺序、兄弟隔离、目录与清理；不为每个标准品牌复制同一文件投射测试，也不为已删除的安装/版本探测保留机制。
- 通用技能（Skill）不列品牌白名单，明确限制按真实 `runtimeId` 生效；共享根中的有效他方文件不被删除，内容或能力绑定（Capability Binding）不一致时不能后写覆盖。迁移测试覆盖等价、漂移、未知额外文件、多份回执（Receipt）不一致和失败回滚；预检失败整组零写入。
- 描述符（Descriptor）只保存官方资料、随包资料、明确发现源码或可重复本机观察，不维护 `documented/verified` 等等级，也不保存品牌历史冒烟状态。
- `runtime list`、诊断输出、Buildr 技能（Skill）和产品文档一致，相关正式规范与适用验证满足当次范围。

Buildr 当前不提供统一的真实会话标记冒烟（Marker Smoke）或 `SMOKE_PROMPT.md` 生成流程。专项验证只证明实际执行的入口、版本和行为，不升级成“该品牌在所有当前会话均已加载”的承诺。

依据：[运行时投射规范](../../../openspec/specs/workspace-first-runtime-projection/spec.md)、[适配约定实现](../../../services/buildr/src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts)及[当前适配说明](../../../services/buildr/docs/agent-runtime-adapters.md)。
