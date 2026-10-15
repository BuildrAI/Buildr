## MODIFIED Requirements

### Requirement: 确认实际会话配置

Codex 调用 MUST 沿用本次目录解析的模型（Model），普通调用 MUST 继续继承推理级别（Reasoning Effort）。业务 MAY 经内部端口指定本次低推理级别（Reasoning Effort）及有界调用预算；MUST NOT 修改全局配置或开放任意网页覆盖。显式低推理级别（Reasoning Effort）MUST 经服务端确认，否则 MUST 在模型请求前失败。系统 MUST 从会话（Session）确认响应捕获模型（Model）、提供者（Provider）和推理级别（Reasoning Effort），固定到本次运行；普通继承调用的缺失展示字段 MUST 明示未确认，不推断默认值，也不因此阻断。公开结果 MUST 不含完整配置、路径或凭证，详情 MAY 展示最近一次确认值，MUST 不为展示启动模型服务。

指定调用预算 MUST 涵盖排队、准备、执行和结果校验；到期 MUST 将本次结果终止为失败并保留草稿，MUST NOT 发布迟到结果。排队过期 MUST NOT 中断别的运行（Run）；执行过期 MUST 中断并有界回收本次自有资源。

DSH MUST 沿用桌面当前默认模型（Model）、原生认证和路由，经原生准备调用固定本次配置；MUST 不复制凭据或修改桌面配置。普通未指定轻量策略的调用 MUST 继承桌面推理级别（Reasoning Effort）。内部业务明确请求轻量生成时，DSH MUST 使用该模型（Model）原生声明的最低受支持推理级别（Reasoning Effort），仅对本次调用生效；MUST NOT 猜测统一的 `low`、更换模型（Model）或写回桌面设置。已成功读取准确模型（Model）声明且原生不支持可选推理级别（Reasoning Effort）时，系统 MUST 省略本次级别覆盖并使用原生默认。声明不可读取、可选级别含未知语义或无法证明最低受支持级别、准备后的模型（Model）或级别不符以及必要路由不能确认时 MUST 在模型请求前局部失败。运行（Run）记录 MUST 保存本次原生准备实际确认的模型（Model）、提供者（Provider）和推理级别（Reasoning Effort），不能用桌面原设置替代。

#### Scenario: 配置变化后再次生成
- **WHEN** 两次生成解析到不同模型（Model）或推理级别（Reasoning Effort）
- **THEN** 每次结果 MUST 保持自己的确认配置，详情 MUST 表达最近一次使用值，不重标旧结果

#### Scenario: 首次使用或字段未返回
- **WHEN** 尚未调用或服务端未返回某确认字段
- **THEN** 界面 MUST 明确尚未确认，MUST 不把模型目录建议值或配置推断当成实际值

#### Scenario: 提交说明的专用执行预算
- **WHEN** 提交说明向 Codex 指定低推理级别（Reasoning Effort）和60秒预算
- **THEN** 本次 MUST 使用已确认低级别、保持原模型（Model）与全局配置；其他调用 MUST 继续继承原配置，到期 MUST 拒绝迟到结果且不打断其他运行（Run）

#### Scenario: DSH 继承包含自定义路由的默认配置
- **WHEN** DSH 桌面有效默认使用自定义提供者
- **THEN** 本次调用 MUST 使用对应原生认证及必要路由，并展示真实确认值；无法确认必要配置时 MUST 在模型请求前局部失败

#### Scenario: DSH 提交说明使用声明的最低受支持级别
- **WHEN** 提交说明明确请求轻量生成，桌面默认模型（Model）为 `swe-2`、推理级别（Reasoning Effort）为 `max`，该模型（Model）原生声明的最低受支持级别为 `medium`
- **THEN** 本次 MUST 沿用同一桌面后台及模型（Model），仅为本次请求选择并确认 `medium`，运行（Run）记录 MUST 表达 `medium`；桌面聊天设置 MUST 仍为 `max`

#### Scenario: DSH 最低受支持级别无法确认
- **WHEN** 明确请求轻量生成但模型（Model）声明不可读取、可选级别包含无法排序的标识，或原生准备未确认所选最低级别
- **THEN** 系统 MUST 在发送生成内容前明确局部失败并保留草稿，MUST NOT 猜测 `low`、静默沿用高推理或换用其他模型（Model）

#### Scenario: DSH 普通调用继续继承桌面
- **WHEN** 内部调用未请求轻量生成
- **THEN** 系统 MUST 继续使用桌面当前推理级别（Reasoning Effort），MUST 不要求最低级别声明或修改桌面设置

#### Scenario: DSH 模型不支持可选推理级别
- **WHEN** 轻量生成已成功读取准确模型（Model）声明，原生明确不提供可选推理级别（Reasoning Effort）
- **THEN** 系统 MUST 省略级别覆盖并经原生默认完成准备确认，MUST 不猜测或发送不受支持的 `low`
