## ADDED Requirements

### Requirement: Project与Service创建必须由所属Application拥有
Workspace owner MUST让Project和Service各自的Application拥有创建、附接、物化、identity冲突检查、Manifest更新与Workspace mutation编排。CLI contribution MUST调用同一Application，不得保留CLI专用writer或第二套Manifest兼容实现。

#### Scenario: 创建Managed Project
- **WHEN**Project命令创建Workspace-owned或Git-managed Project
- **THEN**Project Application MUST核对目标、source、已有Registry和Git identity后在一个Workspace mutation中物化并更新Project Registry
- **AND**失败时 MUST保持现有staging清理、冲突拒绝和已有内容保护语义

#### Scenario: 创建或附接Service
- **WHEN**Service命令创建、复制或附接Service
- **THEN**Service Application MUST核对Project、Service source、Git root、remote、integration branch和重复来源
- **AND**Service Repository MUST是Services Manifest解析、兼容映射和写入的唯一owner

#### Scenario: CLI contribution组装
- **WHEN**Workspace module建立Project与Service CLI contribution
- **THEN**descriptor MUST注入对应Application API给所属CLI Adapter
- **AND**module MUST不依赖CLI Adapter向私有组合登记Project/Service业务方法
