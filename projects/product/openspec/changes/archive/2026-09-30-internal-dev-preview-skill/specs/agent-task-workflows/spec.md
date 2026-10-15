## ADDED Requirements

### Requirement: 自举工作空间必须保留内部预览技能

Buildr 自举工作空间 MUST 保留 workspace-local 的 `buildr-dev-preview` 技能（Skill），用于在 Buildr 自身开发与验收中按"开发工作树代码 + 指定数据源"启动 Buildr Web 预览。该技能 MUST 以 `skills/` 工作空间源资产存在并登记进 `skills/manifest.yml`；MUST NOT 进入产品 package 的 `resources/`、内置 Skill 清单或用户 workspace 默认能力，MUST NOT 提供用户级安装说明。

技能 MUST 支持三种数据源模式：canonical workspace 实时任务库（读取 canonical `.buildr/local/workspace.sqlite`，工作树材料经受管工作树证据解析）、隔离 SQLite 快照（以一致副本为工作树 `.buildr/local/workspace.sqlite` 播种，不共享、不回灌）、空现场（无任务库依赖的 UI 验收）。技能 MUST 优先使用 `buildr web preview start|list|stop` 托管实例生命周期与 owner/secret 证据；托管路径不满足当前模式或存在已知缺陷时，MUST 如实降级为手工配方并显式说明预览身份证据差异。任一模式 MUST 使用独立 `BUILDR_APP_DATA_DIR`、随机 loopback 端口，并以工作树内 `projects/product/buildr` 开发入口运行被预览代码；MUST NOT 改写 canonical 任务库内容、影响默认 Buildr Web 或 `Buildr Web Dev.app`，MUST NOT 以主目录旧文件冒充工作树材料。

#### Scenario: 维护者要求验收工作树中的前端改动

- **WHEN** 维护者请求"用开发工作树的代码 + 指定任务数据起一个 Buildr Web 页面"或等价意图
- **THEN** 当前宿主 MUST 发现 `buildr-dev-preview` 技能并按其流程选数据源模式、构建前端产物、启动隔离预览
- **AND** 输出的验收链接 MUST 能区分为开发预览身份

#### Scenario: 预览不在用户 workspace 中扩散

- **WHEN** 维护者检查产品 package 资源清单与用户 workspace 技能同步结果
- **THEN** `buildr-dev-preview` MUST NOT 出现在 package `resources/`、内置 Skill 清单或用户级安装说明中
- **AND** 自举工作空间自身的 `skills/manifest.yml` 登记保持可读且用途边界如实表达

#### Scenario: 托管路径不可用时降级并说明

- **WHEN** `buildr web preview start --task` 对当前目标不可执行（例如运行时端口缺口或所选模式不支持）
- **THEN** 技能 MUST 如实报告托管路径缺口，选择手工配方并说明实例 owner、secret 与停止责任不再受托管证据保护
- **AND** MUST NOT 把手工启动伪装成托管预览，也不得改写 canonical 数据补齐功能缺陷
