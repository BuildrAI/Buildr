## MODIFIED Requirements

### Requirement: 自定义供应商必须由用户显式声明端点与协议

系统 MUST 允许用户创建、编辑、启停和删除自定义供应商。创建 MUST 收集非空显示名称、绝对 Base URL 与 API 协议；Base URL MUST 是合法的 HTTP(S) 地址且 MUST NOT 包含用户信息（用户名或密码）。协议 MUST 支持 OpenAI 兼容 Chat Completions（`chat-completions`）、OpenAI Responses（`responses`）、Anthropic Messages（`anthropic-messages`）与 Gemini（`gemini`）；未支持或未知协议值 MUST NOT 被静默当作兼容协议执行。自定义供应商 MUST 与内置供应商一起出现在同一供应商列表，并 MUST 能作为模型选择中的独立分类被识别。删除自定义供应商 MUST 在用户确认后清理其本机 API Key、模型列表、供应商配置和启用偏好；MUST NOT 影响其他供应商或既有对话记录。

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

#### Scenario: 删除自定义供应商

- **WHEN** 用户确认删除一个自定义供应商
- **THEN** 系统 MUST 移除该供应商的配置、模型列表、启用偏好和本机 API Key
- **AND** 其他自定义供应商与内置供应商 MUST 保持原状态

### Requirement: 自定义供应商必须参与统一生命周期并隔离失败

自定义供应商 MUST 与内置供应商使用同一账号修订、供应商启停、供应商删除、模型启停、模型目录、本机网关租约和执行器选择流程。供应商修订 MUST 在名称、端点、协议、密钥使用方式、密钥身份、模型目录或影响模型选择的偏好发生实质变化时更新；仅额度、观察时间、诊断文本或返回顺序变化 MUST NOT 更新修订。删除自定义供应商 MUST 校验账号修订、拒绝存在进行中模型请求的删除，并在成功后撤销该账号租约和清理本机凭据。自定义供应商无法读取平台额度时 MUST 明确表达额度未知，MUST NOT 显示为零余额。任一自定义供应商失败 MUST NOT 使其他供应商或无关模型失效。

#### Scenario: 供应商被停用

- **WHEN** 用户停用一个自定义供应商
- **THEN** 该供应商 MUST 从默认供应商列表、模型目录、模型选择器和额度概览中隐藏，且不能创建新租约
- **AND** 重新启用 MUST 恢复同一配置、模型与启用偏好，不要求重新填写端点或密钥

#### Scenario: 删除自定义供应商后隔离

- **WHEN** 用户删除一个自定义供应商
- **THEN** 该供应商 MUST 从供应商列表、模型目录、模型选择器与额度概览中消失
- **AND** 其他供应商、已登录订阅账号与无关模型 MUST 保持原状态和可用性

#### Scenario: 额度未知

- **WHEN** 自定义供应商没有可读取的平台额度
- **THEN** 供应商卡片与额度概览 MUST 显示额度未知或暂不可读取
- **AND** 系统 MUST NOT 将其表达为零余额或耗尽

#### Scenario: 局部失败隔离

- **WHEN** 一个自定义供应商的端点不可用或其密钥被拒绝
- **THEN** 其他供应商、已登录订阅账号与无关模型 MUST 保持原状态和可用性
- **AND** 界面 MUST 只提示受影响供应商的具体异常

## ADDED Requirements

### Requirement: 供应商侧栏必须支持搜索与分类分组

供应商侧栏 MUST 提供按供应商名称、账号标签、认证方式或自定义端点搜索的过滤输入，并 MUST 按“订阅账号”“API Key”“自定义供应商”“智能体接入”分类分组展示。搜索 MUST 仅影响侧栏可见条目，MUST NOT 改变已选供应商、模型偏好或供应商状态；没有匹配项时 MUST 显示明确空状态。自定义供应商数量增多时，搜索与分组 MUST 仍保持可用，MUST NOT 依赖把全部条目平铺到一个列表。

#### Scenario: 搜索自定义供应商

- **WHEN** 用户在供应商侧栏输入自定义端点或显示名称的一部分
- **THEN** 侧栏 MUST 只显示匹配的供应商
- **AND** 清空搜索后 MUST 恢复原分组与全部可见供应商

#### Scenario: 分组展示供应商

- **WHEN** 用户打开模型设置
- **THEN** 供应商 MUST 按订阅账号、API Key、自定义供应商与智能体接入分组
- **AND** 分组 MUST NOT 阻止用户选择已有的供应商或打开其卡片
