## MODIFIED Requirements

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

### Requirement: 前后端与项目级测试必须按证明对象维护

Development MUST 拥有工程页面和网页嵌入集成测试；Harness Web MUST 拥有完整对话渲染、交互、状态与客户端测试；Harness 核心 MUST 拥有执行、数据、公开协议和独立入口测试。跨产品安装与组合 MUST 使用准确产品负载，不复制测试实现或用源码检查代替安装验收。

#### Scenario: 验证独立与嵌入形态
- **WHEN** 运行本次边界重构验证
- **THEN** 测试 MUST 分别核对完整 Harness 网页、Development 的 iframe 集成及真实安装包消费

#### Scenario: 运行前端与 Browser 验证
- **WHEN** 对两产品执行网页验证
- **THEN** 检查 MUST 从真实所属产品入口运行，分别验证完整 Harness 网页及 Development 集成；局部检查不代替跨产品或真实模型验收
