## Why

独立 Harness 的资源管理器与源代码管理只能操作一个目录，无法独立审阅同一仓库的关联工作树。Development 已有工程视图，不应成为通用 Git 或文件能力的前置条件。

## What Changes

- Harness 从获准目录自动发现 Git 仓库，无需工程登记；同仓库工作树可发现、选择并跨面板准确定位，不改绑对话。
- 通用文件工作台保留按来源区分的多文件现场和版本化续读，提供本机文件夹定位。
- 在独立入口提供显式 Git 管理，Development 继续提供工程登记、任务、验证及交付。

## Capabilities

### New Capabilities

### Modified Capabilities

- `harness-directory-workbench`：完善独立文件与 Git 工作台，显式选择检出来源。

## Impact

Harness 后端和网页，以及消费共享工作台的 Development 实现。无需迁移对话或任务数据。
