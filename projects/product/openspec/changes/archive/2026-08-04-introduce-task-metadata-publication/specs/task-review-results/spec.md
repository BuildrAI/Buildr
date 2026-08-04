## ADDED Requirements

### Requirement: Task Review writer 必须声明两个可选 portable publication paths
Task Review writer MUST声明 `buildr.task-review/v1`分别拥有 `.buildr/tasks/<task-id>/reviews/planning.yml` 与 `.buildr/tasks/<task-id>/reviews/completion.yml`；两个current Result均为可选、portable publication eligible，缺失时 MUST保持缺失。

#### Scenario: 只有Planning Result存在
- **WHEN** publication组合Review writer declaration且只有 `planning.yml`存在
- **THEN** scope MUST只纳入planning exact path
- **AND** MUST NOT创建 `completion.yml`或扫描 `reviews/`目录

#### Scenario: 两个Result都存在
- **WHEN** planning与completion均存在且writer可安全读取
- **THEN** scope MUST把两个路径作为同一writer的两个独立exact owned paths
