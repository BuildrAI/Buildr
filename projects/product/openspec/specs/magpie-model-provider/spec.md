# magpie-model-provider Specification

## Purpose
定义 Buildr 中 Magpie 作为本机模型供应商的接入、准备、绑定与模型来源展示边界。使用户可以复用或准备网关、在兼容的执行方中准确选择模型，同时保留外部实例与账号的管理权。

## Requirements

### Requirement: Magpie 作为独立模型来源

Buildr SHALL 提供内置 Magpie 模型供应商。连接时 MUST 校验本机网关身份，支持默认端口、可观察的端口设置及用户明确输入的本机地址。Buildr MUST 读取已绑定网关的模型目录并保留实际上游模型标识，不静默替换或切换来源。断开或移除仅解除 Buildr 模型绑定，不管理 Magpie 上游账号或接管外部实例。

#### Scenario: 连接已有实例
- **WHEN** 用户连接一个有效的已运行本机 Magpie
- **THEN** 系统 MUST 复用该实例并读取其模型目录，不另行安装或启动

#### Scenario: 默认端口被非 Magpie 占用
- **WHEN** 候选本机端口无法核验 Magpie 身份
- **THEN** 系统 MUST NOT 将其作为 Magpie 使用或停止占用端口的进程

### Requirement: 用户按需准备 Magpie

未发现有效实例时，系统 SHALL 允许用户明确请求准备并启动受管 Magpie。系统 MUST 校验官方发行物，使用隔离的用户目录并仅在本机启动；不得写入外部 Magpie 配置、导入凭据或设置开机启动。模型目录为空时 MUST 区分网关可达但尚无模型，提供进入 Magpie 管理界面的方式。

#### Scenario: 已安装包可复用
- **WHEN** 用户明确请求下载并启动且受管程序已经安装
- **THEN** 系统 MUST 核验并复用本机安装，不重复下载

### Requirement: 模型选择器区分 Magpie 来源

对话与执行模型选择器 SHALL 将来自 Magpie 的模型按其上游供应商分组展示，分组名称 MUST 为 `<上游供应商> · Magpie`（当上游供应商未提供或即为 Magpie 本身时保持 `Magpie`），并以 `模型名 · Magpie` 显示 Magpie 模型，不更改其他供应商模型的标签与分组。模型选项 MUST 保持原有的账号与模型绑定标识，系统 MUST NOT 将不明路由与账号的额度展示为某个模型的确定额度。

#### Scenario: 与直连同名
- **WHEN** Magpie 与其他供应商提供同名模型
- **THEN** 两个选项 MUST 保持各自绑定，且仅 Magpie 的模型名后有 ` · Magpie`

#### Scenario: 按上游供应商分组展示
- **WHEN** Magpie 目录同时包含来自 `codex`、`grok` 与 `qoder` 的模型
- **THEN** 模型选择器 MUST 分别以 `Codex · Magpie`、`Grok · Magpie` 与 `Qoder · Magpie` 分组列出对应模型，快捷定位栏使用一致分组名称
- **AND** 未声明具体上游或上游即为 `magpie` 的模型保持归入 `Magpie` 分组，不拼接重复后缀

### Requirement: Magpie 上游账号额度独立展示

Buildr SHALL 在已绑定的 Magpie 来源详情及全局供应商额度浮窗中按上游供应商和账号展示额度观察。详情页 MUST 将不同上游供应商区分为独立卡片并由供应商刷新入口同步重读额度，浮窗 MUST 将全部 Magpie 上游分组与读取状态集中在末尾的 `Magpie` 区块内，按上游供应商显示名称稳定排序，且不得显示上游账号掩码或邮箱；同一上游包含多个账号时用编号区分，保留可用的套餐标识；两者 MUST 保留上游余额单位、窗口、重置及观察时间，剩余百分比 MUST 最多保留两位小数且不补多余尾随零，不合计不同账号的额度，不推断下一轮的路由、份额或费用。读取只使用当前绑定的本机 Magpie 公开接口，MUST NOT 暴露凭据、原始响应体或完整邮箱到目录与日志。读取失败、空结果和缺失字段 MUST 分开表达，不将缺少的值填成零。模型选择和请求授权 MUST NOT 依赖该观察。

#### Scenario: 同一个供应商下有两个帐号
- **WHEN** Magpie 对同一上游供应商报告两个账号和各自的额度窗口
- **THEN** Buildr MUST 在详情卡片与额度浮窗中均按对应上游分组分别显示两个账号与各自的额度，不合计、不挂到模型选择器

#### Scenario: Magpie 与直连供应商并存
- **WHEN** 浮窗同时显示直连 Qoder 与 Magpie 的 Grok、Qoder 额度
- **THEN** 直连 Qoder MUST 留在普通供应商列表，Magpie 的 Grok 和 Qoder MUST 集中显示在浮窗底部同一区块，且不显示账号掩码

#### Scenario: 额度暂不可读取
- **WHEN** Magpie 额度接口拒绝、失败或没有观察
- **THEN** Buildr MUST 明确说明读取状态，原模型选择与可用性不因额度读取变化

#### Scenario: 小数百分比格式化
- **WHEN** 上游额度窗口返回整数百分比（如 `99`）或多位小数百分比（如 `50.91575091575091`）
- **THEN** 界面 MUST 分别展示为 `剩余 99%` 与 `剩余 50.92%`，最多保留两位小数

### Requirement: Magpie 模型上下文默认值与配置上限分别判断

Buildr SHALL 区分 Magpie 模型的目录默认窗口、明确最大窗口、用户配置和执行生效值，不按模型名判断上限。仅有默认窗口或没有窗口信息时 MUST 表达最大值未知，并允许用户在 Buildr 的输入范围内手动覆盖，不将其表述为上游已验证能力。Magpie 明确报告最大窗口时 MUST 继续校验新配置并限制生效值。刷新 MUST 保留用户配置；恢复默认 MUST 清除覆盖并恢复目录默认值。其他来源 MAY 保持自身既有默认和上限策略。

#### Scenario: 使用较大的 GPT‑6.2 窗口
- **WHEN** Magpie 对 GPT‑6.2 Sol 或 Astra 只报告默认窗口且用户配置 800K
- **THEN** 系统 MUST 允许保存；恢复默认分别回到 500K 或 272K

#### Scenario: 目录只报告默认窗口
- **WHEN** Magpie 对任意模型报告默认 500K 但未报告明确最大窗口，用户配置 800K
- **THEN** Buildr MUST 保存 800K 并用于新的执行窗口配置，明示上限未知；重置后恢复 500K

#### Scenario: 网关显式限制优先
- **WHEN** 已配置 800K 的模型后来明确报告 600K 最大窗口
- **THEN** Buildr MUST 保留 800K 偏好但将生效值限制到 600K，拒绝新的超限输入

### Requirement: Magpie 模型列表按上游筛选与系列归一

模型管理页面 SHALL 为包含多种上游供应商的 Magpie 目录提供按 Magpie 上游供应商筛选的入口，并与关键词搜索、启用状态、模型系列筛选及批量启停联动；未包含版本或变体标识的独立模型名 MUST 归入 `其他` 系列，不得各自形成单模型系列；同一品牌前缀带不同主版本号的命名（如 `Qwen4-Max` 与 `Qwen3.8-Max`）MUST 归入同一系列。批量启停按钮在匹配当前筛选结果时保持简洁标签 `全部开启` 与 `全部关闭`。

#### Scenario: 单体命名不单独成组且按供应商过滤
- **WHEN** Magpie 模型列表包含 `Ultimate`、`Fast`、`Qwen4-Max`、`Qwen3.8-Flash` 等模型
- **THEN** 系列下拉列表中不包含 `Ultimate` 或 `Fast`，`Qwen4-Max` 与 `Qwen3.8-Flash` 同属 `Qwen` 系列
- **AND** 选择特定 Magpie 上游供应商时仅展示该上游的模型，点击批量启停只作用于当前筛选结果
