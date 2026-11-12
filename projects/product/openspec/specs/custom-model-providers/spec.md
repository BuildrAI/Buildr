# custom-model-providers Specification

## Purpose
定义用户自带密钥（BYOK）自定义模型供应商的端点声明、可选凭据、模型发现与手动维护，以及经本机模型网关供执行器使用的安全边界，使 OpenAI 兼容端点无需发布新代码即可接入 Buildr。

## Requirements

### Requirement: 自定义供应商必须由用户显式声明端点与协议

系统 MUST 允许用户创建、编辑和启停自定义供应商。创建 MUST 收集非空显示名称、绝对 Base URL 与 API 协议；Base URL MUST 是合法的 HTTP(S) 地址且 MUST NOT 包含用户信息（用户名或密码）。协议 MUST 支持 OpenAI 兼容 Chat Completions（`chat-completions`）、OpenAI Responses（`responses`）、Anthropic Messages（`anthropic-messages`）与 Gemini（`gemini`）；未支持或未知协议值 MUST NOT 被静默当作兼容协议执行。自定义供应商 MUST 与内置供应商一起出现在同一供应商列表，并 MUST 能作为模型选择中的独立分类被识别。

#### Scenario: 保存有效的自定义供应商

- **WHEN** 用户填写名称、`https://gateway.example.com/v1` 形式的 Base URL 并选择受支持的协议后保存
- **THEN** 系统 MUST 保存该供应商配置并在供应商列表显示其卡片
- **AND** 配置成功仅表示端点声明有效，MUST NOT 在未观察模型或未核对端点前宣称其模型可用

#### Scenario: 四种受支持协议

- **WHEN** 用户分别选择 `chat-completions`、`responses`、`anthropic-messages` 或 `gemini` 保存自定义供应商
- **THEN** 系统 MUST 按所选协议调用对应的上游端点与认证方式
- **AND** 编辑供应商时 MUST 回填已保存的协议，切换协议 MUST 触发运行时重建

#### Scenario: 拒绝无效端点

- **WHEN** 用户提交缺少协议、非 HTTP(S)、包含用户名或密码的 Base URL
- **THEN** 系统 MUST 拒绝保存并给出针对该字段的可操作诊断
- **AND** 既有供应商配置、模型偏好与运行中执行 MUST NOT 被修改或中断

#### Scenario: 未知协议值

- **WHEN** 配置携带四种协议之外的协议值
- **THEN** 系统 MUST 明确拒绝，而不是按 OpenAI 兼容协议发送请求

### Requirement: 自定义供应商 API Key 可选且必须保持私有

自定义供应商 MUST 允许用户选择是否使用 API Key。启用时必须提交非空密钥；未启用时系统 MUST NOT 向上游发送认证头，并 MUST 仍支持无需认证的模型发现与推理。API Key MUST 只保存在对应供应商账号的应用私有目录，文件和目录权限 MUST 限制为当前用户。供应商读取、模型目录、事件、诊断、错误和日志 MUST NOT 返回或记录明文密钥；API Key MUST NOT 被写入 Git、源资产或公共配置。写入新密钥或改变密钥使用方式后，旧凭据身份创建的模型租约 MUST 立即失效，请求 MUST NOT 静默改用新凭据重发。

#### Scenario: 无密钥端点

- **WHEN** 用户关闭“使用 API Key”并保存可访问的兼容端点
- **THEN** 模型发现和推理 MUST 在请求中不携带认证头
- **AND** 界面 MUST NOT 显示已配置密钥或要求用户补填密钥

#### Scenario: 保存密钥后不回显

- **WHEN** 用户提交 API Key 并保存成功
- **THEN** 后续供应商读取 MUST 只显示“已配置”状态，不返回密钥原文
- **AND** 诊断与日志 MUST NOT 包含密钥原文

#### Scenario: 更换密钥或端点

- **WHEN** 用户更换 API Key、切换是否使用密钥或修改 Base URL
- **THEN** 旧配置创建的模型租约 MUST 失效，新执行 MUST 使用完整的新配置
- **AND** 旧请求 MUST NOT 自动改用新配置重发

### Requirement: 自定义供应商模型列表必须支持发现与手动维护

自定义供应商 MUST 支持两种模型列表方式：通过所选协议对应的模型列表接口发现模型，或由用户手动添加模型。Chat Completions 与 Responses 使用 OpenAI 兼容模型列表接口；Anthropic Messages 使用其模型列表接口并携带对应认证；Gemini 使用 Google 模型列表接口，只保留支持内容生成的模型。手动模型 MUST 至少包含原样发送给上游的模型 id，并 MAY 维护显示名与上下文窗口。自动发现结果 MUST 作为候选呈现，MUST NOT 覆盖用户手工维护的模型列表、模型启用偏好或已保存的模型配置。分页发现 MUST 有界，不得无限遍历。发现失败 MUST NOT 清空已有模型、把供应商显示为零模型或判定密钥失效；系统 MUST 明确本次观察未完成。模型列表为空时 MAY 保存供应商配置，但 MUST NOT 产生可执行模型候选。

#### Scenario: 获取模型列表

- **WHEN** 用户对已保存的自定义供应商发起“获取模型列表”，端点按所选协议返回模型列表
- **THEN** 系统 MUST 展示可选择的发现结果，并由用户确认加入供应商目录
- **AND** 未被确认的模型 MUST NOT 成为新执行候选，既有启用偏好 MUST NOT 被自动改写

#### Scenario: Gemini 模型发现

- **WHEN** Gemini 端点返回包含 `supportedGenerationMethods` 的模型列表
- **THEN** 系统 MUST 只把支持 `generateContent` 的模型作为候选，并去掉 `models/` 前缀得到上游模型 id
- **AND** 分页结果 MUST 在有界页数内合并，下一页不可读时 MUST 保留已获得的候选并说明未完成

#### Scenario: 手动添加模型

- **WHEN** 用户手动添加模型 id `my-model-v2` 并设置显示名与上下文窗口
- **THEN** 该模型 MUST 出现在供应商目录并可按既有模型启停规则启用
- **AND** 发往上游的模型 id MUST 保持 `my-model-v2`

#### Scenario: 发现失败保留手写列表

- **WHEN** 模型列表接口暂时不可访问或返回错误
- **THEN** 系统 MUST 保留用户已手动维护的模型与启用偏好
- **AND** 供应商 MUST NOT 被显示为零模型或密钥已失效，其他供应商 MUST NOT 被阻断

### Requirement: 自定义供应商模型必须通过本机网关调用

自定义供应商模型 MUST 通过 Buildr 现有本机模型网关提供给执行器。网关 MUST 将统一模型请求转换为供应商声明的协议，并使用账号私有配置发送到用户声明的 Base URL：Chat Completions 与 Responses 使用 Bearer 认证与对应路径；Anthropic Messages 使用 `anthropic-version` 与密钥头调用 `/messages`；Gemini 使用 `x-goog-api-key` 与路径中的模型 id 调用 `generateContent` / `streamGenerateContent`。流式响应、工具调用、推理分片、用量、取消、超时和有界错误处理 MUST 保持既有网关语义；不可转换的内容 MUST 以明确错误拒绝。执行器 MUST NOT 获得自定义 Base URL 或上游 API Key，也 MUST NOT 直接访问互联网上的任意模型地址。携带凭据的请求 MUST NOT 跟随跳转到配置来源之外的目标。

#### Scenario: 执行器使用自定义供应商模型

- **WHEN** 用户启用并选择自定义供应商的模型后在兼容执行器中发送请求
- **THEN** 模型请求 MUST 经由本机模型网关发送到用户配置的 Base URL
- **AND** 执行器侧配置 MUST 只包含本机网关地址与短时令牌

#### Scenario: 按协议调用上游

- **WHEN** 自定义供应商分别使用 Responses、Anthropic Messages 或 Gemini 协议
- **THEN** 网关 MUST 把执行器请求转换为该协议并调用对应端点
- **AND** Anthropic Messages MUST 携带 `anthropic-version` 与密钥头
- **AND** Gemini MUST 把模型 id 放在路径中，且请求体 MUST NOT 携带 `model` 或 `stream`

#### Scenario: 端点失败

- **WHEN** 自定义端点返回认证失败、限流、超时或不可达
- **THEN** 系统 MUST 返回有界且不含密钥的错误信息，并保留该供应商配置与其他供应商状态
- **AND** 其他模型与其他供应商 MUST NOT 被阻断

### Requirement: 自定义供应商必须参与统一生命周期并隔离失败

自定义供应商 MUST 与内置供应商使用同一账号修订、供应商启停、模型启停、模型目录、本机网关租约和执行器选择流程。供应商修订 MUST 在名称、端点、协议、密钥使用方式、密钥身份、模型目录或影响模型选择的偏好发生实质变化时更新；仅额度、观察时间、诊断文本或返回顺序变化 MUST NOT 更新修订。自定义供应商无法读取平台额度时 MUST 明确表达额度未知，MUST NOT 显示为零余额。任一自定义供应商失败 MUST NOT 使其他供应商或无关模型失效。

#### Scenario: 供应商被停用

- **WHEN** 用户停用一个自定义供应商
- **THEN** 该供应商 MUST 从默认供应商列表、模型目录、模型选择器和额度概览中隐藏，且不能创建新租约
- **AND** 重新启用 MUST 恢复同一配置、模型与启用偏好，不要求重新填写端点或密钥

#### Scenario: 额度未知

- **WHEN** 自定义供应商没有可读取的平台额度
- **THEN** 供应商卡片与额度概览 MUST 显示额度未知或暂不可读取
- **AND** 系统 MUST NOT 将其表达为零余额或耗尽

#### Scenario: 局部失败隔离

- **WHEN** 一个自定义供应商的端点不可用或其密钥被拒绝
- **THEN** 其他供应商、已登录订阅账号与无关模型 MUST 保持原状态和可用性
- **AND** 界面 MUST 只提示受影响供应商的具体异常
