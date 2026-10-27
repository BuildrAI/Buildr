# preview-environment-reuse Specification

## Purpose

让验证环境（Preview）能够显式、可选择地沿用开发版的应用数据与环境事实，同时保持会话隔离、来源只读、失败局部化和收尾可彻底清理。

## ADDED Requirements

### Requirement: 显式环境沿用与来源选择

预览启动 MUST 支持显式参数 `--reuse <profile>[:facet,…]` 选择沿用来源与 facet。未提供该参数时，预览 MUST 保持当前完全隔离行为。首版 MUST 接受来源 `development`；来源无法解析、facet 未知或参数格式无效时，启动 MUST 在写入任何复用内容前失败关闭，并报告可核对的诊断。

#### Scenario: 显式沿用开发版
- **WHEN** 调用方以 `--reuse development` 启动预览
- **THEN** 启动 MUST 解析开发版应用数据根并应用该来源的默认 facet 集合
- **AND** 启动结果 MUST 报告实际来源与 facet

#### Scenario: 未指定沿用
- **WHEN** 调用方启动预览且未提供 `--reuse`
- **THEN** 预览 MUST 不读取或复制开发版应用数据，行为与既有隔离预览一致

#### Scenario: 来源或 facet 无效
- **WHEN** 调用方提供未知来源或未知 facet
- **THEN** 启动 MUST 在创建复用副本前失败关闭并报告具体参数

### Requirement: Facet 写入边界与来源只读

每个 facet MUST 声明来源、目标范围、归属路径、排除项、敏感级别与刷新行为。facet 的所有写入 MUST 限定在预览实例根或本次预览明确声明的 Workspace 范围内；来源应用数据 MUST 只读。facet 归属路径之外由预览自身生成的状态 MUST 在播种、复用与刷新时保持。

#### Scenario: 播种不触碰来源
- **WHEN** 预览从开发版沿用环境事实
- **THEN** 开发版数据根中的账号、配置、程序与会话文件 MUST 保持未修改
- **AND** 写入 MUST 仅出现在预览实例根内

#### Scenario: 刷新保留预览自身状态
- **WHEN** 使用 `--refresh-reuse` 刷新 facet 归属内容
- **THEN** facet 归属路径之外由预览生成的会话、附件、草稿与登记 MUST 保持

### Requirement: 模型目录沿用

`model-catalog` facet MUST 沿用模型账号记录、缓存模型目录与启用偏好，使预览模型目录反映开发版已启用的模型并排除未启用模型。该 facet MUST NOT 承诺真实模型调用，且 MUST NOT 复制 provider 程序或预览本地会话。

#### Scenario: 预览可见开发版启用模型
- **WHEN** 预览以包含 `model-catalog` 的沿用声明启动
- **THEN** 预览模型目录 MUST 显示开发版启用的模型及其来源账号
- **AND** 开发版未启用的模型 MUST 不出现在可选择目录中

#### Scenario: 模型目录缺失时播种
- **WHEN** 预览实例尚无模型目录副本
- **THEN** 启动 MUST 从来源复制一份完整副本
- **AND** 来源后续变化 MUST NOT 自动改写该副本

### Requirement: 智能体运行时沿用

`agent-runtime` facet MUST 包含 `model-catalog` 的沿用结果，并 MUST 沿用所选连接的 provider 登录配置与所需已安装程序，在预览实例根内重建连接绑定，使预览能够真实执行智能体（Agent）。重建后的预览连接状态 MUST NOT 持久化来源数据根的绝对路径。该 facet MUST NOT 复制开发版会话、附件、交接材料或模型运行缓存。

#### Scenario: 预览真实执行一次智能体（Agent）
- **WHEN** 预览以 `--reuse development:agent-runtime` 启动且沿用成功
- **THEN** 预览使用复制到实例根的登录配置与程序完成一次智能体执行
- **AND** 执行写入的会话与运行缓存 MUST 只出现在预览实例根内

#### Scenario: 运行时沿用失败
- **WHEN** provider 登录配置、程序或连接绑定无法在预览内重建
- **THEN** 启动 MUST 继续并报告该 facet 的失败诊断
- **AND** 其他已成功 facet 与预览隔离状态 MUST 保持可用
- **AND** MUST NOT 回退为共享来源绝对路径

### Requirement: 会话与运行数据隔离

预览会话、消息、请求、附件、交接材料与模型运行缓存 MUST 由预览本地创建。开发版与预览的会话 MUST 双向不可见；预览执行 MUST NOT 修改开发版交互库或附件目录。

#### Scenario: 双向会话不可见
- **WHEN** 开发版与预览均存在会话
- **THEN** 任一环境 MUST NOT 列出或读取另一环境的会话与附件

#### Scenario: 预览运行不写入开发版
- **WHEN** 预览完成一次智能体执行或刷新模型目录
- **THEN** 开发版交互库、附件与交接材料 MUST 保持未修改

### Requirement: 缺失播种、复用与显式刷新

首次启动 MUST 在目标副本缺失时播种。已有副本 MUST 在后续启动中复用且 MUST NOT 被静默覆盖。`--refresh-reuse` MUST 从来源重新复制 facet 归属内容并以原子替换生效；刷新失败 MUST 保留上一次可用副本并报告诊断。

#### Scenario: 重启复用已有副本
- **WHEN** 同一预览实例已有沿用的 facet 副本并再次启动
- **THEN** 启动 MUST 复用已有副本
- **AND** MUST NOT 用来源当前内容覆盖

#### Scenario: 显式刷新
- **WHEN** 调用方以 `--refresh-reuse` 启动已有预览
- **THEN** facet 归属内容 MUST 从来源重新复制并原子替换
- **AND** 结果 MUST 报告刷新时间与实际 facet

#### Scenario: 刷新失败保留旧副本
- **WHEN** 来源不可读或复制过程失败
- **THEN** 预览 MUST 保留上一次可用副本并报告失败诊断
- **AND** MUST NOT 留下部分写入的 facet 目录

### Requirement: 停止与彻底清理

`preview stop` MUST 默认只停止实例并保留数据。`preview stop --purge` MUST 在停止确认和 owner 身份匹配后删除该实例根，包括会话、附件、交接材料、沿用的账号与配置副本、程序副本、日志、登记与端口记录。owner 不匹配、实例停止未确认、目标路径不在预览根内或存在越界符号链接时，清理 MUST 拒绝并保留现场。

#### Scenario: 清理沿用过的预览
- **WHEN** 预览 owner 请求 `preview stop --purge` 且实例已确认停止
- **THEN** 该实例根 MUST 被删除
- **AND** 预览会话、凭证副本、程序副本与日志 MUST 不再存在

#### Scenario: 错误 owner 清理被拒绝
- **WHEN** 非 owner 调用方请求清理另一预览实例
- **THEN** 清理 MUST 拒绝并保持实例目录不变

#### Scenario: 停止未确认不清理
- **WHEN** 实例停止无法确认或目标路径越界
- **THEN** 清理 MUST 保留现场并报告具体原因

### Requirement: 沿用事实可观察且不泄露凭证

启动结果、预览列表与 owner/instance 记录 MUST 报告沿用来源、facet、播种或刷新时间以及逐 facet 结果；诊断 MUST 足以定位失败。日志、事件与界面 MUST NOT 暴露凭证内容、令牌或来源数据根的敏感路径细节。

#### Scenario: 列表显示沿用来源
- **WHEN** 调用方列出已沿用的预览实例
- **THEN** 结果 MUST 包含来源与 facet
- **AND** MUST NOT 包含凭证内容或令牌

#### Scenario: 失败诊断可定位
- **WHEN** 单个 facet 失败
- **THEN** 结果 MUST 报告失败 facet、阶段与原因摘要
- **AND** 其他 facet 的结果 MUST 分别保留

### Requirement: 兼容与失败影响隔离

未使用新参数的预览启动、列表、停止与既有 JSON 字段 MUST 保持兼容；新增事实 MUST 以可选字段出现。单个 facet、预览或来源失败 MUST 只影响相关对象，MUST NOT 阻止其他预览、来源读取或已成立交付。

#### Scenario: 旧调用方继续工作
- **WHEN** 既有调用方不传 `--reuse`、`--refresh-reuse` 或 `--purge`
- **THEN** 输出结构与行为 MUST 保持既有语义

#### Scenario: 一个预览沿用失败
- **WHEN** 一个预览实例的 facet 失败
- **THEN** 其他预览实例与默认 Buildr Web 实例 MUST 不受影响
