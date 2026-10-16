## MODIFIED Requirements

### Requirement: Windows高成本候选必须按失败恢复边界分片
候选检查（Candidate Verification）MUST 区分通用行为主证明与真实操作系统差异。Windows MUST 仅默认执行实际命令启动、文件系统、平台启动器、进程及最终包消费边界；通用任务、工作目录、发布状态及恢复规则 SHALL 在主证明平台完整检查并消费有效本机结果，MUST NOT 仅因 Windows 名称、条件分支或更长超时重复整组业务检查。

#### Scenario: 通用检查已有有效证明
- **WHEN** 本机通用源码检查完整通过且与冻结输入匹配
- **THEN** 候选 SHALL 保留对应覆盖并复用结果，无须在 Windows 重复相同业务矩阵
- **AND** 本机入口 MUST 覆盖原先仅在 Windows 分片中执行的通用必需检查

#### Scenario: 实际平台边界需要证明
- **WHEN** 检查依赖真实 Windows 命令、路径、目录链接、快捷方式或进程语义
- **THEN** 登记 MUST 说明系统依赖、具体风险、最小用例、触发输入和复用条件
- **AND** 实际 Windows 证明 MUST 不被另一平台的字符串模拟或通过结果替代

#### Scenario: Windows runtime 或 Launcher 失败
- **WHEN** Windows 原包安装、启动或清理失败
- **THEN** 失败 MUST 只影响相应消费检查和汇总，其他输入仍适用的成功证明 SHALL 保留
- **AND** 修复检查工具且包输入不变时 SHALL 沿用原包，不要求重新打包

#### Scenario: Windows fresh build 晚期失败
- **WHEN** 显式 Windows 干净构建诊断因安装、构建或清理失败
- **THEN** 失败 MUST 仅影响该检查，保留其他独立有效证明
- **AND** 没有真实系统构建差异时 MUST NOT 将完整干净构建加入每轮 Windows 候选

### Requirement: 开发 PR 验证必须按证据 owner 分配平台
Buildr 面向 `dev` 的合并请求（Pull Request）验证 MUST 由 macOS 执行主要受影响检查及其低成本前置检查，并从同一比较基线执行适用的浏览器（Browser）检查。Windows MUST 只执行统一登记中有真实系统依赖的平台敏感检查；工作流（Workflow）MUST NOT 复制测试文件清单或在两系统重复完整受影响计划。

#### Scenario: 普通非平台修改进入 dev
- **WHEN** 变化路径不命中任何真实 Windows 差异输入
- **THEN** macOS MUST 执行主要受影响检查
- **AND** Windows 计划 MUST 明确没有适用步骤且不得运行完整计划

#### Scenario: Windows高风险路径进入 dev
- **WHEN** 变化路径命中明确登记的平台边界实现或专属测试
- **THEN** Windows MUST 执行对应最小检查及真实依赖
- **AND** MUST NOT 重复与平台无关的完整功能测试集合

#### Scenario: Browser-owned路径进入 dev
- **WHEN** 同一比较基线的浏览器计划返回已选择
- **THEN** macOS MUST 准备适用依赖并执行该选择，保留计划与结果
- **AND** 空选择 MUST NOT 冒充浏览器通过

#### Scenario: Candidate topology 保持稳定
- **WHEN** 主线合并请求或受控候选运行
- **THEN** 全部通用主证明、明确平台差异、唯一原包及宿主兼容证明 MUST 无遗漏
- **AND** 稳定 `Candidate gate` 名称和分支保护兼容性 MUST 保持

## ADDED Requirements

### Requirement: 发布与验证代码保持单一职责
发布专用确定性脚本 MUST 随组织自有 `buildr-release` 技能维护；检查定义、输入、执行、复用及汇总 MUST 归既有产品验证框架。本机与 GitHub MUST 调用同一权威实现，不复制规则或新增状态数据库。

#### Scenario: 从真实入口准备与检查
- **WHEN** 智能体按技能准备、检查或恢复固定候选
- **THEN** 发布脚本 SHALL 委托验证框架选择有效证明和必要缺项
- **AND** 公开授权及最终原包身份 SHALL 保持独立

### Requirement: 清理失败不得撤销此前独立证明
本次环境清理失败 MUST 如实使本次失败且不得生成新的干净成功证明；此前已完成清理、输入仍匹配的采用结果 MUST 保留原始来源及可复用资格。

#### Scenario: 复用旧结果后新执行清理失败
- **WHEN** 一个旧干净结果被采用，另一检查本次执行后清理失败
- **THEN** 本次整体 SHALL 失败，新执行结果 SHALL 不可复用
- **AND** 旧结果 SHALL 不因未参与本次环境被撤销

### Requirement: 源码证明不得被制品分片重复执行
候选 SHALL 分离仅依赖源码的检查与最终包消费者，完整本机结果满足源码分片时 MUST 跳过该分片执行及其专属准备。最终包检查 MUST 继续绑定实际不可变字节。

#### Scenario: 原源码与原包检查混合
- **WHEN** 通用源码检查已有有效结果但最终包仍需验证
- **THEN** 计划 SHALL 只启动缺少证明的最终包消费者
- **AND** MUST NOT 因消费者与源码曾共享分片而重新执行源码检查或专属准备

### Requirement: 测试发现输入必须区分成员变化与无关内容变化
结果复用 SHALL 依据执行器实际选择的测试内容与发现规则核验；新增或删除可能改变选择的测试 MUST 被发现。另一独立集合的内容变化 MUST NOT 单独撤销本集合证明；解析不明的读取 MUST 继续保守处理。

#### Scenario: 两个独立系统检查
- **WHEN** 只修改另一已登记系统检查文件且本检查及其依赖不变
- **THEN** 本检查的输入身份 SHALL 保持不变
- **AND** 修改本检查、其依赖或测试发现成员时 MUST 使对应输入身份变化
