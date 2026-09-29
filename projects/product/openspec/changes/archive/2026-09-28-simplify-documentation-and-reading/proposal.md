## Why

首版前的完整文档审查已发现重复正文、失效的执行依据，以及正常 Markdown 在阅读器中失去换行和导航的问题。按用户已确认的审查结论完成剩余修改，让人从少量入口理解产品，让智能体（Agent）读取同一权威事实；公开首页保持不变。

## What Changes

- **BREAKING** 删除 `bootstrap-guide.md` 与 `buildr bootstrap guide`；既有安装说明、产品技能（Skill）和命令帮助承接必要依据，不增加替代命令。
- 合并图示依据与已有技术说明，保留独有的设计理由；精简默认阅读路径与任务协作说明，保留仍被首页引用的短导航。
- 用现有 `buildr help assets` 解释合法输入、版本约束与最小示例，校准旧初始化指导。
- 修复代码块换行和复制、受控本地图片与实际文内链接、片段导航、宽表及副屏阅读；说明搜索和数量口径。Mermaid 保留源码、明确未渲染并提供原文入口。
- 校准自举规范、项目规则模板与 OpenSpec 组合指引；合并两份冗余技能参考，保留唯一职责和安全边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `human-agent-onboarding`：退役 guide，依据现有技能、安装资料及帮助完成首次工作。
- `buildr-package-assets`：随包资源与校验不再要求 guide；保留产品技能检查。
- `agent-task-workflows`：移除 guide 兜底与已失效的全局诊断前置。
- `workspace-first-runtime-projection`、`root-organization-workspace`、`npm-cli-package`、`cli-product-surface`：清理 guide 的公开交付或命令承诺。
- `project-knowledge-browsing`：保留正文语义、实际链接、安全读取和明确检索范围。
- `agent-first-product-positioning`：区分请求实际内容与上下文窗口容量，沿用已有术语表。
- `task-environments`：允许直接工作不等于跳过既有默认隔离策略。
- `buildr-cli-self-update`、`task-closeout-orchestration`：与现有默认 npm 安装和独立自举执行事实一致。

## Impact

影响产品源文档、知识索引、随包资源、初始化及命令帮助、共享阅读器和受控知识读取。无新依赖、无新文档管理系统、不重写历史规范、不更改首页或既有用户数据。已有安装与同步操作保留；旧 guide 命令按未知命令返回，发布产物不含该文件。
