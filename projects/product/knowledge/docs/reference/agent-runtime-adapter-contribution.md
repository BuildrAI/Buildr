# 接入新的智能体运行时

本章面向 Buildr 维护者，说明如何增加智能体运行时适配器（Agent Runtime Adapter）。现有接入方式和限制见[适配说明](../../../services/buildr/docs/agent-runtime-adapters.md)，当前支持清单由 `buildr runtime list --json` 提供。普通用户无需执行本章流程。

## 先确定要接入的对象

先核对 Buildr 已有能力约定，再向目标智能体（Agent）收集不能从现有描述中推导的事实，最后形成独立变更并实现。只调查有关规则（Rule）、技能（Skill）、生效方式和安装探测的信息，不需要收集目标产品的全部功能。

同一品牌的命令行（CLI）、集成开发环境（IDE）、桌面或云端入口，可能使用不同文件及刷新机制，应分别记录实际入口、版本和操作系统。适配器（Adapter）不使用别名或回退借用另一产品的实现。

## 收集必要事实

在目标产品的实际入口中，请智能体（Agent）按下表回答。优先保存当前版本的直接观察、官方资料或发现机制源码；不确定填 `null`，无法执行的检查写 `not_run`。不要修改现有项目，需要试验时使用临时工作空间（Workspace）。

| 信息 | 需要回答的问题 |
| --- | --- |
| 身份与入口 | 正式产品名、实际入口、版本、构建号、操作系统和建议 `adapterId`；其他入口是否共用配置；如何只读查询版本 |
| 规则（Rule）发现 | 准确文件路径、嵌套作用域、合并顺序、兄弟目录与多根目录隔离、引用语法或专用格式 |
| 技能（Skill）发现 | 项目路径与用户路径、同名优先级、新增和删除后的生效方式；每条路径究竟承担发现、内置资源、界面展示还是写入白名单职责 |
| 生效与刷新 | 规则（Rule）和技能（Skill）分别是在写入后、读取路径时、新会话开始时还是显式刷新后生效；需要刷新时的准确命令或操作 |
| 安装与版本探测 | 可执行文件、参数和示例输出；没有可靠命令时写明需人工确认什么，不能假造探测方式 |

对应特征（Trait）的候选值为：

- 规则（Rule）：`native-recursive`、`native-root`、`reference-bridge`、`vendor-rule-files`。
- 技能（Skill）：`agents-compatible`、`vendor-root`。
- 生效方式：`immediate`、`path-read`、`session-start`、`explicit-reload`。
- 探测方式：`command`、`manual`、`none`。

路径存在、安装包出现字符串或文件生成成功，都不能证明智能体（Agent）会发现它。每条路径记录用途：`project_discovery`、`user_discovery`、`builtin`、`editor_ui`、`sandbox_writable` 或 `unknown`。项目发现目录须有明确资料、发现机制源码或可重复的本机观察支持；推测不能独立作为注册依据，证据冲突时保留冲突并暂停受影响能力的登记。

## 保留可复核的调研结果

用简短结论说明已知事实及缺口，再提供结构化材料。下面是调研交接示例，不是产品接口或自动注册格式；字段可补充，未知值保持 `null`，不要用空字符串伪装已知事实。

```json
{
  "identity": {
    "name": null,
    "adapterId": null,
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

开发智能体（Agent）核对当前特征目录，通过任务分流形成新增适配器（Adapter）的独立 OpenSpec 变更，并在隔离工作位置实现。每个适配器（Adapter）须分别覆盖以下五项能力：`rules-entry`、`product-buildr-skill`、`workspace-project-skills`、`skill-install-plans`、`runtime-check`。

只读取根规则（Rule）的产品还需覆盖嵌套作用域，`native-root` 不能单独证明完整的 `rules-entry`。只能通过界面上传、Buildr 无法检查更新和删除的技能（Skill），应提供连接或手工使用说明，不伪装成完整的运行时适配器（Agent Runtime Adapter）。

实现通常包括独立描述符（Descriptor）、规则（Rule）投射格式、技能（Skill）目录、生效说明、探测方式和相应测试。已有静态基础能力可以复用；运行计划、路径保护、冲突预检、归属证明和清理机制不在每个适配器（Adapter）重写。

完成时核对：

- 特征（Trait）组合通过校验，五项能力分别有可复核依据。
- 测试覆盖具体适配器（Adapter）的投射格式、作用域顺序、兄弟隔离、技能（Skill）目录、冲突保护、清理和探测；共享实现测试不能替代这些覆盖。
- 描述符（Descriptor）只保存官方资料、随包资料、明确发现源码或可重复本机观察，不维护 `documented/verified` 等等级，也不保存品牌历史冒烟状态。
- `runtime list`、诊断输出、Buildr 技能（Skill）和产品文档一致，相关正式规范与适用验证满足当次范围。

Buildr 当前不提供统一的真实会话标记冒烟（Marker Smoke）或 `SMOKE_PROMPT.md` 生成流程。专项验证只证明实际执行的入口、版本和行为，不升级成“该品牌在所有当前会话均已加载”的承诺。

依据：[运行时投射规范](../../../openspec/specs/workspace-first-runtime-projection/spec.md)、[适配约定实现](../../../services/buildr/src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts)及[当前适配说明](../../../services/buildr/docs/agent-runtime-adapters.md)。
