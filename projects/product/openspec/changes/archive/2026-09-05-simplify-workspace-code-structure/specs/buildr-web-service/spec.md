## MODIFIED Requirements

### Requirement: Workspace前端必须按独立领域Feature组织
Buildr Web MUST让Workspace、Project、Service分别拥有独立前端Feature。每个Feature MUST拥有本领域路由页面、页面局部组件和确有复杂状态的Hook；公共`pages/`与`components/` MUST NOT继续保存这些领域的第二份页面或局部组件。共享HTTP Client MAY保持在`src/api/workspace.ts`，但MUST NOT被按领域复制。

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

#### Scenario: Project Daily Progress组合
- **WHEN**Project详情展示每日演进
- **THEN**Daily Progress MUST保持独立Feature并由Project详情组合
- **AND**MUST NOT并入Project CRUD Hook或提升为无领域语义的通用组件
