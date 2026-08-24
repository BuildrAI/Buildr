## Context

Buildr 当前把 Project `preparation.yml`、Task Environment Plan/Receipt 与 Project `verification.yml` 分别治理。Task Environment 能按 Task scope 准备基础依赖，但 Verification capability 只描述调用、适用性、环境边界和资源；两者之间没有确定性连接。因此 Environment `ready` 只能证明已选择的 Task preparation current，不能证明之后才选中的 capability 所需工具链也 current。

Buildr 自举把这个缺口放大：Task 交付范围可能只有 `product/buildr`，但正式 Browser verification 还需要 `buildr-web` 的锁定依赖和项目本地 TypeScript。把 `buildr-web` 加入 Task scope 会错误扩大内容所有权；让 Agent 临时运行 `npm ci`、设置 `BUILDR_NODE` 或猜 cwd 又无法稳定复用到用户 Workspace。

现有边界必须保持：Preparation Declaration 不保存机器状态，Environment Receipt 是唯一准备/恢复事实，Verification Result 不复制 Environment，Buildr 不扫描技术栈，npm 用户不承担源码开发依赖。

## Goals / Non-Goals

**Goals:**

- 让选中的 Verification capabilities 在启动昂贵执行前得到完整、可解释、可恢复的准备闭包。
- 让 runtime executable、路径基准和机器解析结果由 Environment/Receipt 自动传递，而不是由 Agent 转抄。
- 允许 capability 使用注册 Project 内的辅助 Service preparation，同时不改变 Task scope、Change authority或 Content Target。
- 保持 Preparation、Environment、Verification 各自唯一 owner，不增加第二个 Receipt 或通用依赖调度器。
- 保证发行版 CLI/Web 与 development checkout 的精确 Node 和源码工具链隔离。
- 让 Formal Verification 门禁只保护正式证据和执行副作用；Buildr 不可用时仍允许不产生正式结论的安全降级（Safe Degradation）。

**Non-Goals:**

- 不让 Buildr 扫描 package manifest、POM、Cargo 或目录来推断技术栈与安装命令。
- 不把 `preparation.yml` 或 `verification.yml` 扩展成测试 DAG、包管理框架或通用 workflow engine。
- 不把辅助准备 scope 变成 Task Service scope、写入权限、Change applicability 或交付内容。
- 不保存 secret、任意 env map、stdin、完整命令输出或用户机器路径到 Git。
- 不修改 Buildr Web 用户界面，也不减少正式 Verification coverage。
- 不把 Formal Verification 准入扩展成日常开发、只读调查、focused feedback 或非正式检查的通用许可层。

## Decisions

### 1. Task 基础准备与 capability 辅助准备使用同一 Environment authority

Task Environment Plan 的基础部分继续恰好覆盖 Task 的 Project/Service scope。Project Verification capability 可在可选 `environment.preparation` 中引用同一 Project `preparation.yml` 的 Recipe；这些引用形成 capability 辅助准备要求。

Verification admission 对实际 selected capabilities 取声明 identity 与准备要求的确定性并集，形成 closed preparation closure。辅助 Service 必须已登记、Recipe 必须属于同一 Project，且只能执行声明允许的 preparation outputs。closure 不进入 Task Record，也不改变 Task scope。

选择这一方案而不是自动把辅助 Service 加入 Task scope，是因为 Task scope 表达交付与业务所有权，工具链准备只表达执行前置。选择同一 Environment authority而不是 Verification 自己安装依赖，是为了保留唯一 writer、幂等恢复、真实 output probes 与统一 cleanup。

### 2. Verification preflight 只计算和校验，Task Environment 继续执行 mutation

Task Verification 增加低成本 admission preflight：读取 current capability declarations、matching Environment Plan/Receipt 和 selected capability identities，返回 `ready` 或带精确缺口的 `blocked`。只有声明Recipe能够恢复的preparation gap才生成可验证的supplemental Plan Request并指向Task Environment；Task Verification Skill/正式workflow调用既有Task Environment `prepare`应用该请求，再重跑admission。其他gap只返回其真实owner与恢复方向。

runner 只能在 admission current 且 `ready` 后打开 execution record、启动进程、浏览器或外部资源。preflight result必须绑定selected capability identities、closure identity、Plan/Receipt identity与runtime invocation identity；runner在首次副作用前以这些expected identities重新核对，任一变化都回到admission。preflight 本身不写 Verification Result，不直接写 Environment store，也不把准备结果复制进 Result。

这比让 Verification runner 边跑边安装更安全，也比要求 Agent 手写新的 Plan 更确定。它不是通用 DAG：closure 只有“执行 capability 前必须 current”的单层集合，不表达 capability 间依赖或调度顺序。

该门禁只保护Formal Verification execution、Result与后续完成声明。Buildr provider、Receipt writer或preflight暂时不可用时，Agent MAY继续无关开发、只读调查和有界非正式检查，但必须明确这些结果不是Formal Verification、不得写current Result或据此声称完成；Buildr恢复后仍由Task Environment准备并由admission重新核对。由此既避免证据失真，也不把推荐workflow变成唯一工作许可。

### 3. Workspace路径与executable authority分开建模

规范化 Plan 对`cwd`、inputs与outputs使用统一typed path reference：`base` 为 `workspace|project|service|step`，并带必要selector与相对`path`。Project declaration v1中已有的scope-relative字符串按其Recipe scope确定性映射到typed reference；新的task-inline request必须显式提供基准。

executable不伪装成Workspace路径。Plan使用closed executable authority reference，只允许`runtime`、`workspace-foundation`、`service-wrapper`或现有兼容模型中显式授权的machine executable requirement；Receipt根据当前机器observation保存其实际绝对路径、version/content identity与来源。Project/Service wrapper仍不得逃逸相应execution root，machine executable则必须由声明或受管foundation明确选择，不能从ambient PATH猜测fallback。

Receipt 保存 typed reference、解析出的当前机器绝对路径和 identity；portable Plan、声明和专业 Result 不保存机器绝对路径。执行前统一完成规范化、realpath、越界、symlink 与 ownership 校验，diagnostic 同时报告 base、selector 和相对路径，避免只有模糊 cwd。

选择兼容映射而不是强迫所有现有声明立即改写，可避免一次性迁移；新 writer 使用新 Plan/Receipt schema，旧 Plan/Receipt 只读，显式 prepare 才升级。

### 4. Runtime invocation 由 Receipt 投射，环境变量只是内部传输

新 Receipt 保存 closed runtime invocation：runtime kind、解析自executable authority的机器 executable、version/content identity、受控 executable search 前缀及来源。Task Entry、Preparation 与 Verification runner消费同一 invocation；Buildr development bridge需要时可以内部投射 `BUILDR_NODE`，但 Agent和用户不再负责设置它。

核心不写死 Node、版本或机器路径。runtime 要求来自 Project/Service wrapper、Workspace Foundation 与声明；机器 executable 由当前 observation 解析。非 Node Project 不会获得 Node 前置。

不接受任意 caller env map，避免把 secret 或不可审计状态塞进 Receipt。只有受控 runtime transport 和声明允许的 executable route 能进入子进程环境。

### 5. 发行版与源码准备保持硬隔离

npm installation 继续以 package `engines.node`、安装回执和 Host Node 启动；发行版 `buildr web` 只托管随包 `web-dist`。其产品启动和Web负载不得读取 Product `preparation.yml`、development 精确 Node、源码 `node_modules` 或源码 TypeScript。`doctor`、`sync`及其他Workspace命令仍按自身契约读取目标Workspace、Project declaration与runtime projection；该边界不把用户Workspace输入误判为Product源码依赖。

Buildr 自举和 Candidate 可以使用 Product declaration与精确 development Node，但这些事实只能通过 Task Environment/受保护发布流程传递。若发行版入口需要 `BUILDR_NODE` 或源码依赖，属于发布资产/launcher identity 缺陷，不得用用户恢复步骤掩盖。

### 6. Gap分类保持专业authority

admission只按真实owner分类失败：没有适用能力是coverage gap；schema或引用非法是declaration invalid；Recipe、runtime、path或output不current是preparation gap；缺少授权是authorization blocked；外部系统暂不可用是external-system/resource unavailable。只有声明Recipe能够恢复的preparation gap才生成supplemental Plan Request并交给Task Environment。

无法自动恢复的事实由Agent解释并交给相应owner，不降低required capability、不自动改写声明，也不把外部系统故障伪装成测试覆盖缺失。这样保持Declaration、Environment、Verification与资源/授权边界各自唯一。

## Risks / Trade-offs

- **[Risk] capability 引用辅助 Service 后间接扩大执行范围** → 只允许同一已登记 Project、声明 Recipe 和 preparation outputs；辅助 scope不进入Task/Change/Content Target，并在Result中明确标记为auxiliary。
- **[Risk] Environment Plan identity 因 selected capabilities 变化而频繁失效** → closure 绑定 capability declaration identities并做集合去重；只有实际选择或声明变化才触发补充prepare。
- **[Risk] runtime invocation 变成任意env旁路** → closed shape拒绝任意env、secret和stdin，只允许受控runtime executable与search prefix。
- **[Risk] typed path无法表达Workspace外的权威runtime** → executable使用独立closed authority reference，只有Receipt保存机器解析路径。
- **[Risk] preflight通过后facts变化产生TOCTOU** → execution open与首次副作用绑定并重验selected capability、closure、Plan/Receipt和runtime identities。
- **[Risk] 新门禁阻塞无关工作或把Buildr变成许可层** → 门禁只限制正式execution/Result/完成声明，并保留明确非正式安全降级。
- **[Risk] 新旧Plan/Receipt并存增加兼容复杂度** → 旧schema只读；无 preparation 引用的既有 capability 保持当前行为；只有显式prepare写新schema。
- **[Trade-off] 第一次正式验证前增加preflight调用** → preflight必须是低成本纯观察；其成本换取避免分钟级验证后才发现确定性环境缺口。

## Migration Plan

1. 扩展 Project Verification declaration parser/identity，支持可选 preparation references；没有该字段的v2声明保持有效。
2. 引入分离typed Workspace path、executable authority、runtime invocation与capability closure的新Plan/Receipt writer；旧Plan/Receipt保持只读，显式prepare升级。
3. 在 Task Verification admission中增加纯读closure计算、专业gap分类与identity-bound diagnostic，再由Skill/workflow只对可恢复preparation gap编排 Task Environment prepare。
4. 先为Buildr Product Browser capability声明`buildr-web.npm-ci`辅助准备，验证不扩大Task scope。
5. 更新Task Environment、Verification、Buildr Skill与capability contracts，并用Node及非Node fixture验证不扫描技术栈。
6. 验证npm tarball、Launcher和发行版`buildr web`不读取Product源码preparation/runtime事实，同时`doctor`、`sync`仍能读取目标用户Workspace authority。
7. 验证Buildr preflight/provider不可用时只阻止正式证据路径，不阻止无关工作与明确标记的非正式检查。

回滚时可以停止写新schema并恢复旧admission路径；已写新Receipt保持只读，不降级或重写为旧值。Project声明中的可选preparation references可删除而不影响原capability调用模型。

## Open Questions

- 无需用户决定的开放语义问题。具体schema字段名可以在实现中调整，但必须保持Workspace path与executable authority分离、单一Environment writer、辅助scope不扩权、专业gap分类、正式门禁安全降级和发行隔离六项不变量。
