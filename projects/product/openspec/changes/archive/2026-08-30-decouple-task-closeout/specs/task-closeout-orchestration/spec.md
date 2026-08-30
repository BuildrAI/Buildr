

## REMOVED Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Runner 必须保持阶段authority与部分成功事实
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Runner 必须可从可重算事实幂等恢复
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Task Finish 调用必须使用有界长等待至终态
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Runner 必须为并存 Finish carrier 生成 owner-ordered 恢复计划
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: foreign-clear 自举重试必须有界承接同 run target-race
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 已放弃且未交付的 foreign carrier 必须给出 occupancy 释放命令
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 其他非 cleanup_pending 外载体仍须人工审查
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Self-bootstrap activation 必须复用 Task Finish target lease
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Runner 必须在 activation 副作用前有界收敛 latest target
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Self-bootstrap remote readback 必须有限重试且不重复 push
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Self-bootstrap发布关联必须保持Activation单一authority
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: self-bootstrap runner 必须提供 durable compact terminal readback
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Agent-reviewed Delivery Adaptation 必须覆盖全部 Task Contribution 路径
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Delivery path coverage proof 必须贯穿交付与清理
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Finish carrier 清理事实必须绑定物理删除
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Structured Store migration 必须在最终Doctor前由Activation写入
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 已交付历史run必须支持owner-bound恢复
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。
