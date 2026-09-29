## MODIFIED Requirements

### Requirement: 自举 CLI 刷新必须使用已验证 runtime identity
Buildr 自举激活 MUST 通过唯一 `buildr-self-bootstrap-sync` 执行器，用明确且受支持的 retained Node 验证本次已交付保留检出目录（Retained Checkout）的 `projects/product/buildr` 开发入口、适用的开发启动器（Launcher）及最终工作空间（Workspace）诊断。PATH 中默认 `buildr` MUST 保持 npm 安装的归属；开发检出目录 MUST NOT 创建、覆盖或要求默认入口绑定源码。激活 MUST 依据真实基线、交付提交、分支和远端，不依赖已退役的 Finish run 或环境回执。

#### Scenario: Retained runtime 可用
- **WHEN** 已交付检出目录与受支持 Node 的身份可验证
- **THEN** 唯一执行器 MUST 显式调用该检出目录的开发入口并核验同一 Node 和源身份
- **AND** MUST 保持默认 npm CLI 不变，并以最终 Doctor ready 证明本次激活成功

#### Scenario: 既有 managed 入口迁移
- **WHEN** 本机存在属于旧开发安装的入口或其他归属的默认入口
- **THEN** 自举激活 MUST NOT 将它迁移或覆盖为当前源码入口
- **AND** 需要安装修复时 MUST 由相应安装能力核对真实归属和授权后处理

#### Scenario: Retained runtime 不满足最低版本
- **WHEN** 明确的 Node 版本不受支持或不可执行
- **THEN** 执行器 MUST 在相关激活动作前停止并报告可复核原因
- **AND** MUST NOT 从 PATH 随机换用另一个 Node 继续

#### Scenario: 自举收尾恢复闭环
- **WHEN** 已交付成果的自举激活需要恢复
- **THEN** MUST 以同一真实交付输入交给唯一执行器重新核对并恢复相关动作
- **AND** MUST 保留已成立的交付，不要求旧 Finish resume 或补造任务状态
