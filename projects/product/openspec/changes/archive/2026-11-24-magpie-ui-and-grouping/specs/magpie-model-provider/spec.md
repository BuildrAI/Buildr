## MODIFIED Requirements

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

Buildr SHALL 在已绑定的 Magpie 来源详情及全局供应商额度浮窗中按上游供应商和账号展示额度观察。详情页 MUST 将不同上游供应商区分为独立卡片并由供应商刷新入口同步重读额度，浮窗 MUST 以 `<上游供应商> · Magpie` 参与统一排序；两者 MUST 保留上游余额单位、窗口、重置及观察时间，剩余百分比 MUST 最多保留两位小数且不补多余尾随零，不合计不同账号的额度，不推断下一轮的路由、份额或费用。读取只使用当前绑定的本机 Magpie 公开接口，MUST NOT 暴露凭据、原始响应体或完整邮箱到目录与日志。读取失败、空结果和缺失字段 MUST 分开表达，不将缺少的值填成零。模型选择和请求授权 MUST NOT 依赖该观察。

#### Scenario: 同一个供应商下有两个帐号
- **WHEN** Magpie 对同一上游供应商报告两个账号和各自的额度窗口
- **THEN** Buildr MUST 在详情卡片与额度浮窗中均按对应上游分组分别显示两个账号与各自的额度，不合计、不挂到模型选择器

#### Scenario: 额度暂不可读取
- **WHEN** Magpie 额度接口拒绝、失败或没有观察
- **THEN** Buildr MUST 明确说明读取状态，原模型选择与可用性不因额度读取变化

#### Scenario: 小数百分比格式化
- **WHEN** 上游额度窗口返回整数百分比（如 `99`）或多位小数百分比（如 `50.91575091575091`）
- **THEN** 界面 MUST 分别展示为 `剩余 99%` 与 `剩余 50.92%`，最多保留两位小数

## ADDED Requirements

### Requirement: Magpie 模型列表按上游筛选与系列归一

模型管理页面 SHALL 为包含多种上游供应商的 Magpie 目录提供按 Magpie 上游供应商筛选的入口，并与关键词搜索、启用状态、模型系列筛选及批量启停联动；未包含版本或变体标识的独立模型名 MUST 归入 `其他` 系列，不得各自形成单模型系列；同一品牌前缀带不同主版本号的命名（如 `Qwen4-Max` 与 `Qwen3.8-Max`）MUST 归入同一系列。批量启停按钮在匹配当前筛选结果时保持简洁标签 `全部开启` 与 `全部关闭`。

#### Scenario: 单体命名不单独成组且按供应商过滤
- **WHEN** Magpie 模型列表包含 `Ultimate`、`Fast`、`Qwen4-Max`、`Qwen3.8-Flash` 等模型
- **THEN** 系列下拉列表中不包含 `Ultimate` 或 `Fast`，`Qwen4-Max` 与 `Qwen3.8-Flash` 同属 `Qwen` 系列
- **AND** 选择特定 Magpie 上游供应商时仅展示该上游的模型，点击批量启停只作用于当前筛选结果
