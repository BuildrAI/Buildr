# service-deployment-adapters Specification

## Purpose
TBD - created by archiving change add-service-runtime-deployment. Update Purpose after archive.

## Requirements

### Requirement: 部署适配器契约
Buildr MUST 通过连接技能（Connection Skill）声明的部署程序（Program）提交部署并查询最近结果：连接技能的槽位（Hook）限定只读效果，因此提交经 `connection-skill run` 调用运行定义（Runtime Definition）登记的部署程序，复用连接技能运行时的私有子进程通道与认证保护；归一化结果 MUST 至少包含状态（success、submitted、failed、unknown）、版本（分支@提交）、时间与外链。请求受理 MUST NOT 被解释为部署成功；状态为 unknown 时 Buildr MUST 保留未知并提示调查实际记录，MUST NOT 自动重试提交。

#### Scenario: 提交部署
WHEN 用户确认 QA 部署计划 THEN Buildr 经所选连接实例的部署程序提交请求，保存归一化最近结果与外链，并展示“已提交，构建中”状态。

#### Scenario: 未知结果不重试
WHEN 部署程序返回超时或未知状态 THEN Buildr 记录 unknown 与时间，提示到外部系统核对实际记录，MUST NOT 再次提交同一计划。

#### Scenario: 提供者缺失局部失败
WHEN 服务未登记连接实例或连接技能不可用 THEN 仅部署动作不可用并说明原因，本地运行、日志与其他页面功能 MUST 保持可用。

### Requirement: QA 部署确认与分支选择
Buildr Web MUST 以只读计划形式展示 QA 部署确认：服务目标与 targetRef、连接提供者、部署分支（默认登记集成分支（Integration Branch），可改选其他远端分支）、远端提交、本地 HEAD 与未提交改动告警、计划有效期。部署 MUST 只使用所选分支的远端提交；Buildr MUST NOT 提交或推送本地改动；确认后 MUST NOT 在 Buildr 内展示构建阶段、历史或远端日志，只提供外链。

#### Scenario: 默认集成分支
WHEN 用户打开 QA 部署确认抽屉 THEN 部署分支默认为该服务登记的集成分支，并标记“登记集成分支”。

#### Scenario: 改选远端分支
WHEN 用户改选其他远端分支 THEN 计划展示该分支的远端提交与本地检出对照；存在未提交改动时展示告警且说明不会进入本次部署。

#### Scenario: 不接管 CI/CD 页面
WHEN 部署已提交 THEN 服务页与目录只展示最近结果与打开外部系统链接，MUST NOT 渲染阶段进度、部署历史或远端日志。

### Requirement: 适配器契约随产品可发现
Buildr MUST 在随包 `connection-authoring` 技能中提供部署适配器编写指引，覆盖程序名称与动作、输入与归一化输出结构、秘密与日志边界、只读目标发现和未知结果语义，并包含可独立验证的成功、失败与未知样例；使用户工作空间的智能体创建 CI/CD 连接技能时能直接符合服务运行与部署契约。

#### Scenario: 用户工作空间新建连接技能
WHEN 用户工作空间的智能体按 connection-authoring 指引编写并登记部署适配器 THEN 该连接实例可用后，Buildr 服务运行与部署的 QA 提交与最近结果展示直接可用，MUST NOT 要求 Buildr 侧代码改动。

### Requirement: 提供者替换边界
部署适配器契约 MUST 与具体 CI/CD 平台无关：更换提供者只需新连接技能实现同一部署程序与归一化结果结构；Buildr 的运行模型、页面与运行定义 MUST NOT 因更换提供者而重写。环境集合首期只预置 local 与 qa；生产、回归、Ops 等环境 MUST 由用户在工作空间自行定义后接入，Buildr MUST NOT 预置平台专有环境。

#### Scenario: 换用其他 CI/CD
WHEN 工作空间为同一服务登记实现同一契约的其他连接技能 THEN QA 部署确认与最近结果展示保持不变，仅提供者名称与外链变化。

#### Scenario: 用户自定义环境
WHEN 用户在工作空间登记新环境目标 THEN 目录状态列 MUST 将该环境纳入同一“运行与部署”字段的数据展示（主环境行或浮窗明细），MUST NOT 要求修改表格列或页面结构。
