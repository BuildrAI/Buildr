---
name: task-manager
description: 在已初始化的 Buildr 工作空间中，用户授权修复、优化、开始或继续代码、文档、配置、规则或技能修改，或要求维护任务与进展时使用；先登记或接续任务，纯只读咨询不创建任务。
---

# 任务管理

本技能（Skill）提供 `buildr.task-record/v4`：管理短目标、任务说明正文、范围、直接父子关系、独立状态、结果，以及本机复盘文档摘要和人的决定状态。任务记录通过产品动作维护，不直接编辑数据库。

## 开始或继续授权工作

用户说“先修复”“按方案优化”“继续做”，且已授权交付代码、文档、配置、规则（Rule）或技能（Skill）的持久修改时，默认在首次交付文件写入前登记或接续任务；小改动也适用，不要求用户另说“创建 Buildr 任务”。登记只维护工作事实，后续分流、隔离、实施和交付仍交给对应专业技能（Skill）。

先核对当前对话、已提供任务标识与可用任务公开读取结果中的目标和范围。匹配已有任务就读取并接续；`todo` 按已观察版本激活，`active` 复用，终态不自动恢复。确认没有匹配任务时创建一个 `active` 任务。同名不同目标先区分归属；工作树（Worktree）存在不证明任务记录存在。不因换轮次或阶段转换重复创建，也不为旧任务补造开始历史。

纯只读咨询、诊断、讨论方案，尚未授权实施的建议，以及仅修改已有任务记录或维护其生命周期时，不另建任务；明确接受但尚未启动的待办继续使用 `todo`。用户明确要求不登记时尊重其范围，不把默认做法变成新的授权要求。

登记成功后，在形成可接续的进展、决定、阶段变化或结果时，按下文维护工作摘要（Work Context）和真实任务结果；不逐工具调用记日志，不把“已登记”当成业务完成。记录提供者不可用或写入冲突时报告具体缺口，停止对应记录写入，保留现场并继续可独立的只读检查与有界测试；不手写数据库或伪造任务成功。

## 普通任务

确认当前工作空间（Workspace）、任务标识、授权范围及真实目标。已有任务缺少当前记录时先 `task inspect`，刚读取或前一步成功写入返回的完整记录可直接接续。Task Record自身结构有效时始终返回完整记录；响应中的`referenceDiagnostics`只说明当前Project、Service或Change可用性，不属于Task业务事实。`todo`只保存尚未启动的意向；`active`表示已开始。子任务只用于可独立说明目标、范围及成果的交付，临时智能体分工不创建子任务。

原型先于正式任务但已形成同一目标的源码隔离位置时，接续 `task-triage` 核对的稳定隔离标识；确认未被其他目标占用后沿用该标识创建任务，不因进入实施阶段另起名称，不补造原型期间的开始历史。已有匹配任务继续接续该任务。

新选择的任务标识（Task ID）默认使用简短、稳定的语义名称，不主动添加日期；已有任务标识（Task ID）及用户指定的合法名称继续沿用。同名但不同的任务先核对归属，再用简短语义后缀区分，不覆盖或借用已有任务，不为去掉日期另建记录。

使用已有动作：

```text
buildr task create <id> --title <text> --intent <text> [--status todo|active] [--brief-file <utf8-file>] [--parent-task] [--parent <id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] --target <workspace> --json
buildr task inspect <id> --target <workspace> --json
buildr task update <id> [--status todo|active|completed|abandoned] [--reason <text>] [--summary <text>] [--parent-completion <json-file>] [--parent-task] [--parent <id>|--clear-parent] [--brief-file <utf8-file>|--clear-brief] [set/add/remove flags] --expected-record <recordDigest> --target <workspace> --json
buildr task activate <id> --expected-record <recordDigest> --target <workspace> --json
buildr task complete <id> --summary <text> --expected-record <recordDigest> [--parent-completion <json-file>] --target <workspace> --json
buildr task abandon <id> --reason <text> --expected-record <recordDigest> --target <workspace> --json
```

`intent`（目标）表达一句话级的任务目标与入口定位，不复述完整需求；不得写成标题复述、内部步骤清单或长篇正文。整体问题、需求、范围和完成依据由任务记录中的唯一任务说明（Task Brief）承载。任务可以关联零到多个变更（Change），多个任务也可以引用同一变更；具体变化由已有 proposal、design、specs 和 tasks 表达，按需要引用任务正文，不生成或维护额外 `brief.md`。旧文件与链接保留普通阅读，不自动迁移或复制同义需求。

## 形成与保存任务说明

每个新正式 `active` 任务（包括 `todo` 激活）先完成登记，再按 `task-triage` 核对实际隔离位置，由本技能（Skill）在任务记录（Task Record）的 `brief` 字段保存真实任务说明（Task Brief）。所有任务类型共用这一正文，不要求 OpenSpec。正文至少说明问题或需求、目标、必要范围与非目标、完成依据；简单任务可用一个短段落，复杂任务随理解逐步补充，不强制长模板，不编造未知事实或空占位。纯待办意向可暂为空。

`brief` 保存原始 Markdown，非空正文的格式与内容不被裁剪，按 1 MiB UTF-8 字节上限校验；空正文统一为 `null`。通过 `task create --brief-file <utf8-file>` 或 `task update --brief-file <utf8-file> --expected-record <recordDigest>` 保存；输入文件只用于本次传入，不成为另一份可编辑权威。`task update --clear-brief` 显式清空，不能以清空掩盖尚未解决的目标。更新前读取当前记录，终态手工更正沿用 `--reason` 与结果历史保护。

正文随主工作空间（Canonical Workspace）的任务数据库保存与备份，不随代码分支切换或 Git 推送；任务说明不再创建 `brief.md` 文件或材料引用。方案、实施、交付和已有知识文档仍可引用原文件。稳定任务链接使用 `[任务说明](@task/<task-id>)`，限定当前工作空间的任务；记录正文中的项目文档使用明确的 `projects/<project>/<path>`，不能依赖原说明文件目录猜测来源。

保存后核对应用返回的当前 `brief` 与记录版本，以及从任务列表打开详情时任务说明节点直接可读、刷新后仍为同一正文。普通链接可打开不等于记录正文已保存。目标理解或已确认范围变化时，重读记录并按已观察版本更新正文；任务说明不等待材料或变更读取，空值如实说明，不能用 `intent`、聊天、旧文件或变更说明兜底。

## 按需关联其他任务材料

独立任务材料应用（Task Materials Application）继续管理方案、实施和交付文件，清单使用 `schemaVersion: buildr.task-materials/v2` 与 `documents`。每项为 `{id, role, title, source}`，`role` 仅为 `solution|implementation|delivery`，各角色按实际需要零到多项；来源为 `{kind: task, path: <task-relative-md>}` 或 `{kind: project, project: <code>, path: <project-relative-md>}`。清单不保存正文、物理工作树路径、任务状态或专业检查适用性。旧清单尚含唯一 `brief` 时，公开入口仍只呈现 v2 过程引用；普通材料更新内部保留该旧关联，直到显式迁移或释放，不能因修改方案而丢失说明来源。多任务可引用同一适用过程文档，但每个任务说明由自己的 `brief` 保存。

先 `inspect` 取得 `materialsDigest` 与逐项正文摘要，再维护完整引用或本机正文。关联版本与受控正文版本分别使用已观察值，不借 `recordDigest` 保存材料版本。项目正文通过任务分流已确认的实际工作位置及所属专业文件工具维护：Git 文件使用适用工作树（Worktree），已确认的非 Git 资料使用已授权实际位置；修改前重读目标身份、内容与版本并保留他人内容，修改后从真实资料回读。不能用本机材料写入接口代写项目文件；应用锁不能保护任意外部编辑器。已有 `knowledge/` 文档保留原位置，不为材料整理移动或复制。

```text
buildr task materials inspect <id> --target <canonical-workspace> --json
buildr task materials record <id> --materials <json-file> --expected-current <absent|materialsDigest> --target <canonical-workspace> --json
buildr task materials write <id> --path <task-relative-md> --content <content-file> --expected-document <absent|documentDigest> --target <canonical-workspace> --json
```

正文先保存，再建立正式材料引用并核对实际正文、来源与摘要；候选文件缺失不能拿主目录同名旧文件替代。材料更新不重写任务状态、记录正文或专业历史；局部缺失如实报告，不扩大为无关记录动作的前置条件。

## 显式导入旧任务说明

旧 `buildr.task-materials/v1` 中的唯一 `brief` 关联只供遗留读取、诊断和显式迁移；任务说明节点不再读取它。接续旧任务时，先读取记录与材料，核对实际旧正文及用户已授权的迁移范围。没有可读取的独立说明就形成本次真实正文，不用 `intent` 或某个变更说明自动填充，不批量补造历史。

```text
buildr task brief migrate <id> --dry-run --target <canonical-workspace> --json
buildr task brief migrate <id> --expected-record <recordDigest> --expected-materials <materialsDigest> --expected-document <documentDigest> --target <canonical-workspace> --json
buildr task brief migrate --all --dry-run --target <canonical-workspace> --json
buildr task brief migrate --all --target <canonical-workspace> --json
```

单任务 `--dry-run` 零写入返回记录、关联与实际正文的观察版本，执行输入使用这些已观察值；批次由产品动作逐项观察并校验，不把一次批量请求当作全库原子提交。只在明确批次授权内执行 `--all`，可先用 `--dry-run` 查看范围与诊断。记录正文为空时导入真实源正文并释放旧关联；已有正文时，明确迁移请求仅释放退休关联并保留当前正文，包括部分导入后已编辑的说明。原文件与其他材料均保留，缺失、安全失败、漂移或部分完成分别核对。文档不存在的观察在单任务参数中使用 `--expected-document absent`；只有已成立的记录正文可在该情况下释放旧关联，不能凭缺失来源填充正文。导入后已编辑的正文不得因重试被覆盖。可证明的相对文档链接转换为明确引用，未知链接如实报告，不扩大读取范围。

终态导入通过既有更正动作保存本次真实原因，保留原状态、结果与历史，不改写旧说明文件、归档、专业报告或过去时间。分别核对记录写入与关联释放；局部失败不否定已成立的写入，也不能报告整项迁移完成。

任务记录（Task Record）写入使用已观察的当前 `recordDigest`，应用（Application）继续校验版本。成功响应已包含完整记录与新版本时，直接核对并作为下一动作的输入；仅在响应缺失、发生冲突、工作中断后继续或已知相关事实变化时重读。冲突后重新判断，不静默重放旧输入。完成只保存已成立的结果，不执行Git、部署、验证或清理。复盘正文由Agent按用户要求写入`.buildr/local/task-retrospectives/<task-id>.md`，Task Record只登记摘要与`pending-decision|decided`。

## 记录进展与接续人的答复

出现值得接续的新进展、需要人决定的事项，或用户要求记录时，使用独立工作摘要（Work Context）。它不属于任务记录（Task Record）的四态和完成结果；日常执行无需为每次工具调用写日志。

先运行 `buildr task work-context inspect <id> --target <workspace> --json`。保存时使用返回的 `contextDigest`；尚未登记时使用 `absent`：

```text
buildr task work-context record <id> --expected-current <absent|digest> --progress <真实进展> --next-step <下一步> [--stage <当前节点> | --clear-stage] [--attention-kind decision|acceptance|question --attention-reason <需要人处理的具体原因> | --clear-attention] --target <workspace> --json
buildr task work-context respond <id> --expected-current <digest> --attention <事项id> --response <用户实际表达的意见> --target <workspace> --json
```

有值得接续的阶段变化时，用 `--stage` 记录当前节点：`requirements|design|planning-review|implementation|implementation-review|verification|acceptance|closeout`。它描述正在处理的工作，不是完成证明或执行顺序；验证失败后回到实现修复就记录 `implementation`。省略保留原节点，`--clear-stage` 清除；无需为每次工具调用更新。

更新进展时省略事项参数，会保留已有请求和答复；明确提出新请求会生成新身份。只在确实需要人判断、验收或介入时登记事项，缺少报告、任务处于进行中或长时间未更新不等于需要人处理。

继续相关工作前读取当前答复与真实成果。用户在网页回应后，事项变为已处理，意见和记录时间仍可读取；智能体（Agent）只代录用户实际给出的意见，不能自行代表用户作决定。答复本身不自动授权发布、删除等具体动作，也不改变任务状态。版本或事项身份冲突时重读并判断，保留用户已输入和已保存的内容，不静默覆盖。

完成标准是当前摘要、事项或答复已由应用保存并可读取；之后按实际目标和原有授权继续工作。

## 修订任务事实

已有`task update` / HTTP `PATCH`可以修改标题、短目标、说明正文、范围、规范引用、父子关系及四种合法状态；省略字段保持不变，不提交完整记录覆盖。新增Project、Service或Change仍必须当前可用；删除失效引用或修改无关字段不因其他旧引用不可用而失败。所有非创建写入都必须提供当前`recordDigest`；更正终态事实还需`reason`，由智能体（Agent）准确说明已取得的用户决定，不为原因再创建审批步骤。

更正会把原状态、标题、短目标、说明正文、父关系、结果及原更新时间保存到只读 `resultHistory`，同时记录更正时间与原因。恢复进行中使当前 `result` 为空，但不撤销真实交付、不重新准备环境、不改变子任务状态。已完成子任务可按当前版本和原因关联进行中的父任务，保持自己的状态与成果；重复提交相同内容不追加历史。

设置completed仍需`summary`及适用的父任务完成授权，内部与`task complete`复用同一检查。完成请求不同时更改目标、范围或关系；先修订这些事实，再按当前目标验收。已完成父任务变更目标或范围时显式恢复进行中，不能用旧完成依据覆盖新目标。todo仍不能携带规范变化引用。身份、系统时间、结果历史及专业验证证据不得直接修改。

复盘文档登记、决定或清除必须作为独立更新并提供当前`recordDigest`。登记与决定还要提供固定本机文档的实际摘要；清除只解除Task关联，不删除文件。查看文档零写入，只有用户明确决定是否继续行动后才能标记`decided`。

## 父任务协调（Task Parent Coordination）

人负责整体目标、边界、关键决定与完成授权；智能体（Agent）在这些边界内规划、创建独立子任务、核对成果和持续推进。`--parent-task` 明确创建父任务；`--parent` 指定子任务归属。关联过子任务的父身份保留，不通过移除最后一个子任务取消完成保护。

用户要求创建并准备父任务时，保存短目标后继续在任务说明（Task Brief）与适用方案材料中整理计划与验收标准，不拉长 `intent`。简单计划写入真实短正文，复杂计划在记录正文表达整体目标，并按需关联可读方案文档。计划说明分工、依赖、边界、剩余工作与重要决定；不要求专用父计划、贡献绑定、环境或研发回执。读取当前计划和实际成果后，按已有授权决定是否启动子任务；未知的关键目标或授权才询问用户。

每个子任务拥有独立目标、范围、结果及按需要选择的研发方式。不得继承父任务的环境、分支、规范变化或验证结论；同一具体规范变化只能有一个活跃变化负责。各仓库按真实边界交付。子任务有依赖时先核对前置成果；软件不替智能体（Agent）证明业务依赖已经满足。

用 `task parent inspect <id> --target <workspace> --json` 查看整体目标、直接子任务结果、历史计划及完成观察身份。计划、子任务状态和真实交付是不同事实；不凭数量推断完成百分比，不因一批子任务完成就缩小总体目标。范围变化先核对产物与版本；改变整体目标、授权或验收需用户决定。被替代子任务明确放弃并说明覆盖，不能伪装完成。

## 完成父任务的边界

**完成父任务必须具有明确指向该父任务的用户授权。** 子任务完成、全部子任务终态、总体验收通过、实现授权或仅针对子任务的收尾均不构成授权；不得为获得成功返回自行编造授权来源。嵌套父任务逐层独立，不能递归完成。

先核对当前整体目标、计划与实际成果，准备可审阅的总体验收说明，包括每个直接子任务成果及放弃、替代、遗留的处置。没有明确授权时保留父任务状态，展示已完成内容与尚需用户决定的完成动作；不向用户索取对单个内部步骤的重复确认。

已明确授权时，读取一次当前父子摘要，取得同一观察中的 `recordDigest` 与 `completion.snapshotIdentity`，在系统临时目录构造 `--parent-completion` 输入：

```json
{
  "expectedSnapshot": "来自 task parent inspect 的 completion.snapshotIdentity",
  "acceptance": {
    "summary": "整体目标、实际成果与验证依据，以及必要遗留的处置",
    "children": [{"taskId": "child-id", "summary": "该子任务的成果覆盖或放弃处置"}]
  },
  "authorization": {
    "source": "当前用户授权的可回查来源",
    "statement": "用户明确授权完成指定父任务的原意"
  }
}
```

`children` 精确覆盖当前直接子任务；无子任务时为空数组。来源和原意必须真实，不能把本技能、默认策略、调用成功或智能体自己的总结写成用户授权。把该输入与本次摘要的 `recordDigest` 交给已有完成动作；不为取得同一版本再调用 `task inspect`。冲突、未结束子任务或依据缺失只阻止相关完成；保留已交付成果，重新核对后处理。直接核对完成动作返回的结果及授权依据，删除本次临时输入；仅响应丢失、冲突或相关事实变化时重新读取，不惯例性追加回读。

旧 `task parent record|reconcile|bind-child|refresh-planning|reconcile-child-delivery|accept` 已退役；旧计划和交接仅供历史查看，不补造旧链，也不把历史缺少授权记录解释成已授权。

## 报告

说明实际改变的对象、当前状态、成果与必要遗留；不要把记录成功称为业务交付成功。任务已完整结束时明确报告完成。只有用户明确要求复盘时才使用`task-retrospective`；完成或放弃本身不自动提示、生成或登记复盘。
