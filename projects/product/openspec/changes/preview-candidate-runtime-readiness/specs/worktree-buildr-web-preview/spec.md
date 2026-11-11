## ADDED Requirements

### Requirement: 任务预览必须准备并钉住候选运行产物

任务预览（`--task`）启动 MUST 在拉起候选宿主前，于该任务工作树内准备候选运行产物：构建 Agent 私有包并物化到工作树宿主的 `node_modules/@buildr-ai/buildr-agent`，并构建 `web-dist`（含所需 DTO）。工作树相关源码相对上次准备发生变化时 MUST 重新准备；未变化时 MAY 复用已准备产物。准备的所有写入 MUST 限定在任务工作树内，MUST NOT 写入开发版应用数据根、canonical Workspace 或其他预览。准备失败 MUST 在启动宿主前 fail closed 并报告失败阶段，MUST NOT 以陈旧或未准备的私有包冒充候选代码。

#### Scenario: 首次启动准备候选产物
- **WHEN** 任务工作树尚无已准备的候选私有包或 `web-dist`，调用方启动任务预览
- **THEN** 预览 MUST 先在工作树构建 Agent 私有包与 `web-dist`，再拉起宿主
- **AND** 构建写入 MUST 只出现在该任务工作树内

#### Scenario: 源码变化后重新准备
- **WHEN** 工作树 Agent 或前端源码相对上次准备已变化，再次启动同一任务预览
- **THEN** 预览 MUST 重新准备受影响的候选产物
- **AND** MUST NOT 复用与当前源码不一致的陈旧私有包或 `web-dist`

#### Scenario: 准备失败不启动
- **WHEN** 候选产物准备在某一阶段失败
- **THEN** 预览 MUST 在拉起宿主前失败关闭并报告失败阶段与原因
- **AND** MUST NOT 报告 `started`，MUST NOT 写入开发版数据根或 canonical Workspace

### Requirement: 任务预览必须等待候选后台就绪

任务预览 MUST 以工作树已物化私有包计算候选 Agent 运行单元 digest，并使候选宿主以该运行单元连接其独立数据根下的后台。预览 MUST 观察后台运行状态，仅当实际 `currentDigest` 与候选 digest 一致、`accepting` 为真且无待切换运行单元时才宣告 `started`。候选 digest 不符、后台未 accepting、换版待定或观察超时 MUST fail closed，报告明确 codedError 并回收已启动进程；MUST NOT 静默回退开发版后台，MUST NOT 在后台未就绪时报告启动成功。候选后台 MUST 只绑定预览独立数据根，MUST NOT 接管、恢复或重放开发版执行。

#### Scenario: 候选后台就绪才宣告启动
- **WHEN** 候选宿主后台以候选 digest 启用且 accepting
- **THEN** 预览 MUST 在观察到该一致状态后返回 `started`
- **AND** 启动结果 MUST 包含该候选 digest 与后台 generation

#### Scenario: 实际 digest 与候选不符
- **WHEN** 后台实际 `currentDigest` 与候选 digest 不一致
- **THEN** 预览 MUST fail closed 并报告来源不一致
- **AND** MUST NOT 报告 `started` 或回退开发版后台

#### Scenario: 就绪超时回收
- **WHEN** 在超时内后台仍未达到候选 digest 且 accepting
- **THEN** 预览 MUST 报告候选后台未就绪的 codedError，并认证停止已启动的预览进程
- **AND** 停止未确认时 MUST 保留现场并报告，MUST NOT 冒充清理成功

#### Scenario: 不接管开发版执行
- **WHEN** 候选后台在预览独立数据根下启动
- **THEN** 候选后台 MUST NOT 读取开发版进程记录作为控制入口，MUST NOT 恢复或重放开发版中断执行
- **AND** 开发版后台与其执行 MUST 保持不变

### Requirement: 预览必须表达组件级来源且身份条可见

在既有工作空间模式（shared/snapshot）与 reuse 来源可观察的基础上，任务预览的启动输出、列表结果、受认证 health 与页面预览身份条 MUST 进一步表达组件级来源：宿主工作树与 Product checkout、前端产物来源、Agent 运行单元 digest/generation 与 accepting 状态。预览身份条 MUST 对预览页面可见并表达上述来源；默认 Buildr Web MUST NOT 显示预览身份条。来源表达 MUST NOT 暴露凭证、令牌或来源数据根的敏感路径细节。新增来源字段 MUST 以可选字段出现，缺少该字段的旧实例 MUST 仍可被安全停止。

#### Scenario: 启动输出含组件来源
- **WHEN** 任务预览启动成功
- **THEN** 输出 MUST 同时表达宿主工作树/Product checkout、前端产物来源、Agent digest/generation、工作空间模式与 reuse 来源
- **AND** Agent 未就绪时 MUST NOT 输出冒充就绪的来源

#### Scenario: 页面身份条可见
- **WHEN** 用户打开任务预览页面
- **THEN** 页面 MUST 显示预览身份条，表达实例、工作树、Product checkout 与 Agent 组件来源
- **AND** 该身份 MUST 只读，MUST NOT 写入 Workspace 源资产

#### Scenario: 默认 Web 不显示
- **WHEN** 用户打开默认 Buildr Web（非预览）
- **THEN** 页面 MUST NOT 显示预览身份条

#### Scenario: 旧实例缺少来源字段仍可停止
- **WHEN** 健康旧实例的 owner 缺少新增组件来源字段
- **THEN** 预览 MUST 允许按原 owner 安全停止
- **AND** MUST NOT 因缺少新字段拒绝停止或清理