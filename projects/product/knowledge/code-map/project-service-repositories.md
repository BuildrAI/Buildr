# 关系维护与代码定位的实现地图

这张地图回答：项目、服务与代码库怎样登记和关联，怎样定位真实代码，哪些动作有写入影响。路径相对于 Buildr 产品根目录 `projects/product/`，只展开相关部分，止于文件层。

## 规范怎样落实为行为？

[对象关系规范](../../openspec/specs/workspace-asset-relationships/spec.md)规定共享引用、稳定身份与删除边界；[代码库实例规范](../../openspec/specs/repository-instance-registry/spec.md)规定代码来源、分支声明和物理位置。规范是承诺，下面的文件是当前实现，两者需要分别核对。

**修改路径**：页面或命令行（CLI）表达操作 → 接口解析输入 → 应用重读版本与登记 → 领域规则检查引用 → 数据访问保存唯一清单 → 页面重新读取。

**代码定位**：项目中的服务标识 → 全局服务身份 → 唯一代码库实例 → 实例目录加模块路径。声明修改不隐式克隆、搬移文件或切换 Git 分支。

| 职责 | 具体负责什么 |
| --- | --- |
| 接口入口（Interface） | 超文本传输协议（HTTP）入口支持网页；`buildr assets` 命令行（CLI）入口支持检查及已授权登记操作。两者复用应用，不能自行改写引用规则。 |
| 应用服务（Application） | 组织创建、关联、修改、删除和来源解析，检查当前版本与其他引用方，决定本次事务范围。 |
| 领域模型（Domain） | 校验项目、服务、代码库身份及关系；服务必须指向一个实例，模块路径保持在合法范围。 |
| 数据访问（Persistence） | 读取并保存三个唯一登记清单，保留兼容读取。当前是文件持久化，没有对象关系映射（ORM）数据库表。 |
| 前端 | 关联面板表达当前项目的服务选择；对象详情展示职责与代码来源。页面不自行推断身份或访问本机代码。 |

## 到哪里看具体实现？

- `./` — Buildr 产品根
  - `openspec/specs/` — 当前规范
    - **`workspace-asset-relationships/`** — 业务引用与修改边界
      - [spec.md](../../openspec/specs/workspace-asset-relationships/spec.md) — 对象关系、共享引用与删除承诺
    - **`repository-instance-registry/`** — 代码来源与物理副本
      - [spec.md](../../openspec/specs/repository-instance-registry/spec.md) — 实例身份、分支声明与目录隔离
  - **`services/buildr/src/modules/workspace/`** — 登记与关系的后端能力
    - `interfaces/` — 输入与协议
      - [http/workspace-http.ts](../../services/buildr/src/modules/workspace/interfaces/http/workspace-http.ts) — 页面请求、协议校验与响应
      - [cli/asset-catalog.ts](../../services/buildr/src/modules/workspace/interfaces/cli/asset-catalog.ts) — `buildr assets` 命令参数与应用调用
    - `application/`
      - [asset-relationships-application.ts](../../services/buildr/src/modules/workspace/application/asset-relationships-application.ts) — 关系用例、版本冲突与代码定位
    - `domain/`
      - [asset-relationships.ts](../../services/buildr/src/modules/workspace/domain/asset-relationships.ts) — 三类对象、身份及引用规则
    - `persistence/`
      - [asset-catalog-repository.ts](../../services/buildr/src/modules/workspace/persistence/asset-catalog-repository.ts) — 唯一清单、摘要、保存和兼容读取
  - `services/buildr-web/src/features/` — 在对象上下文中操作
    - **`project/`** — 项目业务
      - `components/` — 项目交互组件
        - [ProjectServicesPanel.tsx](../../services/buildr-web/src/features/project/components/ProjectServicesPanel.tsx) — 展示服务关联、携带当前版本保存
    - **`workspace/`** — 资产业务
      - `components/` — 资产交互组件
        - [AssetHome.tsx](../../services/buildr-web/src/features/workspace/components/AssetHome.tsx) — 服务与代码库的同一详情

实际登记保存在用户工作空间根的 `projects/manifest.yml`、`services/manifest.yml` 和 `repositories/manifest.yml`；它们不属于这里展示的产品源码目录。上面的数据访问文件解释如何读写这些清单，不复制某台机器的内容。

## 修改时重点看哪里？

改变引用规则先核对规范、领域校验和应用用例；修改存储兼容看数据访问；调整展示看对应前端组件。解除一方引用应保留共享身份和代码，删除登记也不等于删除源码。代表行为见[关系与分支回归](../../services/buildr/test/integration/asset-relationships.test.ts)。

代码职责组织由[代码架构（code-architecture）](../../services/buildr/resources/workspace/skills/buildr/code-architecture/SKILL.md)指导，地图表达由[代码地图制作（code-map）](../../services/buildr/resources/workspace/skills/buildr/code-map/SKILL.md)负责，事实变化后的相关表达由[当前知识维护（current-knowledge-maintenance）](../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md)组织核对。这里说明专业方法，不声称每个历史文件都由这些方法产生。


## 这个主题的成果文件

这些文件解释事实；上面的规范与代码提供事实依据。点击文件先看说明，再看原文。

- `knowledge/` — 本主题知识成果
  - `docs/architecture/`
    - [project-service-repositories.md](../docs/architecture/project-service-repositories.md) — 当前架构文章
  - `code-map/`
    - [project-service-repositories.md](project-service-repositories.md) — 当前规范与实现地图
  - `archify/flows/`
    - [project-service-repositories.json](../archify/flows/project-service-repositories.json) — 可维护的关系图源
    - [project-service-repositories.html](../archify/flows/project-service-repositories.html) — 原生图示展示
    - [project-service-repositories.md](../archify/flows/project-service-repositories.md) — 图示依据与表达限制
