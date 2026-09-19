# 知识建设与维护

范围：Buildr 的知识建设与阅读能力。规范与代码提供事实依据，解释文档帮助人理解职责，图示表达关系，代码地图定位真实实现。本文说明当前代码中的实现；发布状态以实际交付版本为准。

## 从想弄懂的问题开始

项目或服务知识目录分为架构知识、技术图与代码地图，使用同样的检索方式。“构建架构知识”接收主题、关注范围和阅读问题；技术图分类也可以单独发起“构建技术图”，不强制同时建设文章。用户不必先挑选工具或枚举源码。当前先生成接续指令，由用户交给智能体（Agent）执行；准备或复制指令不表示文章完成。

建设时先调查规范、代码和已有知识，写成能够说明职责、约束与修改影响的架构文章，按需要引用图和地图；事实、设计依据、推断和建议要分清。成果落到真实文件和阅读关联，刷新后进入同一知识首页，详情页可选择“完善当前内容”。具体写法见[建设指引](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/references/architecture-knowledge.md)。

[项目、服务与代码库如何协作](project-service-repositories.md)是按这个过程形成的真实主题。建设范围已明确时连续完成必要文章与引用，范围外新主题或修改事实源则先说明影响并取得相应决定。

## 谁建设事实，谁解释事实？

[OpenSpec](../../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md) 指导规范，[代码架构（code-architecture）](../../../services/buildr/resources/workspace/skills/buildr/code-architecture/SKILL.md) 指导代码。规范描述应该怎样，代码反映已经怎样；发现差异需要明确两边事实。

[当前知识维护（current-knowledge-maintenance）](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) 根据真实影响组织维护，按需要采用 [Archify](../../../services/buildr/resources/workspace/skills/buildr/archify/SKILL.md)、[代码地图制作（code-map）](../../../services/buildr/resources/workspace/skills/buildr/code-map/SKILL.md) 与 [术语治理](../../../services/buildr/resources/workspace/skills/buildr/terminology-governance/SKILL.md)。具体维护由智能体（Agent）按授权执行。

![知识建设与维护的职责关系](../../archify/flows/knowledge-maintenance.html)

## 职责怎样落到实现？

工作方法以技能（Skill）源文件交付，阅读能力由后端知识模块和 Buildr Web 共同提供。局部索引连接唯一文件正文；页面读取不会自动改写成果。三个目录统一在主屏进入详情，文中图、地图及文件在副屏对照，切换正文保留已打开内容；地图中的规范、技能职责和可点击文件树说明这项能力怎样落实。

![知识建设与维护的代码地图](../../code-map/knowledge-maintenance.md)

## 变化之后怎样保持准确？

新增来源时补齐有用关联，文件移动时更新路径，职责改变时核对说明与关系，删除来源时先确认替代实现和历史用途。无语义影响的修改不要求重画图。

再次打开对象或刷新时，页面读取真实文件并与上次核对摘要比较。来源缺失、不可读或已变会主动提示；提示直接关联具体文件，不另设全量“来源核对”栏目。摘要相同只说明内容相同，不是新的语义证明。完成维护后更新索引中的观察，再刷新查看结果。

[术语解释](../knowledge-maintenance-terms.md)说明事实源、映射层及核对状态。[维护规范](../../../openspec/specs/current-knowledge-maintenance/spec.md)与[实际文件测试](../../../services/buildr/test/integration/knowledge-query.test.ts)分别提供行为承诺和验证依据。

## 什么时候提醒，什么时候实际维护？

普通开发改动规范或代码后，智能体（Agent）按实际影响定位已有文章、图和地图，并说明哪里需要校准。只有代码修改授权时，先提出一组具体维护建议，等待授权；已有同范围维护授权时说明影响后连续完成，不逐文件确认。文件变化而表达仍成立时核对并保留，不要求重画。

用户主动要求建设或维护某个架构主题，授权覆盖这个主题所需的文章、必要图示、代码地图（Code Map）、术语与阅读关联。完成要看真实内容是否准确、关联能否打开、页面是否可读；不能只更新文章或来源摘要就宣布整组同步。

当前提醒分为两种：开发中的语义判断由采用上述工作方法的智能体（Agent）完成；网页在再次打开或刷新时提示已登记来源的内容变化。当前没有持续文件监听或后台自动唤醒智能体，生成建设指令后仍需交给智能体实际执行。
