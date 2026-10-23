# workspace-artifact-lifecycle Delta Spec

## ADDED Requirements

### Requirement: 产物登记以文件清单保存归属、用途与处置策略

Buildr MUST 提供 `buildr artifact register <path>`，在工作空间（Workspace）的 `.buildr/local/artifacts/` 下为工作区内真实存在的路径建立一条产物（Artifact）记录，并 MUST 保存 `schemaVersion: buildr.workspace-artifact/v1`、稳定产物标识、工作区相对路径、登记方、用途说明、处置策略（`ephemeral|retained|evidence`）、可选归属任务（Task）标识、时间戳及内容摘要版本。登记 MUST 校验目标位于 canonical Workspace 内、非符号链接、不是登记目录自身或受保护根；`retained` 必须同时提供保留理由与引用方。写入 MUST 支持以已观察记录摘要为条件进行创建或更新，冲突后重读判断，不静默覆盖。

产物登记 MUST 为描述性可选动作；缺少登记或登记失败 MUST NOT 使正常编辑、构建、测试、Review、Verification、收尾或交付失败。

#### Scenario: 登记隔离构建目录

- **WHEN** Agent 为某任务创建 `services/dsh-plugin/build/<name>-<suffix>` 隔离构建目录后调用 `buildr artifact register <path> --task <task-id> --disposition ephemeral --purpose <说明>`
- **THEN** Buildr MUST 在 `.buildr/local/artifacts/` 保存该产物记录并返回记录标识与版本
- **AND** 该产物后续在 `buildr artifact list` 中以归属任务及处置策略呈现

#### Scenario: 登记被拒绝

- **WHEN** 目标路径位于 Workspace 之外、是符号链接、是受保护根、或 `retained` 缺少引用方与保留理由
- **THEN** Buildr MUST 拒绝写入并报告具体差异
- **AND** MUST NOT 改动文件系统目标或既有记录

### Requirement: 产物发现枚举已登记与未登记对象并计算归属分类

Buildr MUST 提供 `buildr artifact list` 与 `buildr artifact status`，枚举已登记产物并扫描已声明的 scratch 根，对工作区内中间产物给出逐项观察：路径、占用大小、修改年龄、归属任务及其当前状态、处置策略与计算出的处置状态（`active|retained|retained-stale|expired|unattributed|missing`）。处置状态 MUST 由当前事实即时计算：登记记录、归属任务终态、文件系统当前观察与保留引用核验，不保存为会漂移的第二事实。扫描 MUST 限定在已声明的 scratch 根（Workspace 根 `build/` 与各服务代码检出根的 `build/`），MUST 跳过 `.worktrees/`、`.git/`、`node_modules/`、`.buildr/local/artifacts/` 与其他所有者管理的目录；`.buildr/local/` 下任务证据类目录 MUST 仅作为证据类观察报告，不作为可清扫对象。

`unattributed` 归属推断 MAY 使用路径中任务标识等弱证据，推断结果 MUST 标注为推断且 MUST NOT 单独授权任何删除。

#### Scenario: 混合产物报告

- **WHEN** 工作区同时存在归属进行中任务的目录、归属已完成任务的已登记临时目录、已登记 retained 目录和无任何记录的 scratch 目录
- **THEN** `buildr artifact list` MUST 分别呈现 `active`、`expired`、`retained` 与 `unattributed` 状态及大小
- **AND** 每项 MUST 携带可复核依据（登记记录、任务状态或当前文件观察）

### Requirement: 产物清扫按计划执行且逐项核验授权

Buildr MUST 提供 `buildr artifact clean`，先基于当前事实计算逐项处置计划并默认 dry-run 输出；每项计划 MUST 说明目标路径、大小、归属与失效依据。`--execute` 时 Buildr MUST 仅删除处置状态为 `expired` 或已明确 `released` 的产物：删除前重新核验记录版本、归属任务终态、目标仍为 Workspace 内非符号链接且处于已声明处置范围。`retained`、证据类观察、`unattributed`、所有者另有约定（如 Git Worktree provider 登记的检出）及缺失目标 MUST 不进入删除集，逐项报告保留原因。逐项删除 MUST 失败隔离：单项失败只影响该项，不扩大为整体中止或误报完成。

#### Scenario: dry-run 与执行一致

- **WHEN** 用户先运行 `buildr artifact clean`（dry-run）审阅计划，随后 `buildr artifact clean --execute`
- **THEN** 执行 MUST 仅处理计划中仍满足条件的项，删除前复核当前版本与目标身份
- **AND** 结果 MUST 逐项区分已删除、已不存在、仍保留与阻止原因

#### Scenario: 归属不明不进入删除集

- **WHEN** scratch 根内存在无任何登记与归属证据的目录
- **THEN** 该目录在计划中 MUST 标记 `unattributed` 并给出建议动作（登记或人工核对）
- **AND** `--execute` MUST NOT 删除它

### Requirement: 保留产物声明引用方并在失效时形成诊断

`retained` 产物 MUST 携带引用方说明（依赖该产物的应用、运行时（Runtime）、绑定（Binding）或记录）。Buildr MUST 在 `status` 或相关诊断中核验引用方仍可观察；引用不再可核验时该产物 MUST 标记 `retained-stale` 并形成诊断项，交由人或智能体（Agent）决定释放或更新保留，MUST NOT 被自动删除。

#### Scenario: 保留引用失效

- **WHEN** 某 `retained` 产物声明的引用方（如运行应用配置）已不指向该路径
- **THEN** `buildr artifact status` MUST 将其标为 `retained-stale` 并说明失效的引用依据
- **AND** `clean --execute` MUST NOT 删除它，直到被显式释放为 `ephemeral`

### Requirement: 产物能力不扩展为统一环境管理与门禁

产物清单 MUST NOT 成为 Task Environment、资源注册前置、就绪状态或统一 cleanup；普通工作 MUST NOT 因未登记、登记缺失或清单不可读而失败。产物查询与清扫 MUST 作为独立能力存在，诊断信息 SHOULD 遵循 Buildr 诊断的域（domain）、范围（scope）、受影响动作（affected actions）与归属单元（ownership unit）模型，供 Doctor 等消费方投影，但不形成统一就绪结论。

#### Scenario: 无登记工作区正常工作

- **WHEN** 工作区从未登记任何产物或登记目录损坏
- **THEN** `artifact list` MUST 如实返回空清单或局部诊断
- **AND** 其他 Buildr 命令与任务执行 MUST 不受影响
