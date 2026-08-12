## ADDED Requirements

### Requirement: Package必须完整交付Environment Preparation Declaration能力
Buildr package MUST原子交付Preparation Declaration schema/reference/template、Plan Request/Plan/Receipt contracts、`task-environment`与相关consumer guidance、CLI/Application runtime、Doctor和Local App read model。package manifest MUST列出所有新增Skill companion files，runtime投射 MUST不依赖Product checkout外未发布文件。

#### Scenario: package check验证新增资产
- **WHEN** Agent运行`buildr package check`
- **THEN** package check MUST验证全部Environment Preparation Declaration companion files存在且受manifest管理
- **AND** 安装后Workspace MUST能让Agent读取模板、选择Recipe并调用公开CLI
