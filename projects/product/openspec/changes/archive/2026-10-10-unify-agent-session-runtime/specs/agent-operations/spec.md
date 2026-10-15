## MODIFIED Requirements

### Requirement: 本机接入登记与选择

系统 MUST 提供可由智能体（Agent）调用的登记、查询和默认选择能力。登记 MUST 验证真实可执行入口及所需协议能力，保存稳定调用身份而非进程编号，不保存凭证副本。相同身份重复登记 MUST 幂等；变更默认 MUST 校验已观察登记版本。网页 MUST 不要求用户填写路径、端口或密钥，MUST 不把复制接入请求当成接入成功。

登记 MUST 区分 Codex 应用服务（App Server）与 DSH 智能体客户端协议（ACP），表达原生默认配置来源，MUST 兼容既有 Codex 登记和默认选择。首版 MUST 不要求用户在 Buildr 再配置模型或凭据。

#### Scenario: 接入后重复使用
- **WHEN** 智能体（Agent）按产品指引登记本机 Codex，用户随后打开其他功能
- **THEN** 系统 MUST 展示同一接入记录与唯一默认选择，调用时不再要求接入

#### Scenario: 登记版本变化
- **WHEN** 用户按旧登记版本修改默认选择
- **THEN** 系统 MUST 明确报告冲突并保留新记录，不覆盖另一个入口的选择

#### Scenario: 新增 DSH 后保留 Codex
- **WHEN** 已有 Codex 登记的用户接入 DSH
- **THEN** 两条登记 MUST 各自表达真实接入方式，原默认 MUST 不被静默替换，用户 MUST 可按同一选择交互使用 DSH

### Requirement: 统一调用与固定执行者

业务功能 MUST 经统一操作能力选择执行者、发起、查询和取消。协议适配 MUST 在具体执行适配器（Adapter）内完成，MUST 与既有文件投射能力区分。一次执行 MUST 捕获接入身份与版本；默认切换仅影响后续新执行，不迁移进行中工作或重标已有结果。失败 MUST 不静默切换执行者或自动重放已接受的模型请求。

Codex 与 DSH 生成 MUST 复用同一业务输入、执行状态和结果校验。临时上下文 MUST 由提供者在一次生成内部创建和释放；首版 MUST 不以新增公开会话管理接口或持久会话存储作为生成前提。

#### Scenario: 本次覆盖后切换默认
- **WHEN** 用户为一次生成覆盖执行者，并在生成期间修改全局默认
- **THEN** 本次执行 MUST 保持原执行者，覆盖在发起后消费，后续执行按新的默认选择

#### Scenario: 选择 DSH 生成
- **WHEN** 用户选择已通过生成能力验证的 DSH
- **THEN** 业务 MUST 通过同一入口获取运行状态、取消及可校验结果，MUST 不要求业务直接操作 ACP 会话

### Requirement: 专用实例复用与回收

系统 MUST 首次调用时才启动自己拥有的对应智能体（Agent）服务进程，后续复用。每个已登记身份 MUST 最多一个存活自有服务进程，生成 MUST 串行执行；Codex 与 DSH MUST 各使用自己的程序，MUST 不按任务、模型或策略启动同一身份的并行实例。全部工作完成后完全空闲30分钟 MUST 释放专用实例；排队或执行 MUST 不计为空闲，状态查询 MUST 不延长空闲。再次请求 MUST 自动启动，保留接入记录与用户成果。退出 Buildr MUST 停止接受新请求并有界回收自己启动的实例，不关闭用户独立智能体进程；关闭浏览器标签 MUST 不等同退出 Buildr。

配置变化若需要重启，系统 MUST 在当前执行结束并确认旧进程退出后启动新进程，等待与准备 MUST 计入本次预算。取消或超时无法确认中断时 MUST 有界关闭本次自有进程，MUST 不自动重放已接受请求，MUST 不因排队过期中断其他运行（Run）。

#### Scenario: 空闲后继续生成
- **WHEN** 专用实例完全空闲30分钟被释放后再次生成
- **THEN** 系统 MUST 自动启动新实例，MUST 不要求重新登记或清除已有说明

#### Scenario: 退出清理
- **WHEN** 用户退出 Buildr，且存在运行中生成或空闲专用实例
- **THEN** 系统 MUST 终止或完成有界清理并关闭自己拥有的进程，其他独立智能体进程 MUST 保持

#### Scenario: 两次生成复用实例
- **WHEN** 同一登记连续发起生成且配置无需进程重启
- **THEN** 系统 MUST 复用同一进程并串行处理，两次临时上下文 MUST 独立

#### Scenario: 默认配置需要重启
- **WHEN** 后续请求解析到必须重启才可生效的新配置，当前仍有执行
- **THEN** 系统 MUST 顺序等待、关闭旧进程并启动新进程，MUST 不同时保留两个策略实例，MUST 不超出本次调用预算

### Requirement: 确认实际会话配置

Codex 调用 MUST 沿用本次目录解析的模型（Model），普通调用 MUST 继续继承推理级别（Reasoning Effort）。业务 MAY 经内部端口指定本次低推理级别（Reasoning Effort）及有界调用预算；MUST NOT 修改全局配置或开放任意网页覆盖。显式低推理级别（Reasoning Effort）MUST 经服务端确认，否则 MUST 在模型请求前失败。系统 MUST 从会话（Session）确认响应捕获模型（Model）、提供者（Provider）和推理级别（Reasoning Effort），固定到本次运行；普通继承调用的缺失展示字段 MUST 明示未确认，不推断默认值，也不因此阻断。公开结果 MUST 不含完整配置、路径或凭证，详情 MAY 展示最近一次确认值，MUST 不为展示启动模型服务。

指定调用预算 MUST 涵盖排队、准备、执行和结果校验；到期 MUST 将本次结果终止为失败并保留草稿，MUST NOT 发布迟到结果。排队过期 MUST NOT 中断别的运行（Run）；执行过期 MUST 中断并有界回收本次自有资源。

DSH 调用 MUST 沿用原生登录和桌面有效默认；需要桥接时 MUST 同时覆盖必要提供者路由，MUST 不复制凭据或把 ACP 内置默认冒充桌面默认。DSH 本次低推理级别（Reasoning Effort）MUST 按实际模型能力映射并经服务端确认，否则 MUST 在模型请求前失败。

#### Scenario: 配置变化后再次生成
- **WHEN** 两次生成解析到不同模型（Model）或推理级别（Reasoning Effort）
- **THEN** 每次结果 MUST 保持自己的确认配置，详情 MUST 表达最近一次使用值，不重标旧结果

#### Scenario: 首次使用或字段未返回
- **WHEN** 尚未调用或服务端未返回某确认字段
- **THEN** 界面 MUST 明确尚未确认，MUST 不把模型目录建议值或配置推断当成实际值

#### Scenario: 提交说明的专用执行预算
- **WHEN** 提交说明指定低推理级别（Reasoning Effort）和60秒预算
- **THEN** 本次 MUST 使用已确认低级别、保持原模型（Model）与全局配置；其他调用 MUST 继续继承原配置，到期 MUST 拒绝迟到结果且不打断其他运行（Run）

#### Scenario: DSH 继承包含自定义路由的默认配置
- **WHEN** DSH 桌面有效默认使用自定义提供者
- **THEN** 本次调用 MUST 使用对应原生认证及必要路由，并展示真实确认值；无法确认必要配置时 MUST 在模型请求前局部失败

## ADDED Requirements

### Requirement: DSH 临时生成的实际限制

DSH 提交说明 MUST 使用独立临时上下文，不落盘保存生成对话，不携带前次生成上下文，完成后 MUST 释放对应内存记录。关闭普通持久会话 MUST 不被当作临时能力证明。提交说明 MUST 仅依据业务给定材料发起一次生成，原生和外部工具（Tool）、自动项目上下文及可关闭的对话日志上传 MUST 禁用；原生认证 MUST 保持可用。出现工具执行 MUST 拒绝结果并有界回收自有进程，MUST NOT 自动补读、改用其他协议或执行者。

DSH 一次返回 MUST 经结构和同一业务规则校验；协议未提供原生结构约束时 MUST 如实表达，MUST 不追加模型修复请求。取消、超时、配置或格式失败 MUST 保留用户已有说明，不影响直接 Git 操作。临时会话（Ephemeral Session）MUST 不被表述为删除供应商全部诊断日志。

#### Scenario: DSH 连续生成不积累对话
- **WHEN** 用户通过同一 DSH 服务进程连续生成两次
- **THEN** 每次 MUST 使用独立临时上下文，无持久生成对话及跨次上下文，完成后对应内存记录 MUST 释放

#### Scenario: DSH 仅使用给定材料
- **WHEN** DSH 接受提交说明生成
- **THEN** 工具（Tool）MUST 不可用且自动项目上下文 MUST 不注入；出现工具执行时 MUST 明确失败并保留草稿，MUST 不静默回退

#### Scenario: DSH 返回格式不合规
- **WHEN** 一次返回不能通过所需结构或业务校验
- **THEN** 系统 MUST 明确失败且保留草稿，MUST 不自动追加模型请求
