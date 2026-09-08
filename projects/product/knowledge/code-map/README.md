# Buildr 全项目代码地图

从项目总树进入服务，再进入模块、文件与方法。下列树描述当前实现；`…` 只省略同类文件。手工源码、工程程序、生成结果与本机业务数据有不同责任。

## 项目总树

```text
projects/product/                         项目（Project）：跨服务产品责任
├── README.md                             产品与开发入口
├── AGENTS.md                             项目规则
├── .node-version                         固定开发 Node 版本
├── buildr                                薄开发入口，委托 services/buildr
├── capabilities.yml                      项目能力声明
├── commands.yml                          项目命令需求
├── preparation.yml                       准备入口、位置与范围
├── verification.yml                      测试体系、选择方法与证明范围
├── openspec/
│   ├── specs/                            当前规范承诺
│   └── changes/                          变更方案、清单与历史归档
├── docs/                                 产品解释、设计理由和维护说明
├── knowledge/                            当前实现认知，不是第二规范
│   ├── overview.md                       当前产品概览
│   ├── glossary.md                       术语与语义边界
│   ├── architecture/                     当前产品、技术和验证架构
│   ├── services/                         各服务职责
│   ├── flows/                            跨对象流程
│   ├── code-map/                         本地图：树、对象、方法、调用
│   └── archify/                          基于相同事实的交互技术图
└── services/
    ├── manifest.yml                      服务登记
    ├── buildr/                           命令行、后端、本机网页宿主
    └── buildr-web/                       React 页面和前端交互
```

## 逐层阅读

1. [服务与工程目录树](system-services-assets.md)：两个服务每一级目录放什么、生成什么、谁负责打包。
2. [功能与模块索引](modules.md)：从用户能力定位后端模块与前端功能。
3. [模块内部目录树与对象](technical-layers.md)：领域、应用、数据访问、技术实现和接口如何协作。
4. [调用、数据与副作用](calls-data-effects.md)：谁发起调用、谁拥有数据和写入。

对应技术图：[系统总览](../archify/system/buildr-system-overview.html)、[调用与数据责任](../archify/flows/capability-data-responsibility.html)。

## 代码落位判断

- 任务、登记或资产规则：所属模块的领域模型（Domain）或应用服务（Application）。
- 业务数据存取：所属数据访问（Persistence）；通用文件、进程和事务才放基础设施（Infrastructure）。
- 解析命令或请求并转换结果：所属接口入口（Interface）。
- 创建对象和依赖：对象装配（Composition），以 `module.ts` 和 `bootstrap/` 为入口。
- Buildr 自身构建、生成、包检查：`tools/`；测试案例及选择执行：`test/`。
- 普通生成结果：服务 `build/`；前端构建兼后端托管产物：`buildr/web-dist/`。两者均被 Git 忽略，发布时仍包含运行必需内容。

每日演进属于 `task/daily-progress/`，当前单机版以 Git 提交为主再关联本地任务；未来企业版任务主导汇总不是当前实现。
