## MODIFIED Requirements

### Requirement: 代码库实例独立登记
Buildr MUST 在 `repositories/manifest.yml` 登记代码库实例的稳定身份、工作空间身份、代码、名称、说明和来源。远端 Git 来源 MUST 包含地址、远端与集成分支；已有本地 Git 仓库 MUST 可不声明远端信息；本地当前分支和未提交状态 MUST 作为观察结果，不写回稳定声明。

#### Scenario: 同源不同分支
- **WHEN** 两个实例具有相同 Git 地址和不同集成分支
- **THEN** 系统 MUST 保留两个身份及各自位置，不自动合并

#### Scenario: 无远端的工作空间源码
- **WHEN** 代码由工作空间自身仓库承载
- **THEN** 系统 MUST 登记实际 Git 根目录（工作空间根目录使用 `.`），不虚构独立远端和集成分支；子目录 MUST 作为服务模块路径，不登记为独立代码库

## ADDED Requirements

### Requirement: 真实仓库位置与显式归并
新增代码库 MUST 支持工作空间（Workspace）根目录、内部自定义路径和外部附接目录；已有位置 MUST 校验 Git 根目录，不将普通目录或仓库子目录误报为代码库。旧 workspace 子目录声明 MUST 保持只读兼容，显式迁移时按实际根目录归并并重算服务模块路径，保留服务身份；不同物理目录或分支 MUST 不按远端地址合并。

#### Scenario: 单仓库多模块
- **WHEN** 两个旧服务目录实际属于同一根仓库且用户执行迁移
- **THEN** 系统 MUST 登记一个根仓库并让两个服务分别通过模块路径引用它，不搬迁代码

#### Scenario: 不是真实仓库
- **WHEN** 用户登记已有的普通目录或仓库子目录
- **THEN** 系统 MUST 拒绝该登记并说明应选择真实仓库根目录
