## Why

工作空间（Workspace）缺少帮助人理解整体组成的入口；现有界面原型（UI Prototype）主要依靠重新书写页面，容易偏离正式界面的交互。本次临时演示把已有的单选即关联改成多选确认面板，说明仅要求外观相似不足以保证一致性，需要让正式页面与演示页面复用同一份组件（Component）源码，并把这种方法沉淀为持续可发现的技能（Skill）。

## What Changes

- 增加“工作空间总览”，用简洁的业务说明和已登记引用展示项目（Project）、服务（Service）与代码库实例（Repository Instance）；具体项目保留现有概览，补充其服务与代码的组成视图。列表继续承担查找和管理，保留搜索、聚焦与关联高亮，不加入复杂图编辑或统计面板。
- 新增可选的前端开发技能（Frontend Development Skill），指导智能体（Agent）发现已有能力、按职责组织页面与交互、统一样式来源、分离真实副作用，并维护可复用的关键示例。适配项目既有框架，不要求全量重构或过度拆分。
- 优化 `ui-prototype`：默认只制作关键页面和必要状态；优先使用真实组件（Component）与主题，替换数据及操作实现；允许在隔离位置制作候选实现与独立预览构建，交付离线自包含 HTML，保持明确选择和安全隔离。
- 任务方案设计左侧菜单直接列出关键页面；说明复用“实施清单”的临时查看、关闭和固定阅读方式。“单独查看”打开新页签，保留页面列表、画面、说明三栏；移除扩大阅读和手动缩放控件，自动适应可用宽度。
- 首个落地样例复用已有资源选择器，并将侧边阅读行为提取为共用能力；原型与正式页面使用同一源模块，模拟操作不得调用真实接口（API）。
- **BREAKING（受限于原型交付约定）**：新版本“单独查看”进入受信任阅读页，而非直接打开裸 HTML；明确放开旧技能（Skill）禁止编码式原型的笼统限制。旧发现标记、旧 HTML 阅读、任务关联和安全隔离保持兼容，不迁移业务登记数据。

## Capabilities

### New Capabilities

- `workspace-overview`: 工作空间总览及具体项目的组成视图，明确对象进入方式、局部失败和引用边界。
- `frontend-development`: 前端开发技能（Skill）的发现、源码复用、模拟操作与一致性检查方法。

### Modified Capabilities

- `ui-prototype`: 关键页面范围、源码复用、可独立交付、逐页说明和验证要求。
- `product-agent-skills`: 新技能（Skill）的可选随包交付，以及已有原型技能（Skill）的允许范围调整。
- `buildr-web-client`: 原型页面菜单、统一侧边阅读、独立阅读入口及最小安全内容协议。

## Impact

- 前端：`services/buildr-web/src/features/task/`、`features/project/`、`features/workspace/`、`components/` 和 `app/` 中实际涉及的入口及共享展示职责。
- 后端：`services/buildr/src/modules/openspec/application/change-query.ts` 附近的原型发现与只读返回；工作空间模块补充按来源隔离失败的轻量只读组成查询；沿用任务限定的读取来源，不新增任意路径读取或真实执行能力。
- 工作资产：`services/buildr/resources/workspace/skills/buildr/ui-prototype/`、新增 `frontend-development/`、`resources/manifest.yml` 及对应交付检查。只改唯一源资产，不手改运行投射。
- 工具：利用项目现有构建工具形成独立演示入口；不预先引入新的组件平台、全局状态仓库或专用 Buildr 原型命令。
- 当前知识：实施时按实际变化校准任务系统说明、技能体系说明和相关代码地图（Code Map）。引用关系模型保持不变，其知识说明以核对为主。
- 用户已确认按本方案实施，范围包括两个技能（Skill）、原型阅读与真实总览。当前不提交、不推送、不发布、不安装或激活。
