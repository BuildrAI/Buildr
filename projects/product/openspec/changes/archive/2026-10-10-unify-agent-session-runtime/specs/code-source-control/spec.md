## MODIFIED Requirements

### Requirement: 提交说明采用轻量执行

提交说明 MUST 使用同一已选模型（Model）的低推理级别（Reasoning Effort），MUST 经内部端口指定60秒调用预算，MUST NOT 修改原生全局配置或正式任务配置。Buildr MUST 在硬字节预算内准备必要资料，智能体（Agent）MUST 一次生成且不自行补读。输出 MUST 遵循适用提交规范，必要时添加正文，不预设条数，MUST NOT 编造未提供的内容或测试结果。

已验证的 Codex 应用服务（App Server）与 DSH 智能体客户端协议（ACP）提供者 MUST 复用同一业务入口、材料准备、结果校验和界面。具体低推理值 MUST 由提供者按模型能力映射并确认；临时、无工具或必要配置不能确认时 MUST 局部失败并保留草稿，不静默更换模型、协议或执行者。普通 Git 提交及推送 MUST 继续由直接 Git 能力承担。

#### Scenario: 真实源码变更快速生成
- **WHEN** 用户对实际工作树（Worktree）的较多源码变更发起生成
- **THEN** 系统 MUST 在60秒调用预算内交付符合规则的结果或明确失败并保留草稿；性能验收 MUST 使用真实源码场景，MUST NOT 仅以填充大文件代替

#### Scenario: 使用 DSH 验证同一场景
- **WHEN** 用户选择能力已通过验证的 DSH 生成提交说明
- **THEN** 系统 MUST 使用既有有界材料、规范及来源版本校验，经独立临时会话（Ephemeral Session）一次生成且不调用工具；界面 MUST 原位呈现可编辑结果，并能查看实际配置

#### Scenario: DSH 生成能力局部失败
- **WHEN** DSH 不能确认临时、无工具、低推理或配置路由要求
- **THEN** 系统 MUST 保留已有说明和直接 Git 操作，明确本次失败，不自动改用 Codex 或其他模式
