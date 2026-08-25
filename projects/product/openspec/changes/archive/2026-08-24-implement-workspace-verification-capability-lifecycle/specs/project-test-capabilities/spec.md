## ADDED Requirements

### Requirement: Project v3 必须声明稳定 Test Capability Families
已登记 Project MAY 在根目录提供 closed `buildr.project-verification/v3` `verification.yml`。每项 capability MUST 具有唯一 id、Project/Service scope、非空 proves、非空 `static|unit|component|integration|system` evidence、非空 usable targets、可信 discovery sources、full invocation 与可选 affected invocation；声明 MUST NOT包含具体测试清单、通用 DAG、Task Plan 或 Result。

#### Scenario: 声明普通能力族
- **WHEN** Project 声明一个覆盖 Service unit 与 component evidence 的能力族
- **THEN** schema MUST 校验 scope、proves、evidence、usableFor、discovery 与 invocation
- **AND** 具体测试类、Tag 和 suite membership MUST继续由测试源码或构建配置持有

#### Scenario: v2 声明进入 v3-only runtime
- **WHEN** Doctor、planner 或 runner 读取 `buildr.project-verification/v2`
- **THEN** MUST在执行前返回明确的 unsupported schema 与 v3 migration diagnostic
- **AND** MUST NOT通过兼容 reader、adapter、默认值或双读执行该声明

### Requirement: Capability invocation 必须区分 affected、full 与高级 provider
每项 capability MUST提供可执行 full 入口，并 MAY提供可信 affected 入口；入口 kind MUST为 `command|agent|provider`。command/agent MUST保持既有有界执行约束；provider MUST引用Task Environment中可解析的稳定 adapter，并只接受/返回 closed Request、Plan 与 execution facts。

#### Scenario: 没有 affected 入口
- **WHEN** Task Delivery 请求 affected 但 selected capability只声明full入口
- **THEN** planner MUST选择full入口并记录稳定full reason
- **AND** MUST NOT把full命令伪装成affected或静默跳过

#### Scenario: 高级 provider
- **WHEN** capability使用provider入口
- **THEN** planner MUST通过注册adapter取得统一Plan与execution units
- **AND** provider内部registry、DAG、Context与scheduler字段 MUST NOT进入通用declaration或公开Plan

### Requirement: Doctor 必须只读校验 v3 declaration
Project没有`verification.yml`时Doctor MUST零finding；文件存在时 MUST只读校验closed v3 schema、Project/Service identity、discovery paths、target/evidence enums、invocation、preparation/resource references和authorization，不得运行测试或改写声明。

#### Scenario: v3 declaration 有效
- **WHEN** 已登记Project提供有效v3 declaration
- **THEN** Doctor MUST报告valid、path与实际capabilityCount
- **AND** declaration bytes MUST保持不变

#### Scenario: 声明含未知或v2字段
- **WHEN** declaration包含`applicability`、`requiredForDelivery`或其他不属于v3的字段
- **THEN** Doctor MUST返回精确closed-schema finding与迁移指引
- **AND** MUST NOT忽略字段后继续执行

## MODIFIED Requirements

### Requirement: Declaration 必须只暴露稳定能力接口
Task Verification 的声明指导 MUST 将 `verification.yml` 限定为少量、稳定、可独立选择的 Project / Service Test Capability Family，不得复制每个测试文件、内部 registry step 或 Project Testing 分类卡。具体测试、Tag、Suite、dependency graph、编排场景与成本数据 MUST 保留在 Project 自身测试源码、构建配置或高级 provider registry；v3 只声明 evidence、target、discovery、affected/full入口及执行边界。

#### Scenario: Candidate 内部包含多个 step
- **WHEN** 一个稳定 Candidate provider 内部编排多个测试 step
- **THEN** declaration MAY 只声明该稳定能力族与provider入口
- **AND** MUST NOT 因内部 step 数量创建等量 capability 或通用 DAG 字段

#### Scenario: 项目缺少适用测试
- **WHEN** 声明审查发现目标事实没有现有测试入口
- **THEN** Task Verification MUST 报告 coverage gap
- **AND** 测试建设 MUST 作为 Project Testing 或后续实现工作处理，不得在声明更新中暗中生成测试

### Requirement: Verification capability 必须显式声明准备依赖
Project Verification capability MAY在既有environment边界中引用同一Project `preparation.yml`的一个或多个Recipe。每个引用 MUST绑定Project、Project-wide或已登记Service scope与Recipe id，并进入v3 declaration identity；Buildr MUST NOT从discovery、invocation、capability id、目录或技术栈推断准备Recipe。

#### Scenario: Browser capability引用辅助Service Recipe
- **WHEN** `product.browser-smoke`引用`service:product/buildr-web`的`buildr-web.npm-ci`
- **THEN** declaration parser MUST验证Project、Service与Recipe当前存在且scope匹配
- **AND** 该引用 MUST只表达执行准备，不得把`buildr-web`加入Task scope、Change scope或交付内容

#### Scenario: Capability没有准备引用
- **WHEN** v3 capability未声明任何preparation reference
- **THEN** declaration MUST有效且该capability的准备集合为空
- **AND** Buildr MUST不扫描Project猜测隐含依赖

#### Scenario: 引用越界或缺失Recipe
- **WHEN** capability引用其他Project、未登记Service或当前声明不存在的Recipe
- **THEN** Doctor与Verification admission MUST在执行前返回精确invalid或preparation gap
- **AND** MUST不自动改写`verification.yml`、`preparation.yml`或Task scope

## REMOVED Requirements

### Requirement: Project v2 声明已有 Verification Capabilities
**Reason**: v2无法表达验证目标、证据边界、affected/full和统一Plan，且受控试点允许一次性删除兼容。

**Migration**: 将全部live声明转换为`buildr.project-verification/v3`能力族；v2在active runtime中明确invalid，归档历史保持不变。

#### Scenario: 迁移旧Project声明
- **WHEN** 受控live Project仍使用v2 capability声明
- **THEN** declaration owner MUST在v3-only runtime激活前迁移为v3能力族
- **AND** active runtime MUST不保留v2 reader

### Requirement: Applicability 与 proves 必须可解释
**Reason**: path/condition applicability与requiredForDelivery被v3的discovery、usableFor、affected/full入口和Plan trace替代。

**Migration**: 将paths迁入可信discovery sources或provider owner事实，将交付适用性迁入usableFor，并由Plan记录本次选择理由。

#### Scenario: 迁移path applicability
- **WHEN** v2 paths与conditions用于选择旧capability
- **THEN** migration MUST将可信事实放入v3 discovery/provider authority
- **AND** 本次选择理由 MUST由Verification Plan持有

### Requirement: Doctor 必须只读校验 v2 declaration
**Reason**: Doctor只支持单一v3 active schema。

**Migration**: 迁移声明后使用v3 Doctor；v2只返回unsupported migration diagnostic。

#### Scenario: Doctor遇到v2
- **WHEN** Doctor读取尚未迁移的v2声明
- **THEN** MUST返回unsupported schema与v3迁移指引
- **AND** MUST不执行或兼容读取该声明
