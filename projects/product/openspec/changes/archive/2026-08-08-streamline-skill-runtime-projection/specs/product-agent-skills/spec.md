## MODIFIED Requirements

### Requirement: 产品入口识别工作能力适配意图
产品入口 Buildr Skill MUST 识别可能改变 Skill 行为或跨 Skill 协作关系的用户工作意图，并 MUST 将具体资产开发路由到 `capability-adaptation` 管理 Skill；产品入口只对自身已命中的管理意图执行按需能力路由，MUST NOT 承载完整 workspace consumer dependency graph。

#### Scenario: 用户不使用 capability 术语
- **WHEN** 用户只表达“采用内部流程”“调整工作方式”“修改默认 Skill 行为”或等价自然语言意图
- **THEN** Buildr Skill MUST 识别这是工作资产维护意图
- **AND** Agent MUST NOT 要求用户先指出 Skill id、capability id、provider 或 binding

#### Scenario: 判断是否形成能力契约
- **WHEN** Agent 准备创建、修改、替换或卸载相关 Skill
- **THEN** Buildr Skill MUST 路由到 `capability-adaptation`
- **AND** 适配流程 MUST 判断目标行为是否被其他 Skill 组合、是否需要替换实现、consumer 是否依赖稳定保证或结果证据，以及生命周期是否需要影响诊断

#### Scenario: 产品入口是能力路由者
- **WHEN** 产品入口已因 Buildr 管理意图被加载，且该意图需要一项可替换 capability
- **THEN** Agent MUST 从当前 scope 的 Doctor full capability graph 解析该 capability 的 contract 和 selected provider
- **AND** 该 capability MUST 只作为本次意图的 required route
- **AND** 单项 capability blocked MUST NOT 阻塞 Buildr Skill 的无关管理意图
- **AND** 产品入口 runtime Skill MUST NOT 注入其他 consumers、其他 scopes 或完整 workspace capability graph
- **AND** 产品入口 MUST NOT 作为具有全部 capabilities required dependencies 的 workspace manifest consumer
