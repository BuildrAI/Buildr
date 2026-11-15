## MODIFIED Requirements

### Requirement: buildr-web 必须拥有 Buildr Web React/Vite 源码与构建

`buildr-web` Service MUST 是 Buildr Development 应用壳、业务页面及其前端构建的唯一权威位置。共享 Harness 对话交互及独立 Harness Web MUST 由独立明确的前端工程单元维护，Development MUST 消费其公开包与宿主适配，不保留并行对话实现。`product/buildr` Service MUST NOT 保留权威前端源工程根作为第二事实源。

#### Scenario: 前端源码所有权
- **WHEN** 维护者定位 Development 前端源码和共享 Harness 对话源码
- **THEN** Development 应用与业务源码 MUST 位于 `projects/product/services/buildr-web`，共享 Harness 功能 MUST 位于其登记工程单元
- **AND** MUST NOT 在 `projects/product/services/buildr/web` 或 Development feature 中保留第二份共享对话实现

#### Scenario: 前端构建产出静态资产
- **WHEN** 维护者或 CI 执行 Development 正式前端构建
- **THEN** 构建 MUST 组合匹配的 Harness 界面并产出可被 `buildr` 消费的静态资产
- **AND** 运行时 MUST NOT 要求 Vite、相邻前端源码或远程 CDN，独立 Harness Web 具有自己的正式静态产物

### Requirement: 前后端与项目级测试必须按证明对象维护

Development Web Service MUST 拥有业务前端与宿主适配测试；共享 Harness UI 与独立 Web 工程 MUST 拥有自身渲染、交互、状态和客户端测试；Harness 核心 MUST 拥有执行、数据、公开协议及共享服务测试，不要求调用 Development 私有测试入口。Development Service MUST 保留业务、认证代理、安装集成和本机宿主测试。真实跨服务流程 MUST 通过项目验证入口维护，每个断言 owner 唯一，不因两个产品而复制同一套测试。

#### Scenario: 运行前端与 Browser 验证
- **WHEN** 本次拆分运行前端检查和生产托管浏览器 E2E
- **THEN** 各前端测试 MUST 从其真实所属单元执行，组合 E2E MUST 使用对应产品正式静态产物
- **AND** MUST 分别覆盖独立入口和 Development 集成，不以开发服务器通过替代生产托管验收

#### Scenario: 独立验证 Harness 包
- **WHEN** 在没有 Development 源码的 Harness 包消费环境中检查公开行为
- **THEN** Harness MUST 能通过自己的稳定入口验证核心与前端交付，不读取相邻 `buildr/test` 或私有生成物
- **AND** 组合测试 MUST 另行证明 Development 集成，不能用独立测试冒充
