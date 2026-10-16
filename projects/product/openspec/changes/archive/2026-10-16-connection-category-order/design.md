## Context

当前 `ConnectionSkillsPage` 将目录输入直接交给 `ResourceDirectory`；后者执行搜索，但连接页没有类别排列。保存返回的实例在原位替换或追加，因此以展示阶段的稳定排列处理所有入口即可，无需改动接口的原始顺序。

`ConnectionDefinition.presentation` 在后端和前端各有声明类型。后端解析采用封闭字段清单，`ConnectionSkillsApplication` 目前只从 `websiteField` 选择一个值，再过滤非 HTTP/HTTPS 或含用户名密码的地址。内置 Nacos、Kibana 均分开声明 `apiBaseUrl` 与可选 `consoleUrl`。问题及范围见 [proposal.md](proposal.md)。

## Goals / Non-Goals

**Goals:** 保持目录接口与实例顺序兼容，使页面同类聚集；以受限声明准确表达网站覆盖和基础地址的关系；所有网站候选继续经过同一安全过滤。

**Non-Goals:** 不改变目录请求次数，不新增分组标题或手动排序交互，不改变认证和业务执行，不猜测私有系统字段，也不将私有 Yearning 方法带入产品发布资源。

## Decisions

1. **在页面派生数据上按 `category` 稳定排序。** 使用类别机器键而非展示名称，避免翻译或自制展示名改变顺序；同类保留现有输入顺序。相比改写接口返回顺序，此处只改变用户要求的列表，不影响命令行（CLI）、独立查询目标及其他消费者。
2. **新增显式 `websiteFallbackField?: string`。** 该字段只引用本定义的 `url` 配置键，解析、后端类型和前端类型同步支持；不把 `apiBaseUrl` 作为硬编码通用约定。内置 Nacos、Kibana 分别声明回落，其他提供者可以独立选择。
3. **先选择候选，再执行安全过滤。** 网站覆盖值不存在或字符串去除空白后为空时，才读取显式回落值；其余值均视作覆盖候选。非空非法值不能被合法回落掩盖，保持用户明确配置的目标选择与错误可见性。后端返回安全 `websiteUrl`，前端仍保留已有二次检查。
4. **无配置迁移。** 这是声明兼容扩展，不改 `configVersion`、认证目标或实例文件。旧声明继续原行为；声明摘要变化按既有观察版本机制处理，不新增迁移或权限状态。

## Risks / Trade-offs

- [基础地址可能是接口路径而非完整控制台] → 只允许方法作者显式声明；用户有独立网站覆盖值时继续优先使用它。
- [排序意外扰动同类顺序] → 用交错类别夹具验证稳定性，并验证搜索与局部保存仍一致；排序不原地修改状态数组。
- [网站候选扩大可点击地址范围] → 验证缺失、空白、显式非法值、认证信息、非 HTTP/HTTPS 和无回落声明，复用同一安全过滤。

## Migration Plan

将通用解析与投影能力、前端类型及 Nacos/Kibana 声明作为同一候选验证。旧版本不支持新封闭字段，因此回退旧程序时应同时回退同批新增声明；不触碰用户已保存实例。集鲜私有声明的采用与本机产品启用由所属任务分别核对，本变更不更新共享自举环境。

## Knowledge Impact

已执行当前知识影响评估（assess）：作者契约 `services/buildr/resources/workspace/skills/buildr/connection-authoring/references/connection-contract.md` 需要说明显式回落及空值规则，模板需提供可理解的可选写法。`knowledge/docs/architecture/external-connections.md` 和 `knowledge/code-map/technical-layers.md` 的对象分工、模块职责及链接保持准确，无需改图或新增术语；实施完成后只核对实际影响。
