# agent-task-workflows 变更

## MODIFIED Requirements

### Requirement: 开发收尾必须消费明确的远端清理政策
任务级临时引用（如任务分支（Branch））的远端生命周期全程受明确授权约束：智能体（Agent）MUST NOT在没有用户指令、任务声明交付方式或适用于该仓库的持续授权时把任务分支推送到远端，通用“收尾”指令本身 MUST NOT被解释为远端任务引用的创建或删除授权。授权推送任务引用时 MUST 同时确定其生命周期处置，默认随用途结束删除。交付后收尾技能（Skill）MUST核对任务范围内每个仓库是否存在本任务远端引用，只在删除授权覆盖且归属、交付保全与无活动用途均证明时按实时观察提交条件删除；删除不可得时 MUST逐项报告保留原因，不得静默残留。仓库自行声明的常驻引用 MUST保留；发布引用由发布能力按绑定政策处理。

#### Scenario: 无授权的远端创建
- **WHEN** 任务分支没有用户指令、任务声明交付方式或仓库持续授权覆盖远端创建
- **THEN** 智能体（Agent）MUST NOT推送该任务分支到远端或为完成收尾上传它
- **AND** 获得推送授权时 MUST 同时记录该引用的生命周期处置

#### Scenario: 交付后枚举本任务远端引用
- **WHEN** 交付核验完成且任务范围包含仓库集合
- **THEN** 收尾 MUST对每个仓库以任务分支名查询实际远端，不依赖当次会话记忆
- **AND** 仓库声明的常驻引用 MUST保留，不作为处置对象

#### Scenario: 直接交付开发主线
- **WHEN** 任务未经过合并请求（Pull Request），已完成直接交付且仓库政策授权清理本任务临时引用
- **THEN** 智能体（Agent）MUST核对精确归属、交付保全、无活动用途和实时提交后条件删除并回读
- **AND** MUST不把GitHub合并后自动删除设置当作已经完成清理的证据

#### Scenario: 合并后自动删除
- **WHEN** GitHub已删除合并请求（Pull Request）的临时引用
- **THEN** 收尾 MUST核对实际合并与远端不存在并复用该事实，不重建或重复删除

#### Scenario: 保留必要工作和报告残留
- **WHEN** 引用有未交付内容、开放合并请求（Pull Request）、未结束运行、漂移、归属未知或删除授权未覆盖
- **THEN** 收尾 MUST保留相关对象并逐项说明原因，授权缺失时向用户提出最小授权问题或如实说明未决残留，继续其他安全工作
- **AND** MUST分别说明已删除、已不存在和仍保留项，不以任务完成或笼统cleaned替代远端观察

## ADDED Requirements

### Requirement: Git Operations 条件删除远端引用
selected `buildr.git-operations/v1` provider MUST 支持 consumer 明确选定的 `delete-remote-ref` 操作（Operation）：consumer 提供实际 repository、remote、精确 ref、已观察远端提交与允许的远端 effect；provider MUST 在写远端前核对实际远端 tip 仍等于已观察提交，只删除该引用并回读确认。

#### Scenario: 按观察提交删除
- **WHEN** consumer 提供明确授权、精确 remote/ref 与已观察远端提交，且实际远端 tip 仍匹配
- **THEN** provider MUST 只删除该引用并回读远端确认不存在
- **AND** MUST NOT 删除其他引用、改用无条件删除或扩大授权范围

#### Scenario: 远端漂移或不可观察
- **WHEN** 删除前实际远端 tip 与已观察提交不一致、远端无法可靠观察或归属不明
- **THEN** provider MUST 在远端零写入状态返回 `blocked`
- **AND** MUST 保留已发生的其他独立 Result
