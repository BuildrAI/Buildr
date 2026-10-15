## MODIFIED Requirements

### Requirement: 浏览器冒烟能力必须提供可诊断结果并渐进成熟
Buildr Product MUST 使用已明确准备的 Chrome/Chromium、随机 loopback 端口和独立临时工作空间（Workspace）执行浏览器验收（Browser Verification）。环境与稳定性未确认的新增范围 MUST 保持非阻断成熟度；已经明确声明为交付必需的范围 MUST 由真实执行及结果证明。成熟度与门禁调整 MUST 通过明确验证声明及相应规范变更（OpenSpec Change）表达，MUST NOT 由选择器（Selector）拆分自动推导。

#### Scenario: 浏览器环境可用
- **WHEN** 环境具备 Node、npm 和受支持的 Chrome/Chromium 可执行文件
- **THEN** 验证 MUST 自动创建隔离夹具（Fixture）、收集 `pageerror` 与 `console.error`、关闭浏览器及服务器并清理测试拥有的临时目录

#### Scenario: 浏览器环境不可用
- **WHEN** 无法解析或启动受支持的浏览器
- **THEN** 验证 MUST 明确失败或由编排标记为环境阻塞
- **AND** 验证器（Verifier）MUST NOT 静默下载浏览器、访问外部系统或回退操作真实工作空间（Workspace）；声明的环境准备可在验证开始前安装锁定浏览器

#### Scenario: 暂不更新测试声明
- **WHEN** 变更（Change）仅拆分浏览器选择器（Selector）、登记步骤和实现，没有明确调整验证范围或成熟度
- **THEN** `projects/product/verification.yml` MUST 保持内容不变
- **AND** 声明拆分、成熟度或门禁调整 MUST 等待明确决定并由相应规范变更表达

#### Scenario: 明确候选核心验收要求
- **WHEN** 验证声明及规范明确将候选压缩包（Candidate Tarball）的核心浏览器旅程（Browser Journey）纳入交付必需范围
- **THEN** 完整候选检查 MUST 执行该范围并使缺失或失败证据导致聚合失败
- **AND** 该决定 MUST NOT 被解释为全部页面选择器（Selector）或真实桌面都已验收

### Requirement: Browser verification 必须只读校验冻结的 web-dist
源码浏览器验收（Browser Verification）MUST 在系统临时目录使用当前 Buildr Web 源码与锁定依赖生成 staging dist，校验其普通文件集合、类型、资源闭包和生成物 manifest 后，让隔离 Buildr Web HTTP server 直接托管该 dist。候选产物验收 MUST 校验并消费唯一候选压缩包（Candidate Tarball）内的 `web-dist`，MUST NOT 从源码重新构建替代它。两种验收 MUST NOT 读取、比较、删除、覆盖或新增检出目录（Checkout）中的本地 `web-dist`；完成或失败后 MUST 只清理本次拥有的临时根。

#### Scenario: staging dist 与 tracked web-dist 一致
- **WHEN** 当前 Buildr Web 源码成功生成闭合且可验证的 staging tree
- **THEN** 源码浏览器验收（Browser Verification）MUST 使用该 tree 启动生产托管检查
- **AND** 完成或失败后 MUST 清理测试拥有的 staging root 并保持 Git tree 不变

#### Scenario: Web source 与 tracked web-dist 漂移
- **WHEN** staging build 失败、包含不支持的 entry、缺少入口或资源，或 manifest 与实际 bytes 不同
- **THEN** 源码浏览器验收（Browser Verification）MUST 在启动 Chrome 前失败并报告有界构建诊断
- **AND** MUST NOT 回退到本地 `web-dist`、历史产物或 Vite dev server

#### Scenario: checkout存在陈旧本地web-dist
- **WHEN** ignored `services/buildr/web-dist` 存在与当前源码不一致的陈旧文件
- **THEN** 浏览器验收（Browser Verification）MUST 仍只托管本次隔离生成的 staging dist 或已校验候选压缩包内的 dist
- **AND** 陈旧本地输出 MUST 不影响结果且不得被验证过程修改

#### Scenario: 候选产物已冻结
- **WHEN** 候选压缩包（Candidate Tarball）的来源、完整性与网页载荷身份均已校验
- **THEN** 候选浏览器验收（Browser Verification）MUST 直接托管该载荷并保留输入身份
- **AND** MUST 不依赖前端源码树、Vite dev server 或重新构建网页

### Requirement: Buildr Browser verification必须消费声明的Web工具链准备
浏览器验收（Browser Verification）适用时，智能体（Agent）与项目入口 MUST 依据当前 `preparation.yml` 及真实输入核对依赖。源码 staging build MUST 在构建前确认实际 `buildr-web` 工作根的锁定依赖和项目本地 TypeScript executable；候选产物验收 MUST 直接消费已校验的冻结网页载荷，不要求源码工具链。验证 MUST NOT 借用全局 TypeScript、保留检出目录（Retained Checkout）的 `node_modules` 或未登记目录，MUST 不依赖已退役的 preparation reference、统一 Environment 状态或 preparation closure。

#### Scenario: Buildr Web本地工具链current
- **WHEN** 源码浏览器验收（Browser Verification）被选择且当前 `buildr-web` 工作根已具有匹配的本地依赖
- **THEN** staging build MUST 从实际工作根解析项目本地 TypeScript 与 Vite
- **AND** 浏览器前置检查（Browser Preflight）通过后才能构建 staging dist 和启动 Chrome

#### Scenario: 只有全局TypeScript可用
- **WHEN** 源码验收所需的 Buildr Web 本地依赖缺失，但系统 PATH 存在另一版本 TypeScript
- **THEN** 源码浏览器验收（Browser Verification）MUST 在构建前报告当前工作根依赖缺口并指向项目准备入口
- **AND** MUST 不使用全局 TypeScript 继续执行或把版本差异报告为页面失败

#### Scenario: Browser capability不适用
- **WHEN** changed target 没有选择浏览器检查
- **THEN** MUST 不为该检查安装 Buildr Web 依赖、构建 staging dist 或启动 Chrome
- **AND** 其他适用检查的真实依赖 MUST 由各自入口处理

#### Scenario: 候选浏览器无需源码构建
- **WHEN** 候选产物验收使用已校验的压缩包网页载荷
- **THEN** 准备入口 MUST 提供验收运行时（Runtime）及明确浏览器环境
- **AND** MUST NOT 为替代该载荷而安装前端构建依赖或重新构建
