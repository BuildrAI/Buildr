## MODIFIED Requirements

### Requirement: package manifest 声明产品内置 Agent Skills
Buildr 的 `resources/manifest.yml` MUST显式声明产品随包内置 Agent Skills，并将产品入口 Skill 定义与用户 Workspace `skills/manifest.yml` 分离；其源 MUST位于 `resources/runtime/skills/<skill-id>/` 文件型交付资源树，`package/targets/runtime` MUST不再作为源 authority。

#### Scenario: 声明 agentSkills
- **WHEN** Buildr 产品包包含内置 Agent Skill
- **THEN** `resources/manifest.yml` MUST通过专用字段声明 Skill id、源路径和适用 runtime
- **AND** 源路径 MUST位于已登记的 `resources/runtime/skills` 子树

#### Scenario: agentSkills 不参与 init baseline
- **WHEN** Agent 执行 `buildr init`
- **THEN** manifest 中声明的产品入口 Agent Skills MUST NOT被复制到目标 workspace `skills/` 目录
- **AND** Workspace `skills/manifest.yml` MUST由 writer 使用真实 Workspace identity 生成，并由 Builtin/Component 声明收敛

#### Scenario: package check 校验内置 Agent Skills
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST校验 manifest 声明的产品内置 Agent Skill 源路径存在
- **AND** Buildr MUST校验该 Skill 不包含 forbidden patterns
- **AND** Buildr MUST校验该 Skill 具备可渲染的 `SKILL.md`

#### Scenario: package check 校验 bootstrap 入口契约
- **WHEN** Agent 执行 `buildr package check`
- **THEN** Buildr MUST 从产品源资产校验 Buildr 技能（Skill）的恢复入口契约；MUST NOT 要求 `docs/bootstrap-guide.md` 或其正文副本存在
- **AND** MUST NOT要求已删除的 `package/bootstrap/` 文字资产存在

### Requirement: 产品验证覆盖 Git-first workspace 更新编排
Buildr product verification MUST 防止产品入口 Buildr Skill 和随包引导退回到只执行本地 `buildr sync` 的 workspace 更新语义，同时 MUST 保证更新 operation 由产品入口选择而不是 Git Operations 自行推断。

#### Scenario: 校验 Git 管理 workspace 的更新顺序
- **WHEN** Buildr 验证产品入口 Buildr 技能（Skill）、命令参考（CLI Reference） 和 runtime 提示
- **THEN** 验证 MUST 确认“更新 workspace”与“同步 workspace”由 Buildr Skill 先向 selected `buildr.git-operations/v1` provider 提供 workspace、upstream 和明确 update operation，再执行 `buildr sync <agent> --target <workspace-root>`
- **AND** 验证 MUST 确认该意图不会先运行 `buildr update`
- **AND** 验证 MUST 确认 Git 更新成功后无需再次询问 sync 授权

#### Scenario: 校验 Git 更新失败边界
- **WHEN** Buildr 验证 Git 管理 workspace 的更新决策点
- **THEN** 验证 MUST 确认本地改动、分叉、冲突、缺少 upstream 或其他 Git 决策点会阻止后续 sync
- **AND** 验证 MUST 确认 Agent 不会自动 stash、reset、rebase、merge 或覆盖用户内容

#### Scenario: 校验非 Git workspace 和 CLI 职责边界
- **WHEN** Buildr 验证非 Git workspace 或 `buildr sync` 命令说明
- **THEN** 验证 MUST 确认非 Git workspace 直接执行 sync
- **AND** 验证 MUST 确认 Git 更新属于 Buildr Skill 的 consumer 编排，而不是 `buildr sync` CLI 或 Git Operations provider 的隐式行为
