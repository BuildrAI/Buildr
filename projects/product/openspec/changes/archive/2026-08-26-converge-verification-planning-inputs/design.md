## Context

`verification plan` 当前把调用方提交的 `--changed-path` 原样写入 Request identity，因此同一文件用 `services/...` 与 `projects/product/services/...` 表达时会形成不同选择结论。Formal Verification（正式验证）的 Preparation admission 已能计算 requirements，但只在 `verification run` 内执行；正常首次运行因此先失败，再要求 Agent 用 `--detail full`取得 Plan Request。Planning Review 则已支持动态 `reviewed/uncovered/findings`，但只显式要求 checklist 生命周期边界，跨 Delivery、Activation、Cleanup、Diagnostics 的 owner 影响仍容易遗漏。

这些问题涉及三个既有 owner：Verification 拥有 Request/Plan 与 preparation requirement projection，Task Environment 拥有 Plan mutation 和 Recipe execution，Task Review 只保存 Agent 已完成的语义审查。设计必须保持这三个 owner 独立，不把准备写入 Verification，也不把语义判断变成确定性状态机。

## Goals / Non-Goals

**Goals:**

- 让无歧义的 Workspace-relative 与 Project-relative changed path 形成同一 canonical Project-relative Request/Plan identity。
- 让 formal plan-only 在任何 execution authority、副作用或Execution Record之前返回完整 Preparation preview和closed Plan Request。
- 让 Task Environment 一次消费基础Task选择与全部selected capability辅助准备，后续 formal run只复核current closure。
- 让 Planning Review 对真实跨owner计划明确记录已审 owner、不变量与未覆盖边界。
- 让新版Buildr与同步后的managed Skill对普通用户Workspace生效。

**Non-Goals:**

- 不自动执行`prepare`、Recipe或dependency install，不扩大Task scope或源码写入authority。
- 不建立全局authority map、事件平台、第二Planning Result或新的持久化表。
- 不让Planning Review解释Verification/Environment专业事实，也不为所有Task增加固定owner checklist。
- 不改变Legacy v2 declaration的能力边界，不自动改写用户声明。
- 不削弱formal run现有preparation drift、identity、authorization或resource门禁。

## Decisions

### 1. Path normalization属于Verification Application输入边界

Application在读取registered Project source root后规范化changed paths。Project-relative输入直接保留；managed Project的Workspace-relative输入只有在以该Project的registered Workspace source path为精确前缀时才剥离前缀。结果拒绝绝对路径、`..`、越界和指向其他Project的Workspace前缀，并在进入`createVerificationRequest`前排序去重。

Request与Plan只保存canonical Project-relative paths，因此两种输入产生相同Request identity、Plan identity、owner selection和Browser selector。Domain不读取filesystem或registry，避免把路径环境事实带入纯模型。

### 2. Formal preview使用可选Plan result envelope，不改变Plan v1

无`--environment/--workspace`的现有`verification plan`继续返回raw `buildr.verification-plan/v1`。两者同时提供时，CLI额外读取matching Environment current，返回`buildr.verification-plan-result/v1` envelope：

- `plan`：原始closed Plan v1，可直接由`verification run --plan`消费；
- `preparation`：`ready|action-required`、closure identity、全部requirements及可选closed `planRequest`；
- `effects: []`与最小next actions。

`verification run --plan`同时接受raw Plan v1和该envelope，内部只消费envelope中的Plan与preparation identity，不复制或信任claimed readiness；run仍重新执行admission和drift check。这样保留现有Plan schema与外部无Task调用，同时避免用同一v1偷偷增加字段造成旧reader不兼容。

### 3. Preview与run共用完整closure算法

Preparation admission的recovery request从全部selected capability requirements构建，不再只包含当前missing subset。Request继续携带Task Environment current的完整base Project/scope选择，并把全部辅助要求按capability identity/project/selector/recipe去重排序。

Plan preview只返回请求；Task Environment仍是唯一Plan writer和Recipe executor。Agent按`plan → environment prepare → run`执行；如果忽略preview直接run，现有`preparation_blocked`安全降级继续保留。

### 4. Planning Review只强化语义guidance

当Task Intent或planning nodes实际跨两个以上lifecycle owner时，provider指导Agent把受影响owner、每个owner保护的结果不变量和未覆盖边界写入现有`reviewed/uncovered/findings`。是否跨owner、哪些owner受影响仍由Agent基于Task与artifacts判断；Buildr不从关键词生成地图。

只有遗漏会导致错误写入、证据失真或完成误报时Review返回`changes-required`；一般改进建议保留finding。Task Review contract与Result schema不变。

### 5. Managed Skill随Product发布与Workspace sync激活

修改Product source中的builtin `task-review` Skill，不直接编辑当前Workspace runtime副本。正式Finish和self-bootstrap完成后，由既有Product update/sync机制把新guidance投射给用户Workspace；不新增binding或provider替换。

## Risks / Trade-offs

- [Plan CLI增加formal envelope分支] → 保留无Environment raw Plan；run同时覆盖raw/envelope parser和installed-layout测试。
- [Workspace-relative前缀可能与Project内同名目录冲突] → 只把registered managed Project source path的精确前缀解释为Workspace-relative；attached Project不接受Workspace形式，诊断返回canonical root。
- [完整closure可能重复已准备Recipe] → Task Environment按identity幂等复用，Plan Request不执行Step。
- [preview后Environment或declaration漂移] → run继续重新解析current Environment、declaration与closure identity并在副作用前失败关闭。
- [Planning Review文字变长] → 只在真实跨owner时触发，不固定Owner清单、不新增Result字段。

## Migration Plan

1. 同一版本同时发布Plan envelope writer/reader、完整closure preview和Skill guidance。
2. raw Plan v1、Legacy declaration reader与无Task plan-only保持兼容。
3. Buildr自举Workspace用本Task的formal Plan验证新preview路径，再由Finish/self-bootstrap激活managed Skill。
4. 用户Workspace升级Buildr并正常update/sync后生效；不做数据库migration或声明backfill。

## Open Questions

无。用户已确认所有用户Workspace适用、Legacy v2仅兼容读取且不取得v3完整preview。
