## ADDED Requirements

### Requirement: 首次 prepare 必须显式登记当前宿主
Task Environment Application MUST只把调用方给出的受支持adapter登记为Environment `controller.adapter`。首次prepare缺少adapter时 MUST fail closed，且 MUST NOT默认为`codex`、`cursor`或任何其他runtime。已有matching current时 MUST继续使用Receipt登记的adapter；调用方传入的adapter与登记值不一致时 MUST保持既有mismatch并零写入新宿主。Application MUST NOT根据进程、会话、runtime文件或PATH探测当前宿主。

#### Scenario: 首次 prepare 写出当前宿主
- **WHEN** 尚无Environment Receipt的active Task首次prepare，且调用方提供受支持adapter例如`cursor`
- **THEN** Receipt MUST把`controller.adapter`登记为该值
- **AND** MUST NOT改写为`codex`或其他默认宿主

#### Scenario: 首次 prepare 缺少 adapter
- **WHEN** 尚无Environment Receipt的active Task被prepare，且Application未收到adapter
- **THEN** Application MUST在创建Receipt、checkout或执行Preparation Step前fail closed
- **AND** MUST NOT把adapter写成`codex`或其他默认值

#### Scenario: 恢复时 adapter 必须匹配登记值
- **WHEN** matching current已登记`controller.adapter`为`cursor`，调用方再次prepare并传入`codex`
- **THEN** Application MUST返回既有manager/adapter mismatch
- **AND** MUST NOT把Receipt改写为`codex`或继续按错误宿主准备

#### Scenario: 恢复时沿用已登记 adapter
- **WHEN** matching current已登记adapter，调用方prepare传入同一adapter
- **THEN** Application MUST从同一环境恢复
- **AND** MUST NOT因缺少产品默认值而改写已登记宿主

### Requirement: Git 任务分支默认前缀必须跟随实际 adapter
首次为Git工作范围准备worktree且调用方未提供`--branch`时，Task Environment MUST使用`` `${adapter}/${taskId}` ``作为默认任务分支，其中`adapter`是本次prepare实际采用的受支持adapter。显式`--branch` MUST优先于该默认值。恢复 MUST继续匹配已保存Git provider evidence中的branch，不得因adapter名称或新产品默认前缀改写已有分支。

#### Scenario: Cursor 首次 prepare 省略 --branch
- **WHEN** 首次Git prepare的adapter为`cursor`且调用方未提供`--branch`
- **THEN** provider plan MUST使用`cursor/<task-id>`
- **AND** MUST NOT创建或要求`codex/<task-id>`

#### Scenario: Codex 首次 prepare 省略 --branch
- **WHEN** 首次Git prepare的adapter为`codex`且调用方未提供`--branch`
- **THEN** provider plan MUST使用`codex/<task-id>`

#### Scenario: 显式 --branch 优先
- **WHEN** 首次Git prepare同时提供受支持`--agent`与显式`--branch`
- **THEN** provider plan MUST使用该`--branch`
- **AND** MUST NOT再拼接adapter前缀覆盖调用方给出的分支

#### Scenario: 恢复必须匹配已保存分支
- **WHEN** Git provider evidence已记录分支，调用方再次prepare并传入不同`--branch`
- **THEN** Application MUST返回既有plan mismatch
- **AND** MUST NOT按新的adapter默认前缀重命名或重建分支
