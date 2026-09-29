# Buildr 全项目代码地图

从项目总树进入服务，再进入模块、文件与方法。下列树描述当前实现；`…` 只省略同类文件。手工源码、工程程序、生成结果与本机业务数据有不同责任。

## 项目总树

```text
projects/product/                         项目（Project）：跨服务产品责任
├── README.md                             产品与开发入口
├── AGENTS.md                             项目规则
├── .node-version                         声明开发 Node 版本（接受下限与供给锚点）
├── buildr                                薄开发入口，委托 services/buildr
├── capabilities.yml                      项目能力声明
├── commands.yml                          项目命令需求
├── preparation.yml                       准备入口、位置与范围
├── verification.yml                      测试体系、选择方法与证明范围
├── openspec/
│   ├── specs/                            当前规范承诺
│   └── changes/                          变更方案、清单与历史归档
├── docs/publications/                    已发表文章与配图，属于产品内容数据
├── knowledge/                            三类当前成果，不是第二规范
│   ├── README.md                         保留首页旧链接的短导航
│   ├── code-map/                         本地图：树、对象、方法、调用
│   ├── archify/                          技术图源与可查看成果
│   └── docs/                             面向人的当前产品与技术解释
│       ├── overview.md                    产品概览
│       ├── glossary.md                    术语与语义边界
│       ├── architecture/                  产品、技术和专题架构
│       ├── reference/                     数据格式与工具接入参考
│       ├── flows/                         跨对象流程
│       └── guides/                        使用、开发与运行入口
└── services/
    ├── manifest.yml                      服务登记
    ├── buildr/                           命令行、后端、本机网页宿主与主包
    ├── buildr-web/                       React 页面和前端交互
    └── dsh-plugin/                       独立 DSH 桌面插件源码与候选
```

[关系维护与代码定位](project-service-repositories.md)连接对象约束、登记读取、应用写入与前端操作。

## 逐层阅读

[知识建设与维护](knowledge-maintenance.md)从工作方法、读取与页面、成果位置三个职责区解释实际文件。

1. [服务、工程目录与功能定位](system-services-assets.md)：三个服务的目录、生成与打包职责，以及从用户能力定位实现。
2. [模块内部目录树与对象](technical-layers.md)：领域、应用、数据访问、技术实现和接口如何协作。
3. [调用、数据与副作用](../docs/architecture/technical.md)：谁发起调用、谁拥有数据和写入。

对应技术图：[系统总览](../archify/system/buildr-system-overview.html)、[调用与数据责任](../archify/flows/capability-data-responsibility.html)。

## 代码落位判断

- 任务、登记或资产规则：所属模块的领域模型（Domain）或应用服务（Application）。
- 业务数据存取：所属数据访问（Persistence）；通用文件、进程和事务才放基础设施（Infrastructure）。
- 解析命令或请求并转换结果：所属接口入口（Interface）。
- 创建对象和依赖：对象装配（Composition），以 `module.ts` 和 `bootstrap/` 为入口。
- Buildr 自身构建、生成、包检查：`tools/`；测试案例及选择执行：`test/`。
- 普通生成结果：服务 `build/`；前端构建兼后端托管产物：`buildr/web-dist/`。两者均被 Git 忽略，发布时仍包含运行必需内容。

每日演进属于 `task/daily-progress/`，当前单机版以 Git 提交为主再关联本地任务；未来企业版任务主导汇总不是当前实现。

## 有界模块地图

- [项目与服务测试验证框架](verification-framework.md)：Buildr 提供的测试建设方法、项目地图与任务报告；产品自身的实现另见[采用实例工具地图](product-verification-tools.md)。

- [任务系统](task-system.md)：工作台（Workbench）、人机答复、任务及专业事实、工作位置、交付与自举执行器。
- [技能源文件到可发现入口](skill-projection.md)：解析、组合、计划、受管写入与数据归属；关联技术图和解释文档。
- [阅读目录](../docs/README.md)：从当前问题选择说明、地图或图示。

## 按问题找图

图示解释关系，正文解释结论，代码与规范提供依据。Buildr 可以打开已登记图示；GitHub 上的 HTML 需下载后在浏览器打开，数据库图也提供可直接查看的矢量版本。

| 想理解什么 | 图示 | 依据与图源 |
| --- | --- | --- |
| 系统由哪些部分组成 | [系统全景](../archify/system/buildr-system-overview.html) | [图源](../archify/system/buildr-system-overview.json) · [技术正文](../docs/architecture/technical.md) |
| 谁调用、谁写入数据 | [调用与副作用](../archify/flows/capability-data-responsibility.html) | [图源](../archify/flows/capability-data-responsibility.json) · [技术正文](../docs/architecture/technical.md) |
| 业务目标怎样连接代码 | [项目、服务与代码库](../archify/flows/project-service-repositories.html) | [图源](../archify/flows/project-service-repositories.json) · [依据](../docs/architecture/project-service-repositories.md) |
| 方法怎样交给工具 | [技能投射](../archify/flows/skill-projection.html) | [图源](../archify/flows/skill-projection.json) · [依据](skill-projection.md#节点与关系的依据) |
| 工作怎样推进与交付 | [任务总图](../archify/flows/task-system.html) | [图源](../archify/flows/task-system.json) · [依据](task-system.md#任务图的来源与表达边界) |
| 父任务怎样确认完成 | [父任务完成](../archify/flows/task-parent-coordination.html) | [图源](../archify/flows/task-parent-coordination.json) · [依据](task-system.md#任务图的来源与表达边界) |
| Buildr 怎样采用自身更新 | [自举与善后](../archify/flows/task-self-bootstrap.html) | [图源](../archify/flows/task-self-bootstrap.json) · [依据](task-system.md#自举图的适用条件) |
| 数据分别保存在哪里 | [数据领域](../archify/data/buildr-data-domains.html) | [图源](../archify/data/buildr-data-domains.json) · [依据](../docs/architecture/buildr-data-design.md) |
| 数据库表怎样关联 | [表与字段](../archify/data/workspace-sqlite-erd.html) · [矢量图](../archify/data/workspace-sqlite-erd.svg) | [Graphviz 图源](../archify/data/workspace-sqlite-erd.dot.txt) · [依据](../docs/architecture/buildr-database-tables.md#14-维护与验收边界) |
| 知识怎样随工作维护 | [知识职责](../archify/flows/knowledge-maintenance.html) | [图源](../archify/flows/knowledge-maintenance.json) · [依据](knowledge-maintenance.md#职责图怎样对应这张地图) |
| 怎样建设与选择检查 | [测试与验证](../archify/flows/verification-framework.html) | [图源](../archify/flows/verification-framework.json) · [依据](verification-framework.md#测试图的主线与分支) |

图源和展示成对维护；只有关系变化时才重新生成。图的来源与表达边界直接维护在本表链接的正文或地图，不另写一份依据。
