## MODIFIED Requirements

### Requirement: 生产源码必须具有显式领域验证所有权
Buildr Product MUST 为保留的`src/application`与`src/infrastructure`生产模块维护可执行的affected owner契约；通用Unit、Candidate制品或broad application payload匹配 MUST NOT单独充当领域owner。每个保留生产模块 MUST命中至少一个直接Integration/System/Static owner，或进入包含owner与理由的显式闭合allowlist；新增、迁移或移除路径造成缺口时planner MUST在启动verifier前fail closed。确定退役的Task Retrospective生产路径 MUST从owner表和验证registry删除，不保留空owner。

#### Scenario: 已有领域 Integration 的源码发生改变
- **WHEN** Task Record、Task Review、Task Verification或其他仍存在且具有领域Integration证据的生产源码进入changed paths
- **THEN** planner MUST选择包含该真实测试文件的有界领域Integration owner
- **AND** MUST NOT仅返回Unit、Candidate tarball或application payload owner

#### Scenario: 退役Retrospective生产路径
- **WHEN** Task Retrospective Application、Repository、Driver或HTTP实现被删除
- **THEN** verification registry与ownership MUST同时删除专用owner和测试
- **AND** MUST不保留空step、旧路径allowlist或为了旧设计而存在的primary evidence

#### Scenario: 新生产模块没有直接 owner
- **WHEN** 新增`src/application`或`src/infrastructure`模块且没有直接owner或显式allowlist条目
- **THEN** planner与repository contract MUST在启动测试进程前报告生产源码owner coverage gap
- **AND** MUST NOT根据相似文件名、CLI可达性或broad `src/**`匹配猜测领域覆盖

#### Scenario: 生产模块明确只适用现有非领域证据
- **WHEN** 维护者确认某模块没有真实领域Integration/System场景且已有owner足以证明其风险
- **THEN** registry MAY使用包含精确路径、owner和理由的显式allowlist
- **AND** 已存在直接领域Integration测试的模块 MUST NOT通过allowlist绕过选择

### Requirement: 专属 Integration slice 必须保持当前能力的唯一 primary ownership
Verification registry MUST为仍存在的Task Overview、Record、Review、Verification与Parent Coordination实现选择唯一primary owner，不得保留Retrospective、Task Entry、Environment、Task Development、Planning Identity或旧Finish的空step、shard或路径映射。

#### Scenario: changed paths命中Task read或专业实现
- **WHEN** affected selection命中当前保留的Task实现
- **THEN** MUST选择覆盖该实现的现有owner
- **AND** MUST不选择已退役Task能力的owner

#### Scenario: 本机复盘文档能力变化
- **WHEN** Task Record复盘摘要、固定文件读取或Buildr Web复盘卡片发生改变
- **THEN** MUST由Task Record Integration/System和适用Browser owner证明
- **AND** MUST不重建Task Retrospective专属slice
