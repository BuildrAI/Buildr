# unified-model-subscriptions Specification

## Purpose
定义 Buildr 按本机应用配置域集中接入模型套餐的账号、动态模型目录、准确付费来源和协议互通，使不同原生智能体能够共享模型推理，同时保持工具执行、凭据、会话恢复和实际额度事实各自的边界。

## Requirements

### Requirement: 套餐账号与执行方独立

系统 MUST 允许 Codex、Qoder、DSH 独立选择已接入账号中与当前执行方兼容的模型，MUST 保留稳定账号来源、真实模型身份和观察版本；程序自身必需认证与模型套餐认证 MUST 分别表达。来源已登录、模型已启用与执行方兼容 MUST 分别判断；界面兼容提示 MUST NOT 改写账号模型偏好或静默切换付费来源。

#### Scenario: DSH 使用 Codex 套餐
- **WHEN** 用户选择 DSH 和已接入 Codex 账号的 GPT 模型
- **THEN** 推理由所选套餐提供，工具执行和权限仍由 DSH 原生负责
- **AND** MUST NOT 因未登录 DeepSeek 而统一拒绝此组合

### Requirement: Devin 登录与模型推理

系统 MUST 提供 Devin 浏览器登录、准确回调、动态模型发现与模型调用，MUST 保留工具回合、流式结果、取消和真实错误；MUST NOT 用 Devin 云端任务执行代替模型推理。对话界面 MUST 允许 Codex、DSH 与 Qoder 选择 Devin 账号下任一已启用的可用模型，MUST NOT 因执行方类型整体置灰 Devin 来源；执行方无法表达的思考档位或能力 MUST 在发送时说明具体原因并保留草稿与其他可用组合，MUST NOT 表达为厂家永久不支持或账号失效。请求兼容处理 MUST 保留工具身份、参数语义、权限规则及结果配对；未知工具及权限说明 MUST 原样传递。上游真实失败 MUST 如实呈现并保留准确原因与草稿，MUST NOT 用说明改写、声明接纳或额度错误冒充整轮成功，也 MUST NOT 把某一模型的结果解释为其他模型必然可用。后端准确来源与诊断能力 MUST 保留。

#### Scenario: 任一执行方使用 Devin
- **WHEN** 用户完成 Devin 登录并选择与当前执行方能力兼容的可用模型
- **THEN** 所选执行方 MUST 能通过对应兼容协议使用该模型
- **AND** 已输出的失败请求 MUST NOT 被静默换源重放

#### Scenario: 不兼容执行方查看 Devin
- **WHEN** 用户选择任一执行方并打开模型列表
- **THEN** Devin 来源 MUST 只按模型可用性、启停与来源状态决定可选，MUST NOT 因执行方类型整体置灰
- **AND** 执行方无法表达的思考档位或能力 MUST 在发送时说明具体原因并保留草稿与其他可用组合

#### Scenario: 恢复既有不兼容选择
- **WHEN** 对话恢复了当前不可用、已停用或已不在模型目录中的 Devin 来源选择
- **THEN** 界面 MUST 保留原选择、历史与草稿并显示原因，不发送本次输入
- **AND** 用户 MUST 能显式改选模型或智能体后继续，不自动更换来源或重发

#### Scenario: Codex 使用 Devin 任一模型
- **WHEN** 用户选择 Codex、Devin 账号下任一已启用且可用的模型和任一权限模式
- **THEN** 该模型 MUST 可选，并按所选权限使用对应原生上下文
- **AND** 上游拒绝或失败 MUST 保留真实原因与草稿，不自动改选模型、权限或来源，也不重发

#### Scenario: Codex 完全访问使用 SWE-2
- **WHEN** 用户显式选择 Codex、Devin SWE-2 和完全访问
- **THEN** 模型 MUST 可选，真实原生工具读取和结果接续可完成，工具身份及参数不因说明兼容而改变
- **AND** 切回默认权限 MUST 保留草稿和模型选择，下一轮按默认沙箱及审批策略执行，不能静默恢复完全访问

#### Scenario: Codex 默认权限使用 SWE-2
- **WHEN** 用户选择 Codex、Devin SWE-2 和默认权限
- **THEN** 模型 MUST 可选，工作目录内原生工具读写及结果接续可完成
- **AND** 需要原生审批的动作 MUST 按默认策略呈现，拒绝后 MUST 不执行对应越界写入，不得提高权限重试

#### Scenario: 精确工具说明兼容
- **WHEN** Devin 收到 Codex 两个命令工具的已知用途说明
- **THEN** 系统 MUST 用含义相同的说明交付，保留原参数说明、名称、权限上下文和结果配对
- **AND** 非 Codex 请求及未知版本说明 MUST 不被该兼容处理改写

#### Scenario: 默认权限说明等义兼容
- **WHEN** Codex 默认权限请求中的已知审批问题说明需要兼容 Devin
- **THEN** 系统 MUST 保留简短用户批准问题及示例，只使用含义相同的文字，其他必要规则、实际沙箱和审批策略 MUST 不变
- **AND** 用户消息、非 Codex 请求、区块外文字与未知权限说明 MUST 原样传递

### Requirement: 私有凭据与本机路由

系统 MUST 按应用配置域隔离账号、密钥及本机网关，只允许已认证的准确模型绑定；上游秘密 MUST NOT 出现在公共响应、事件、日志或源资产。默认桌面账号 MUST NOT 被自动导入或覆盖。

#### Scenario: 访问另一套餐
- **WHEN** 客户端使用受限绑定请求未授权账号或模型
- **THEN** 网关 MUST 拒绝本次请求，不向上游发送

### Requirement: 目录和额度必须保留实际观察边界

系统 MUST 展示账号实际发现的模型、真实能力及额度更新时间；查询失败 MUST 保留可识别的旧观察，MUST NOT 将静态目录、估算用量或未知余额冒充已验证权益。某一账号查询失败 MUST NOT 阻断其他账号。

#### Scenario: 额度不可读取
- **WHEN** 模型可调用而套餐余额接口不可用
- **THEN** 系统 MUST 显示额度未知并保留模型使用能力，不制造零余额或已耗尽结论

### Requirement: 未知套餐输出路径必须如实表达

系统 MUST 区分执行方能消费外部模型和其个人套餐能供出模型。没有可靠输出接口时 MUST 明确该来源未接入，MUST NOT 伪造兼容或运行完整智能体循环冒充裸推理。

#### Scenario: Qoder 仅消费外部模型
- **WHEN** 已验证 Qoder 使用 Devin 而尚未证明 Qoder 个人套餐输出
- **THEN** 系统 MUST 分别报告这两项，不宣称全部双向互通

### Requirement: 模型账号观察必须按账号隔离并区分实质变化

系统 MUST 为每个模型账号独立维护选择修订（Revision）。账号修订 MUST 只在该账号身份、启停、状态、模型目录或影响模型选择的偏好发生实质变化时更新；仅额度、观测时间、诊断信息或模型返回顺序变化 MUST NOT 更新修订。检查或发现一个账号 MUST NOT 更新其他账号的修订，也 MUST NOT 阻止正在使用其他账号的对话准备或发送。

对话准备与发送 MUST 核对当前账号身份、账号可用性、模型存在性与启停状态、服务档位、思考深度及执行方兼容性。若账号身份和所选模型仍有效，旧修订本身 MUST NOT 导致发送失败；系统 MUST 采用当前观察重新计算预览与绑定。只有登录来源变化、所选用途不可用、模型被移除或停用、能力不兼容或权限不兼容等实质变化才 MUST 拒绝本次发送，并 MUST 明确说明具体原因和草稿保留事实。

#### Scenario: Devin 变化不影响使用 Qoder 的对话
- **WHEN** 一段对话正在使用 Qoder 模型，同时 Devin 账号被检查、刷新或发生实质变化
- **THEN** Qoder 账号的修订和当前选择 MUST 保持不变
- **AND** 使用 Qoder 的对话 MUST 能继续准备和发送，不得出现无关账号引起的冲突提示

#### Scenario: 仅额度或时间变化不更新修订
- **WHEN** 同一模型账号再次检查后只有额度、观测时间或诊断文本变化
- **THEN** 该账号的模型目录与选择修订 MUST 保持不变
- **AND** 界面 MAY 更新额度与观察时间，MUST NOT 要求用户重新选择模型

#### Scenario: 同源模型仍有效时采用当前观察
- **WHEN** 模型账号目录刷新后账号身份和所选模型仍有效，但账号修订已经因其他实质变化更新
- **THEN** 系统 MUST 使用当前模型能力、档位和上下文重新准备发送
- **AND** MUST NOT 仅因旧修订拒绝本次请求

#### Scenario: 真实来源变化需要重新选择
- **WHEN** 账号登录来源身份变化、所选模型被停用或移除，或当前执行方不再兼容该模型
- **THEN** 系统 MUST 拒绝新发送并显示准确原因
- **AND** MUST 保留草稿和已有对话记录，MUST NOT 自动切换到其他共享套餐来源或重发

### Requirement: 模型目录由后台核对维护并静默读取
系统 MUST 在本机服务启动后立即后台核对已接入账号及模型，并以60秒间隔继续核对；同一服务 MUST 共享当前本机结果，外部核对 MUST 不重叠，关闭后 MUST 停止调度。普通账号和模型目录读取 MUST 只读取当前本机结果，不等待或触发外部核对；显式手动核对 MUST 保持可用。本机账号退出、来源失效与模型启停 MUST 立即反映，MUST NOT 由旧结果绕过执行校验。

#### Scenario: 外部核对耗时较长
- **WHEN** 一次后台核对仍未完成，多个页面读取目录
- **THEN** 系统 MUST 立即返回已有本机结果，不重复核对，不等待外部完成

#### Scenario: 后台调度与退出
- **WHEN** 服务启动、达到后续60秒触发点，或服务关闭
- **THEN** 启动 MUST 发起后台核对，后续无进行中核对时 MUST 再次发起，关闭 MUST 停止后续调度

### Requirement: 正常模型刷新不打扰用户
系统 MUST 在初次无结果时静默保留空列表，在正常获取、刷新成功和恢复时 MUST NOT 新增状态或成功提示。检查未完成 MUST 保留上次有效状态和模型列表，MUST NOT 将其当作失效证据；账号设置 MUST 保留实际诊断，对话区 MUST 只提示影响当前选择的已确认异常；恢复后 MUST 撤掉对应异常，不弹恢复成功。初次读取尚未完成 MUST NOT 冒充账号或模型已失效。

#### Scenario: 初次无结果或正常刷新
- **WHEN** 本机尚无模型结果或后台正常刷新
- **THEN** 页面 MUST 不显示获取中、刷新中或成功提示，有结果后自然更新

#### Scenario: 刷新失败后恢复
- **WHEN** 外部核对失败且后来恢复成功
- **THEN** 账号设置 MUST 在失败时保留已有列表并说明异常；对话区 MUST NOT 因无关账号或未完成检查显示失效提示，成功后只更新结果及撤掉异常

### Requirement: 跨协议工具调用必须核对完整参数和稳定身份

模型协议转换 MUST 保留每个工具调用的稳定身份、完整名称、参数语义及结果配对。参数增量、完整完成事件和最终快照 MUST 按准确调用独立核对；缺失增量时 MUST 使用可靠完整事件补齐，重复快照 MUST 不重复拼接。已收到内容与完整回执冲突时 MUST 明确失败，MUST NOT 静默输出空参数、覆盖旧参数或混合并行调用。同协议通道 MUST 保留原始响应语义。

#### Scenario: 只有完整参数回执
- **WHEN** 工具身份已提供且完成事件携带完整参数，没有参数增量
- **THEN** 跨协议响应 MUST 保留完整参数，MUST NOT 将其变为空对象

#### Scenario: 并行工具参数交错及名称分片
- **WHEN** 多个工具身份的参数增量交错或名称分片到达
- **THEN** 每个调用 MUST 具有准确完整名称与各自参数，下游 MUST 不收到不完整工具身份

#### Scenario: 完整参数与增量冲突
- **WHEN** 同一调用已收到的参数与完整回执不能一致合并
- **THEN** 系统 MUST 明确报告本次响应不一致，MUST NOT 将任一版本静默当作成功调用

### Requirement: Responses 客户端必须能读到上游明文思考

模型网关在把上游 chat-completions 的可读推理文本（`reasoning_content`）翻译成 Responses 协议时，MUST 同时输出 `summary` 文本与不透明恢复载荷 `encrypted_content`，MUST NOT 只保留加密载荷而把可读文本整体藏起来。Responses 客户端因此 MUST 能从 `item.summary` 取得思考文本，并按自身展示策略使用；Buildr 对话不展示该文本不构成省略它的理由。上游只返回推理签名、没有明文时，摘要 MUST 保持为空，MUST NOT 编造或改写思考内容。重放 Responses 输入时 MUST 继续接受该不透明载荷并还原同一推理事实，签名绑定与来源校验 MUST 与改动前一致。

#### Scenario: chat-completions 上游带明文思考
- **WHEN** 上游返回 `reasoning_content` 文本，DSH 以 Responses 协议请求同一模型
- **THEN** 响应中的 reasoning 条目 MUST 带非空 `summary` 文本
- **AND** `encrypted_content` MUST 仍可用于下一轮重放

#### Scenario: 只有签名的推理
- **WHEN** 上游只返回推理签名而没有可读文本
- **THEN** reasoning 条目的 `summary` MUST 为空
- **AND** 重放 MUST 仍按该签名还原同一条推理事实

### Requirement: API Key 来源必须与套餐账号并列参与统一模型流程

系统 MUST 将 API Key 模型来源视为与套餐账号并列的独立账号参与模型目录、账号修订、模型偏好、本机模型网关和执行器选择。订阅账号与 API Key 账号 MUST 能同时保持可用，并 MUST 在模型选择器中作为两个独立分类出现，例如 `ChatGPT` 分类与 `ChatGPT API` 分类；系统 MUST NOT 用互斥模式开关或单一来源合并两者。模型来源名称 MUST 与执行智能体名称分开表达：执行智能体 `Codex` MUST 继续显示为 `Codex`，执行智能体 `DSH` MUST 继续显示为 `DSH`，而 DSH 接入的 DeepSeek 模型来源 MUST 显示为 `DeepSeek`。账号身份 MUST 由实际凭据身份确定但不得公开凭据；模型租约 MUST 绑定账号身份及模型配置。API Key 来源 MUST 遵守既有账号隔离、目录观察、额度未知、模型启停、跨执行器消费和错误保真要求。

#### Scenario: API Key 来源出现在统一模型目录

- **WHEN** ChatGPT API Key 校验成功并发现已启用模型
- **THEN** 该模型 MUST 出现在统一模型目录并可供兼容执行器选择
- **AND** 账号来源 MUST 可追溯并在模型选择器中显示为独立的 `ChatGPT API` 分类

#### Scenario: 订阅和 API Key 同时参与模型选择

- **WHEN** Codex 订阅账号与 ChatGPT API Key 均已连接并启用模型
- **THEN** 模型选择器 MUST 同时显示 `ChatGPT` 和 `ChatGPT API` 分类
- **AND** 用户 MUST 能分别选择任一来源的模型，不要求停用另一来源或切换全局模式

#### Scenario: 执行智能体与模型来源分离

- **WHEN** Codex 执行智能体选择订阅来源或 ChatGPT API 来源的模型
- **THEN** 执行身份 MUST 显示为 `Codex`
- **AND** 模型来源 MUST 分别显示为 `ChatGPT` 或 `ChatGPT API`，不得把执行智能体名称当作模型来源名称

#### Scenario: DSH 与 DeepSeek 来源分离

- **WHEN** DSH 执行智能体使用其接入的 DeepSeek 账号模型
- **THEN** 执行身份 MUST 显示为 `DSH`
- **AND** 模型来源 MUST 显示为 `DeepSeek`，不得把 DSH 显示为模型来源

#### Scenario: 密钥身份变化

- **WHEN** 用户为同一 API Key 账号更换密钥
- **THEN** 账号身份 MUST 更新并使旧模型租约失效
- **AND** 新请求 MUST 显式使用新密钥配置，不静默重放旧请求

#### Scenario: 额度未知

- **WHEN** OpenAI 官方接口未提供可读取的套餐额度
- **THEN** 系统 MUST 明确额度未知，仍可正常展示与使用模型
- **AND** MUST NOT 制造零余额或已耗尽结论

### Requirement: Qoder 模型目录必须覆盖真实 app 分组模型

Qoder 来源 MUST 合并 `/models` 返回的 `chat` 与 `app` 分组，按模型 key 去重并优先保留 `chat` 分组配置；只出现在 `app` 分组的真实模型（例如 `lmodel / QoDuck`）MUST 进入模型目录。系统 MUST 使用该模型的真实显示名、图片能力、思考档位、上下文与调用配置，MUST NOT 凭空添加服务商未返回的模型。

#### Scenario: 发现 QoDuck

- **WHEN** `chat` 分组没有 `lmodel`，而 `app` 分组返回 `lmodel / QoDuck`
- **THEN** QoDuck MUST 在模型目录中出现一次，并显示真实名称、图片能力、思考档位与上下文
- **AND** 该模型 MUST 使用返回的真实模型配置参与调用

#### Scenario: 两个分组重复同一模型

- **WHEN** `chat` 与 `app` 分组返回相同 key 的模型
- **THEN** 系统 MUST 只保留一个目录项
- **AND** `chat` 分组配置 MUST 优先，模型启停偏好在刷新后 MUST 保持

### Requirement: 独立订阅登录来源必须可删除并与托管登录分离

系统 MUST 允许删除拥有独立本机登录凭据的订阅模型来源，包括 Codex / ChatGPT 订阅、Devin、DeepSeek、Qoder 与 Qoder CN；删除 MUST 清理该来源的账号元数据、模型列表、启用偏好和本机登录凭据。由智能体连接托管登录的 ChatGPT、DSH 来源仍由“智能体”页维护，模型页 MUST NOT 删除其账号或登录。删除 Qoder 或 Qoder CN 等与智能体连接共享的登录来源时，MUST 清理唯一登录来源并使对应连接显示未登录，MUST NOT 保留一份可继续使用的旧凭据。界面 MUST 在删除前说明影响并要求确认。

#### Scenario: 删除独立订阅来源

- **WHEN** 用户确认删除独立登录的 Codex / ChatGPT 订阅、Devin 或 DeepSeek 来源
- **THEN** 系统 MUST 移除该来源的账号与模型目录并清理本机登录凭据
- **AND** 其他订阅来源与 API Key 来源 MUST 保持可用

#### Scenario: 不删除智能体托管登录

- **WHEN** 用户尝试从模型页删除由 Codex 或 DSH 智能体连接托管的来源
- **THEN** 系统 MUST 拒绝并指引到“智能体”页
- **AND** 对应智能体程序、登录状态和可执行模型 MUST NOT 被修改

#### Scenario: 删除共享的 Qoder CN 登录

- **WHEN** 用户确认删除 Qoder CN 模型来源
- **THEN** 系统 MUST 清理该共享登录并使 Qoder CN 智能体连接显示未登录
- **AND** MUST NOT 继续保留可用的旧凭据或自动重建空账号

#### Scenario: 删除共享的 Qoder 登录

- **WHEN** 用户确认删除 Qoder 模型来源
- **THEN** 系统 MUST 清理该共享登录并使 Qoder 智能体连接显示未登录
- **AND** MUST NOT 继续保留可用的旧凭据或自动重建空账号

### Requirement: 智能体托管登录必须支持退出登录

由 Codex 或 DSH 智能体连接托管登录的模型来源 MUST 在模型设置中提供“退出登录”，并与普通供应商的“断开供应商”区分。退出登录 MUST 要求确认，MUST 断开对应智能体连接、关闭其运行时并撤销该来源的模型租约，使来源回到未登录状态。退出登录 MUST NOT 删除对话、历史消息或服务商账号；仍引用该来源的对话 MUST 保留，并在下一次发送前要求重新登录或选择其他模型。

#### Scenario: 退出托管订阅登录

- **WHEN** 用户对 Codex / ChatGPT 或 DSH 托管来源确认“退出登录”
- **THEN** 系统 MUST 断开对应智能体连接并使该模型来源不可用
- **AND** 对话与其他供应商 MUST 保持不变

#### Scenario: 退出后重新登录

- **WHEN** 用户退出托管登录后希望继续使用该订阅
- **THEN** 系统 MUST 允许用户从该来源或“智能体”页重新发起登录
- **AND** MUST NOT 自动复用退出前的运行时或租约

### Requirement: 模型来源共享范围与推理方式必须由来源声明

每个模型来源 MUST 声明共享范围与推理方式：共享范围默认可经本机模型网关供兼容执行方使用，也可声明仅供指定执行方原生使用并给出面向用户的原因；推理方式默认提供网关推理，也可声明不提供。账号与模型目录视图 MUST 公开来源品牌名称与官方账号或账单入口说明。仅供指定执行方使用的来源 MUST NOT 向其他执行方签发模型网关租约；不提供网关推理的来源 MUST NOT 被签发租约，也 MUST NOT 被单次生成或网关入口选用。

#### Scenario: 来源仅供指定执行方使用
- **WHEN** 某来源声明仅供执行方 A 原生使用，执行方 B 请求使用该来源
- **THEN** 服务端 MUST 在副作用前拒绝并返回来源声明的原因，MUST NOT 为执行方 B 签发该来源的网关租约

#### Scenario: 不提供网关推理的来源
- **WHEN** 标题生成等单次生成或网关入口尝试选择不提供网关推理的来源
- **THEN** 系统 MUST 拒绝且不产生上游请求，并保留其他可用来源的选择

#### Scenario: 来源品牌与额度入口文案
- **WHEN** 账号卡片展示 API Key 说明、额度不可读说明或官方账单入口
- **THEN** 显示的厂商名称与入口文案 MUST 来自来源声明，MUST NOT 把非 OpenAI 来源显示为 OpenAI 账单

### Requirement: 静态兼容与发送时可用性必须分别判定

系统 MUST 区分静态兼容与发送时可用性。静态兼容只依据执行方声明与来源声明判定，服务端 MUST 以唯一判定在账号视图公开每个执行方的兼容结论、原因码与原因；前端 MUST 依据该结论把不兼容来源的模型标为不可选并保留真实名称与原因，MUST NOT 依据品牌标识另行放行或拒绝。该字段缺失时前端 MUST 按原有行为显示，最终以服务端发送校验为准。发送时可用性（账号登录与过期、来源启用、身份变化、模型启用、思考深度与服务档位）MUST 由服务端在工作输入副作用前实时校验，并按固定顺序返回第一个失败原因；静态兼容一致的承诺 MUST NOT 被解释为发送一定成功。界面兼容提示 MUST NOT 改写账号模型偏好或静默切换付费来源。

#### Scenario: 前后端静态兼容一致
- **WHEN** 同一执行方与来源组合分别经前端模型选择与服务端发送校验判定静态兼容
- **THEN** 两处 MUST 得出相同的兼容结论与原因码

#### Scenario: 兼容但发送时不可用
- **WHEN** 来源对执行方静态兼容，但账号在发送时已过期或所选模型已停用
- **THEN** 服务端 MUST 在副作用前拒绝并返回对应的过期或停用原因，保留草稿与选择，MUST NOT 返回不兼容原因

#### Scenario: 原生账号就绪时不被旧连接观察先行拒绝
- **WHEN** Qoder 或 Qoder CN 所选原生账号来源当前已就绪，而连接保存的旧观察仍显示过期或未登录
- **THEN** 发送校验 MUST NOT 以旧连接观察先行拒绝，并继续由原生执行在输入前核对实际登录

#### Scenario: 兼容字段缺失
- **WHEN** 前端读取的账号视图没有静态兼容字段
- **THEN** 前端 MUST 按升级前行为展示可选项，发送结果以服务端校验为准
