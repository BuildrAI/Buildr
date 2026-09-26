## MODIFIED Requirements

### Requirement: 默认 UI Prototype 必须交付一个或多个完整自包含页面
默认 `ui-prototype` 技能（Skill）MUST 按任务范围选择关键页面与必要状态，默认不为每个小改动单独制页；MUST 优先复用相关真实组件（Component）和主题源码，使用模拟数据（Mock Data）及本地操作生成一个或多个可直接打开的自包含 HTML 页面。允许在隔离位置创建候选源码和独立预览构建，MUST 不把此授权推导为正式上线、真实写入或部署授权。每个页面 MUST 包含 `<!-- buildr:ui-prototype -->` 发现标记和用户可读 `<title>`，并 MUST 以内联或 data/blob 资源表达必要 CSS、JavaScript、图像、字体与媒体。即使需求只修改一个模块，页面也 MUST 在现有导航、页面框架和相关模块组成的完整页面上下文中呈现变化后的结果。

#### Scenario: 单页足以表达核心流程
- **WHEN** 一个完整页面及其本地状态切换足以表达本次 UI 变化
- **THEN** Skill MUST 生成至少一个完整原型页面
- **AND** MUST NOT 只交付孤立组件或截图

#### Scenario: 核心流程需要多个页面
- **WHEN** 核心流程跨越两个或以上页面，无法由单个页面的状态切换可靠表达
- **THEN** Skill MUST 生成多个分别带发现标记和标题的自包含 HTML 页面
- **AND** 每个页面 MUST 使用模拟数据且不得连接真实后端或执行真实写入

#### Scenario: 局部小改动
- **WHEN** 本次仅在关键页面内调整局部内容且用户未要求逐项制页
- **THEN** 技能（Skill）MUST 在相关完整页面与说明中体现变化，MUST NOT 为每处小改动重复生成页面

#### Scenario: 复用存在限制
- **WHEN** 相关源码不可可靠访问或真实副作用无法隔离
- **THEN** 技能（Skill）MUST 说明受影响范围，MUST NOT 用手写近似冒充同源复用或连接真实接口（API）补足演示


### Requirement: UI Prototype 必须经过浏览器验证并返回全部文件
技能（Skill）MUST 在浏览器中打开生成的每个 HTML 文件，并在实际任务阅读环境检查展示、核心交互、必要状态、当前说明和既有交互的一致性；MUST 返回全部实际文件、来源观察及逐页验证范围。任何无法验证的交互或状态 MUST 明确列为边界。

#### Scenario: 多个原型页面验证成功
- **WHEN** 多个原型页面及其核心交互在浏览器中正常工作
- **THEN** Skill MUST 返回全部原型文件及逐页验证摘要
- **AND** 后续设计师或 Agent MUST 能直接打开每个完整 HTML

#### Scenario: 浏览器验证不完整
- **WHEN** 浏览器能力、页面脚本或环境限制使部分页面或核心交互无法验证
- **THEN** Skill MUST 报告未验证范围
- **AND** MUST NOT 将全部文件描述为已完整验证

## ADDED Requirements

### Requirement: 关键页面说明与源码来源可以独立接续
新生成的原型 MUST 提供关键页面、必要状态、本次变化、主要功能、操作结果及边界的对应说明，并保持当前画面和说明一致。原型 MUST 记录可追溯的源码观察与已验证范围；自包含成果 MUST 能在离线安全隔离中独立展示，MUST NOT 依赖开发服务器、真实网络、父页面权限或浏览器持久存储。

#### Scenario: 说明随页面变化
- **WHEN** 用户从目录或原型交互进入另一已制作的关键页面或状态
- **THEN** 对应说明 MUST 与当前画面一致，重看指定画面 MUST 使用明确初始数据

#### Scenario: 交给后续智能体
- **WHEN** 后续智能体（Agent）读取本次演示成果
- **THEN** MUST 能确定覆盖的关键页面、来源观察、模拟边界和未验证项；成果 MUST 不替代正式行为规范
