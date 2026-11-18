# buildr-web-service Specification

## Purpose

Product 下 `buildr-web` Service 的登记、源码根、React/Vite 所有权，以及向 `buildr` 交付可托管静态构建产物的交接边界。

## Requirements

### Requirement: Product 必须登记同代码库服务 buildr-web
Buildr Product Project MUST 通过工作空间（Workspace）根 `projects/manifest.yml` 的 `serviceIds` 引用全局 `services/manifest.yml` 中的 `buildr-web` 服务（Service）。该服务 MUST 通过 `repositoryId` 引用与 `buildr` 相同的代码库实例（Repository Instance），且 `modulePath` MUST 等于 `projects/product/services/buildr-web`；代码库来源 MUST 由根 `repositories/manifest.yml` 登记，不在服务重复保存 `source`。`buildr-web` MUST NOT 要求独立 Git 远端（Remote）或虚构独立服务 Git 状态。旧项目内 `buildr.services/v2` 清单继续按兼容边界读取，不替代全局模型。

#### Scenario: 从全局关系读取 Product 的 buildr-web
- **WHEN** 命令行接口（CLI）、诊断（Doctor）或本机应用从全局关系视图读取 Product Project 引用的服务（Service）
- **THEN** 清单 MUST 返回 `code` 为 `buildr-web` 的服务（Service）
- **AND** 服务 MUST 通过 `repositoryId` 引用实际共享的代码库实例（Repository Instance），且 `modulePath` 为 `projects/product/services/buildr-web`
- **AND** 实际代码位置 MUST 从该实例的 `source` 与服务的 `modulePath` 组合解析

#### Scenario: 定位 buildr-web 资产
- **WHEN** Application 通过 Service metadata 定位 `product/buildr-web`
- **THEN** 对应目录 MUST 存在并包含 Buildr Web 前端工程与 Service 级说明（如 `AGENTS.md`）
- **AND** Project root MUST NOT 将前端源码工程声明为第二份 package root 与 `buildr` 重叠

### Requirement: buildr 必须在构建或打包时消费 buildr-web 产物并继续同源托管
`buildr` Buildr Web HTTP interface MUST继续通过loopback同源托管正式Buildr Web静态产物。开发构建 MAY把`buildr-web`输出物化到精确ignored的sibling `buildr/web-dist/`；Browser和Candidate/打包步骤 MUST接受显式隔离输出目标并消费本次matching生成物，不得要求Git tracked `web-dist`。运行已安装npm package、Launcher或仅含dist的环境时，主机 MUST NOT要求`buildr-web`源码树存在。

#### Scenario: 构建交接写入可证明托管路径
- **WHEN** 维护者执行本地可启动Buildr Web开发构建
- **THEN** 步骤 MAY将静态产物置于ignored `buildr/web-dist/`
- **AND** Buildr Web HTTP MUST能从该路径服务shell并注入本机session meta
- **AND** 构建 MUST不改变Git tracked/index状态

#### Scenario: Candidate构建交接到隔离暂存
- **WHEN** Candidate或Browser owner为Buildr Web构建提供显式输出目录
- **THEN** Vite MUST把静态资产写入该目录并返回可枚举的matching生成物
- **AND** 下游 MUST只消费该输出，不扫描或回退到checkout本地dist

#### Scenario: 无 buildr-web 源码仍可打开已打包应用
- **WHEN** 环境仅有已包含Web dist的`buildr` package或Launcher bundle
- **THEN** Buildr Web MUST仍可通过loopback HTTP打开
- **AND** MUST NOT依赖`projects/product/services/buildr-web`、Vite或TypeScript在运行时存在

### Requirement: buildr-web 必须拥有 Buildr Web React/Vite 源码与构建

系统 MUST 将 Development 工程网页维护在 buildr-web，以 harness-ui 功能模块准备工程上下文、选择工作空间、嵌入完整 Harness 网页和维护对话任务关联。Development MUST NOT 导入 Harness 对话 React 组件或拥有对话执行状态机。Development 安装包 MUST 携带所需的完整网页产物，不依赖相邻源码或 Vite 服务。

#### Scenario: 安装包独立运行
- **WHEN** 用户从不含相邻源码的 Development 安装包打开对话
- **THEN** 内嵌网页 MUST 从安装负载取得完整 Harness 页面，认证与静态资源不依赖源码树

#### Scenario: 前端源码所有权
- **WHEN** 维护者定位工程网页及 Harness 对话源码
- **THEN** Development 工程代码 MUST 位于 buildr-web，完整对话 MUST 位于 buildr-harness-web；Development 的 harness-ui 只拥有网页嵌入与工程集成

#### Scenario: 前端构建产出静态资产
- **WHEN** 构建或安装两个产品
- **THEN** Harness Web MUST 有独立完整生产静态产物，Development MUST 携带所用准确产物并同源嵌套；运行不依赖 Vite、相邻源码或远程 CDN

### Requirement: Workspace、Project、Service 前端必须按领域独立组织
Buildr Web MUST让Workspace、Project、Service分别拥有独立前端Feature。每个Feature MUST拥有本领域路由页面、页面局部组件和确有复杂状态的Hook；公共`pages/`与`components/` MUST NOT继续保存这些领域的第二份页面或局部组件。Workspace、Project、Service客户端 MUST归属各自Feature且每个业务请求只保留一个实现；`src/api/` MUST只提供共享传输、会话与请求上下文。

#### Scenario: 路由装配三个领域页面
- **WHEN**`App.tsx`装配Workspace、Project和Service路由
- **THEN**每个页面入口 MUST来自对应领域Feature
- **AND**公开路由路径、稳定DOM钩子与可见行为 MUST保持不变

#### Scenario: 判断是否抽取Hook
- **WHEN**页面包含多阶段请求、导航历史或多个相互约束的状态
- **THEN**实现 MUST在页面内方法、页面内Hook、独立领域Hook或真实共享Hook之间按阅读成本和复用范围选择，不要求每个Hook独立文件
- **AND**职责和体量可维护的小页面 MUST NOT仅为目录对称建立空Hook或统一CRUD抽象

#### Scenario: Project与Service浏览Markdown文档
- **WHEN**Project和Service详情维护相同的文档加载、路径、历史、返回与错误状态
- **THEN**两个领域 MUST共享同一Markdown文档导航Hook
- **AND**领域请求URL、Tab、缺失文案、事实展示和DOM身份 MUST继续由所属页面拥有

#### Scenario: Project独立组合领域功能
- **WHEN**Project详情组合独立领域功能
- **THEN**对应能力 MUST保持独立Feature并由Project详情组合
- **AND**MUST NOT并入Project CRUD Hook或提升为无领域语义的通用组件

### Requirement: Buildr Web 剩余页面必须按完整功能归位
Buildr Web MUST将 Publication 页面与能力级 client 归入 `features/publication`，将工作空间 Settings 归入 `features/workspace`、Release Awareness 归入 `features/installation`，将 Task-scoped Change 页面归入 `features/task`。`src/pages` MUST不再长期保存已有明确功能 owner 的页面；App 壳 MUST只拥有路由、布局、导航、Workspace 上下文与跨页抽屉装配。

#### Scenario: 扫描前端路由与依赖
- **WHEN** 前端架构验证扫描 `App.tsx`、`app`、`features`、`api` 与 `pages`
- **THEN** 每个业务页面 MUST从所属 feature 导入
- **AND** 通用 `api` MUST只保留 transport/session/workspace state 或尚无 feature owner 的公共边界
- **AND** 页面路由、URL、文案语义与稳定 DOM `id`/`data-*` MUST保持兼容

#### Scenario: 壳层显示版本提醒
- **WHEN** Release Awareness 返回可提示更新
- **THEN** Installation feature MUST拥有数据读取、命令文案和交互组件
- **AND** App 壳 MUST只装配该组件，不得取得 update writer 或第二份安装状态

### Requirement: 前后端与项目级测试必须按证明对象维护

Development MUST 拥有工程页面和网页嵌入集成测试；Harness Web MUST 拥有完整对话渲染、交互、状态与客户端测试；Harness 核心 MUST 拥有执行、数据、公开协议和独立入口测试。跨产品安装与组合 MUST 使用准确产品负载，不复制测试实现或用源码检查代替安装验收。

#### Scenario: 验证独立与嵌入形态
- **WHEN** 运行本次边界重构验证
- **THEN** 测试 MUST 分别核对完整 Harness 网页、Development 的 iframe 集成及真实安装包消费

#### Scenario: 运行前端与 Browser 验证
- **WHEN** 对两产品执行网页验证
- **THEN** 检查 MUST 从真实所属产品入口运行，分别验证完整 Harness 网页及 Development 集成；局部检查不代替跨产品或真实模型验收
