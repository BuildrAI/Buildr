## Context

Task Development 曾承担 planning、Content Target、Candidate、Review gate、Current Knowledge、decision 与 Handoff 的聚合。外围入口随后通过它解释任务下一步、Review 是否采用、终态交付、父子计划和页面完成状态。Task Verification 已在 `refactor-task-verification` 中退出这一链路，但 Task Entry、Overview、Terminal Delivery、Review 页面、Parent 历史与 OpenSpec 配套技能仍保留直接或间接依赖。

本次以当前 Task Record、专业 Result、Git/文件/外部系统和旧 Finish 历史为各自 authority。历史 Development/Finish payload 必须保留，但不能继续决定 current 行为。当前 Product 固定 Node 24.15.0，SQLite migration 必须连续且不可修改旧 checksum，保留和修改的人工源码及测试使用 TypeScript。

## Goals / Non-Goals

**Goals:**

- 让没有 Development Receipt、Candidate 或 Handoff 的任务仍可审查、验证、展示、完成和交付。
- 删除 `task next` 作为统一流程路由器；Agent 通过 Skill description、当前 Task 和专业接口选择动作。
- 让 Overview、Terminal Delivery 与 Buildr Web 只读组合独立事实，不建立第二 writer 或完成判断。
- 将旧 Parent Plan 从 Development current 迁移到 Task-owned 只读历史字段。
- 保留旧 Development/Finish payload 原始历史，并隔离其读取影响。

**Non-Goals:**

- 不删除或重写 Task Development 本体及其 primary actions。
- 不重新设计 Task Review Result、Task Verification Report 或 Task Finish 用户流程。
- 不新增风险授权、统一审批、统一 proceed/blocked 或新的交付数据库。
- 不处理发布、rc.29、自举或整个 Task Environment。

## Decisions

### 1. 退役统一 `task next`

删除 Task Entry Snapshot Application、CLI contribution、capability route 和专属测试。Agent 已能通过 Task Record、Environment、专业 Skill 与接口取得当前事实；继续维护一个把所有动作排成单一路径的 Application 会让 Development 再次成为流程总管。

保留 Task Record `inspect`、Environment `inspect|prepare` 和各专业 `inspect`。OpenSpec Skills 在自己真正需要受管 Development 时直接读取 matching Environment controller，并调用当前 provider；不再先消费 `task next`。

替代方案是把 `task next` 收窄为只读建议，但仍需维护 action taxonomy、capability routing 和重复 currentness 判断，因此不采用。

### 2. Overview 只展示独立保存事实

Overview 可以在一条只读 SQLite 查询中取得 Task、Review、Verification、Environment、Development 和旧 Finish 摘要，但不得：

- 计算 Review/Development gate match；
- 用 Development blocked 推导用户 attention；
- 用 Handoff 或 Candidate 证明交付；
- 把缺少任一专业 Result 解释为任务未完成。

Development 摘要只作为“存在一份历史/当前研发记录”的技术事实展示，后续 Task Development 专项可以继续决定是否删除。

### 3. Terminal Delivery 只绑定 Task Record 与 Finish 历史

Terminal Delivery 从 Task Record 得到顶层完成事实，从只读 Finish history adapter 得到旧 run、remote ref、activation 与 cleanup。它不读取 Development 或 Review，不返回 snapshot、planning/completion association，也不因旧 payload 损坏否定 Task Record 已保存结果。

Review GET 直接调用 Review Application；Development GET 直接调用 Development Application；两者不再包裹 Terminal projection。

### 4. Parent Plan 迁到 Task-owned 历史字段

新增连续 SQLite migration，在 `tasks` row 增加 nullable `legacy_parent_plan_json`。迁移从 `task_development_current.record_json.parentPlan` 一次性复制有效值并校验数量和 JSON；不删除原 Development payload。

Task Record repository 的 Parent context 只读取该列。它没有公共 writer，不能被新任务更新，也不成为新的计划 authority。旧 Parent Plan 只供 `task parent inspect` 展示。

替代方案是建立新 Parent Plan 表，但会把已退役模型重新建成业务 authority，因此不采用。

### 5. Buildr Web 分别读取各专业 read model

任务页首屏与成果摘要以 Task Record 为主。Evidence Tab 分别读取 Review 与 Verification；Development Tab 只在用户打开时读取 Development；历史交付区域只读 Terminal/Finish history。页面不把这些响应组合成新的完成状态。

专业 Agent action 只携带 Task ID、动作类型和必要上下文；后端专业 Application 不生成工作提示词。

### 6. 历史与 current 分离

现有 Development/Finish JSON 保持原始字节，历史 adapter 可解码已知 schema。新的 Overview、Review、Parent、Terminal 行为不得回退扫描这些 payload 寻找 current 替代事实。历史损坏只产生局部 diagnostic。

### 7. TypeScript 单一人工源码

被保留且修改的 Task Entry、Overview、Terminal、Parent context、HTTP mapping 和专属测试迁移到 `.ts`；确定删除的 Task Entry/退役 route 专属实现和测试直接删除。共享 composition root 只保留薄注册代码，不形成第二实现。

## Risks / Trade-offs

- [旧自动化继续调用 `task next`] → CLI 返回 unknown command；随包 Skills、help、测试和文档在同一 Change 原子切换，不保留 stub。
- [旧 Finish association 不再显示 Review adoption] → Review 与交付分别展示；旧 association 仍在历史 payload 可查。
- [旧 Parent Plan migration 遇到损坏 JSON] → migration 在写入前校验并失败，保留数据库现场；不猜测或丢弃历史。
- [页面失去统一“下一步”] → 智能体依据 Skill 与当前事实决定；页面只给出具体 owner 的可执行动作，不构造跨模块状态机。
- [共享文件与后续 Review 重构冲突] → 本任务先交付，新的 Review 任务从该基线创建。

## Migration Plan

1. 增加连续 SQLite migration，将有效旧 Parent Plan 复制到 Task-owned 历史列并验证。
2. 切换 Parent context reader，删除 Development join 和旧兼容查询。
3. 收窄 Overview 与 Terminal Delivery，切换 Review/Development HTTP read model。
4. 删除 Task Entry Snapshot、`task next`、相关 capability routing 和 OpenSpec Skill 依赖。
5. 更新 Buildr Web、Skills、help、当前认知和架构说明。
6. 迁移保留源码与测试到 TypeScript，运行 migration、无 Development 场景、历史损坏隔离、CLI/HTTP/Web 与受影响完整验证。

失败时当前 transaction rollback；旧 Development/Finish payload 未被修改，可以从交付前版本恢复代码。Migration 一旦成功不回滚数据列，只由旧版本忽略新增列。

## Open Questions

无。Task Development 本体去留和 Current Knowledge 依赖由后续独立任务根据本次无 Development 场景证据决定。
