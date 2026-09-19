# 知识建设与维护的实现组织

这张地图回答：知识怎样被建设、读出来并呈现，职责分别落在哪些文件。范围为当前能力，不是项目全景；以下路径相对于 Buildr 产品根目录 `projects/product/`，只展开相关目录，止于文件层。

## 先理解职责怎样协作

**建设过程**：用户提出主题 → 智能体（Agent）核对规范与代码 → 按需制作文章、图和地图 → 维护阅读关联 → 用户刷新阅读。专业方法约束建设质量；页面提供接续指令，当前不直接调度执行。

**读取过程**：页面发起请求 → 超文本传输协议（HTTP）入口校验身份 → 应用解析已登记范围 → 领域规则校验知识关联 → 基础设施读取文件 → 页面呈现。查看图示时由单独的隔离响应加载 HTML，主文档与副屏共用同一成果。

| 职责 | 当前实现与边界 |
| --- | --- |
| 规范依据 | [当前知识维护规范](../../openspec/specs/current-knowledge-maintenance/spec.md)规定事实与成果边界；[项目知识阅读规范](../../openspec/specs/project-knowledge-browsing/spec.md)规定范围、来源观察、阅读和建设入口。 |
| 接口入口（Interface） | 知识读取由超文本传输协议（HTTP）入口提供。没有独立知识读取命令行（CLI）命令；通过接续指令执行专业工作，不把按钮当成后台维护程序。 |
| 应用服务（Application） | 解析项目、服务和代码库，组织成果与来源读取，计算当前观察。它决定读哪些内容，不决定架构文章的语义是否正确。 |
| 领域模型（Domain） | 校验对象身份、成果类型、来源关联和层级，拒绝重复身份、无效关联和循环。 |
| 数据访问与技术支撑 | 内容保存在文件中，由有界文件读取检查真实路径、类型、大小并计算摘要。当前没有知识数据库或对象关系映射（ORM）持久层。 |
| 前端阅读 | 页面组织当前范围；目录组件负责检索；成果组件负责正文和内嵌；读取钩子（Hook）取消过时请求；副屏复用同一成果、源码阅读和已有技能详情。 |

## 规范与实现在哪里？

从下面的文件名可以查看总体说明和源文件。加粗目录标明业务组织层，默认先展示到这里；点击目录或左侧引导线继续展开。目录后的说明回答“这一层负责什么”，文件后的说明回答“具体由谁实现”。

- `./` — Buildr 产品根
  - `openspec/` — 行为承诺与本轮变更
    - **`specs/current-knowledge-maintenance/`** — 当前知识维护的正式规范
      - [spec.md](../../openspec/specs/current-knowledge-maintenance/spec.md) — 事实、表达、影响提醒、整组授权和维护验收
    - **`specs/project-knowledge-browsing/`** — 项目知识阅读规范
      - [spec.md](../../openspec/specs/project-knowledge-browsing/spec.md) — 阅读范围、目录、详情和关联行为
    - **`specs/code-map-building/`** — 代码地图制作规范
      - [spec.md](../../openspec/specs/code-map-building/spec.md) — 代码地图的内容、来源及制作要求
  - **`services/buildr/src/modules/knowledge/`** — 后端知识读取能力
    - `interfaces/http/` — 协议入口
      - [knowledge-http.ts](../../services/buildr/src/modules/knowledge/interfaces/http/knowledge-http.ts) — 身份解析、只读响应与隔离图示
      - [knowledge-http-contracts.ts](../../services/buildr/src/modules/knowledge/interfaces/http/knowledge-http-contracts.ts) — 对外响应结构与校验
    - `application/` — 组织阅读用例
      - [knowledge-query.ts](../../services/buildr/src/modules/knowledge/application/knowledge-query.ts) — 定位登记范围、读取成果与核对来源
    - `domain/` — 知识对象与关联规则
      - [knowledge-index.ts](../../services/buildr/src/modules/knowledge/domain/knowledge-index.ts) — 索引解析、身份与关系有效性
    - `infrastructure/` — 文件技术操作
      - [knowledge-files.ts](../../services/buildr/src/modules/knowledge/infrastructure/knowledge-files.ts) — 路径、文本、大小与内容摘要
    - [module.ts](../../services/buildr/src/modules/knowledge/module.ts) — 接入工作空间与技能来源，装配读取能力
  - `services/buildr-web/src/` — 前端代码
    - **`features/knowledge/`** — 面向人的知识阅读
      - `pages/`
        - [KnowledgePage.tsx](../../services/buildr-web/src/features/knowledge/pages/KnowledgePage.tsx) — 当前主题、导航与副屏的页面编排
      - `components/`
        - [KnowledgeCatalog.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeCatalog.tsx) — 三类成果的统一检索与建设入口
        - [KnowledgeArtifactReader.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeArtifactReader.tsx) — 同一正文的内嵌和独立阅读
        - [KnowledgeDiagram.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeDiagram.tsx) — 隔离图示与合法对象定位
        - [KnowledgeTree.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeTree.tsx) — 紧凑目录、业务边界与折叠操作
        - [KnowledgeReadingPane.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeReadingPane.tsx) — 保留关联阅读，先解释文件再显示原文
        - [KnowledgeSource.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeSource.tsx) — 只读源码、行号和文档模式
        - [KnowledgeAgentAction.tsx](../../services/buildr-web/src/features/knowledge/components/KnowledgeAgentAction.tsx) — 建设主题和完善意见的接续表单
      - [useKnowledgeReading.ts](../../services/buildr-web/src/features/knowledge/useKnowledgeReading.ts) — 请求状态、取消与范围切换保护
      - [knowledge-tree.ts](../../services/buildr-web/src/features/knowledge/knowledge-tree.ts) — 原生文件树与明确相关文件的结构解析
      - [knowledge-catalog.ts](../../services/buildr-web/src/features/knowledge/knowledge-catalog.ts) — 按标题、说明和路径筛选目录
      - [knowledge-navigation.ts](../../services/buildr-web/src/features/knowledge/knowledge-navigation.ts) — 文内路径、主题归属与图示消息校验
      - [knowledge-request.ts](../../services/buildr-web/src/features/knowledge/knowledge-request.ts) — 将用户目标与事实观察组成接续指令
      - `api/`
        - [knowledge-api.ts](../../services/buildr-web/src/features/knowledge/api/knowledge-api.ts) — 沿用已有会话访问读取接口
    - **`features/agent-assets/components/`** — 共用技能阅读
      - [SkillHome.tsx](../../services/buildr-web/src/features/agent-assets/components/SkillHome.tsx) — 默认预览技能正文，按需查找参考文件
    - [markdown.ts](../../services/buildr-web/src/markdown.ts) — 共用文档渲染，保留安全链接、列表与目录层级
    - [components/MarkdownHost.tsx](../../services/buildr-web/src/components/MarkdownHost.tsx) — 将文档渲染接入页面及相对链接事件

## 哪些专业方法指导建设？

点击技能（Skill）名称在副屏查看详情。这里说明方法对人的价值，不要求先理解它的源文件名。

| 技能（Skill） | 职责 |
| --- | --- |
| [规范建设（OpenSpec）](../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md) | 指导明确行为承诺、变更范围和验收要求 |
| [代码架构（code-architecture）](../../services/buildr/resources/workspace/skills/buildr/code-architecture/SKILL.md) | 指导智能体（Agent）按清晰职责组织真实代码 |
| [当前知识维护（current-knowledge-maintenance）](../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) | 围绕阅读目标调查事实、组织成果更新并检查一致性 |
| [代码地图制作（code-map）](../../services/buildr/resources/workspace/skills/buildr/code-map/SKILL.md) | 解释规范、职责、协作怎样落实到真实目录与文件 |
| [技术图制作（Archify）](../../services/buildr/resources/workspace/skills/buildr/archify/SKILL.md) | 用合适图示表达关系或过程，检查图源与展示 |
| [术语治理（terminology-governance）](../../services/buildr/resources/workspace/skills/buildr/terminology-governance/SKILL.md) | 在含义或作用域变化时核对术语；平时沿用唯一解释 |

这些是智能体（Agent）采用的工作方法，不是运行时函数调用。OpenSpec 的提案和实施交接识别知识影响，实际维护按用户授权进行；方法的完整过程见各自详情。

## 成果保存在什么地方？

- `knowledge/` — 本主题可独立维护的成果
  - [index.yml](../index.yml) — 阅读身份、引用及文件说明
  - `docs/architecture/`
    - [knowledge-maintenance.md](../docs/architecture/knowledge-maintenance.md) — 当前架构文章
  - `code-map/`
    - [knowledge-maintenance.md](knowledge-maintenance.md) — 当前规范与实现地图
  - `archify/flows/`
    - [knowledge-maintenance.json](../archify/flows/knowledge-maintenance.json) — 可维护的职责图源
    - [knowledge-maintenance.html](../archify/flows/knowledge-maintenance.html) — Archify 生成的图示展示
    - [knowledge-maintenance.md](../archify/flows/knowledge-maintenance.md) — 图示依据与表达边界


来源缺失或职责变化时，只影响相关表达；摘要相同不能证明语义正确。读取与保护行为的证据见[实际文件回归](../../services/buildr/test/integration/knowledge-query.test.ts)。本地图不说明正式发布状态，也不覆盖其他业务模块。
