## Context

当前模型：`local.backend` 是单个 `{serviceCode, environmentVariable, remoteUrl}` 声明；`connection` 输入为 `local|remote`，本地模式要求同范围（任务↔同任务非主库、主库↔主库无任务）唯一已就绪实例；运行记录保存单个 `connection`；启动时按声明变量注入一个 URL。对话框以「本地后端 / 远程测试环境」二选一呈现，本地不可用时禁用并显示原因。`type` 字段已存在于服务登记与资产契约（用户工作空间实际使用 `frontend`/`backend`/`library`/`service`），但编辑抽屉与运行视图未消费。

## Goals / Non-Goals

**Goals:**

- 声明层从单后端到多后端：每个声明后端独立解析目标、独立注入自己的环境变量。
- 候选层从「唯一自动解析」到「实例级显式候选」：列出声明后端当前全部已就绪实例（含跨范围，标注来源），用户可逐个后端选择默认自动、指定实例或远程。
- 校验层保留现有不变量：所选实例必须属于对应声明后端、仍就绪且进程身份有效；切换在停止原运行前由服务端重验，失败保留原运行。
- 视图层按服务 `type` 裁剪「打开」入口；目录浮层可读。

**Non-Goals:**

- 本地服务间连接（后端再调本地其他服务）：已评估为后续方向，另起任务；本变更只为它准备好「声明列表化、逐声明注入」的结构基础。
- 本地注册中心、泳道路由、完整本地环境。
- 远程目标任意输入、注入认证与密钥。
- 任务启动对话框内逐实例选择（任务组合沿用全局 `local|remote` 语义，逐实例选择在单服务对话框提供）。

## Decisions

### 声明结构：`local.backends` 列表，`local.backend` 兼容

定义解析把 `local.backend`（单对象）与 `local.backends`（数组）都归一成列表；同列表内 `serviceCode` 与 `environmentVariable` 必须唯一；`backend` 与 `backends` 同时出现视为重复声明并拒绝。渲染统一输出 `backends` 数组（单元素也保持列表形态），避免双形态写入。

备选：直接复用 `backend` 字段放数组——会让旧客户端把数组误读成单对象，静默解析失败，拒绝。

### 目标解析顺序（每个声明后端独立）

1. 显式 `backendTargets` 中该后端的 `runId`：必须是该声明后端服务的、运行中且进程身份有效的实例，否则返回 `service_runtime_backend_changed`。
2. 显式该后端 `remote` 或全局 `connection: remote`：使用 `remoteUrl`。
3. 全局 `connection: local`（含 CLI/Agent 路径）：同范围唯一就绪实例，零个或多个仍按既有语义报错。
4. 未指定模式：`auto`——同范围唯一就绪实例优先，否则 `remoteUrl`；主工作库默认 remote、任务目录默认 local 的既有默认值语义并入 auto。

`expectedBackendRunId` 保留兼容：映射为所属声明后端的显式实例目标。新输入 `backendTargets` 为 `[{serviceCode, target: 'auto'|'remote'|'run', runId?}]`，未列出的声明后端按全局 `connection`/`auto` 规则解析。

备选：直接把 `connection` 改成逐后端对象——破坏现有 `local|remote` 调用面，拒绝；保留全局模式为默认规则、逐后端目标为可选覆盖，是兼容扩展。

### 运行记录：`connection` → `connections`

记录保存逐后端实际连接 `[{serviceCode, mode, url, runId}]`；读取时把旧单 `connection` 归一为单元素列表。页面按列表展示每个后端的实际目标；「打开前端」汇总条仍取有连接且有可访问地址的运行。

### 视图与候选数据

`ServiceRuntimeSummary` 增加 `type`（来自服务登记，零迁移透传）。「打开」按钮仅 `type === 'frontend'` 显示；其他类型保留只读地址文本。

`connectionTargets` 由「唯一 target + reason」改为按声明后端分组的候选结构：每项含 `serviceCode`、`remoteUrl`、当前全部已就绪实例（runId、来源标签、分支、地址、是否同范围）及按解析顺序得到的默认目标。服务端不做跨范围禁止——显式选择即授权；同范围候选排在前面并在 UI 标注。

备选：只列同范围实例——无法覆盖「主工作库前端连任务后端」这类真实需求，且多个实例同范围时仍是死路，拒绝。

### 对话框信息层级

启动/切换对话框按声明后端分组：组头为后端服务名与注入变量，组内候选为「默认（自动）/ 各已就绪实例（来源+分支+地址）/ 远程测试环境（固定地址）」单选。顶部大块告警替换为标题下一行小字：影响的实例编号、端口与「校验未通过保留当前运行」。

### 服务类型登记

编辑抽屉新增「服务类型」输入，只提供 `frontend`/`backend` 两种值（界面显示「前端」「后端」，产品语义收窄，不沿用 schema 的自由文本能力）；创建抽屉必选其一。冲突对照区补 `type` 字段展示。既有其他取值保持可读并在保存中原样保留，界面不显示类型标签。

### 目录浮层

`ServiceRuntimeStatusCell` 浮层改为带边框卡片：区块标题 + 每条实例一行（来源、端口、状态）+ 次级信息（分支、时间）+ 明细入口，使用 overlayClassName 限定样式作用域。

## Risks / Trade-offs

- 跨范围显式可选放宽了「同范围唯一」保护 → 所选实例编号即观察令牌，服务端按声明后端归属与存活重验，错误选择止步于校验；同范围候选前置降低误选成本。
- `auto` 在无本地实例时回落远程，可能比旧「local 缺失即拒绝」更宽松 → auto 的回落目标在界面原文展示（「默认（自动：同范围就绪实例，否则远程）」），strict `local` 语义为 CLI/Agent 保留。
- `backends` 归一渲染改变用户文件形态 → 渲染器只由受控写入路径使用，Agent 手工编辑的旧单对象格式仍可读。
- 多后端任一目标失效 → 逐项解析逐项报错，错误信息指明具体后端服务，其余连接不掩盖该失败。
- 注入多个环境变量与旧客户端单连接展示 → 记录兼容归一；旧客户端只看 `connection` 字段时会漏看新增——运行记录同时保留首个连接的 `connection` 兼容字段（见迁移）。

## Migration Plan

- `runtime.yml`：无需迁移，`backend` 持续可读；Agent 下次验证保存时可自然升级为 `backends`。
- 运行记录：读取归一；新记录写 `connections` 并同步写首连接的 `connection` 字段，使旧读取方不丢事实。
- API：`connection`、`expectedBackendRunId` 继续接受；`backendTargets` 为新增可选输入；`connectionTargets` 响应结构变化——同版本内实现与唯一前端同步更新，对外 CLI JSON 结构在技能文档注明。
