# Design: remove-daily-progress

## 关键取舍

- **整体删除而非停用**：用户明确不需要该能力，保留隐藏开关或死代码只会继续维护规范、测试与界面成本，故整链路移除；未来需求按归档历史与 git 历史重新设计。
- **动态页随能力一起移除**：统一“动态”页的唯一内容是项目每日演进，能力删除后该页签没有独立来源，故工作台导航回到“概览/任务”。
- **不触碰用户本机数据**：`.buildr/daily-progress/` 是机器本机 YAML，产品停止读写并移除 gitignore 模板条目；不主动删除已生成文件，也不新增清理动作。
- **历史保留**：已归档 OpenSpec changes、CHANGELOG 与 git 历史不改写，作为日后重新设计的参考材料。

## 兼容策略

- CLI：三个 `project daily-progress` 命令及 `WORKSPACE_DAILY_PROGRESS_COMMAND_SLOT` 分组占位一并移除；根帮助不再出现该域。
- HTTP：Project/Task 每日演进只读路由与 workbench activity 读取接口移除；`buildr.workbench/v1` 响应去掉 `dailyProgress` 字段（Web 客户端同版本同步移除，属于本机同源协议，不构成跨版本承诺）。
- Web：`features/project-daily-progress/`、动态页路由 `activity`、项目详情“项目动态”入口、工作台概览每日演进区块、Agent 抽屉 `daily-progress` 动作一并删除；`workspace-pages.ts` 中旧 `document=daily` 重定向逻辑移除。
- SQLite：每日演进不使用 SQLite，`0033_add_daily_workbench.sql` 属工作台偏好迁移，保留不动。
- gitignore：模板与 init/sync 注入逻辑移除 `/.buildr/daily-progress/` 条目；对既有 workspace，忽略条目随下次 sync 生成的新模板自然消失，不做强制改写既有文件的专项迁移（文件本身仍被通用 `.buildr` 规则覆盖与否以 workspace 实际 gitignore 为准，是安全的）。

## 迁移风险

- 验证登记（verification registry/ownership/dispositions）中 `integration-project-daily-progress` 切片删除后，受影响测试选择器不得再引用不存在的文件；契约测试中模块清单、HTTP 贡献清单、CLI 目录同步更新。
- 验证输入读取器对 Git 已跟踪但工作树中已删除的文件必须保留 `absent` 身份而不再读取其正文，避免删除测试文件时验证入口在执行前以 `ENOENT` 失败。
- `public-json.ts` 登记的六个 `buildr.project-daily-progress-*/v1` identity 移除后，公共 JSON 契约测试同步删除对应断言。
- 前端 `workbench-dto` 生成类型随 schema 重新生成；web 侧 `WorkspaceResponse['dailyProgress']` 引用全部清除。
- 知识文档与代码地图中指向 daily-progress 的链接移除，避免死链；archify JSON/HTML 同步改文案。
- 当前 workspace 已投射的 `skills/buildr/project-daily-progress` 与 `skills/manifest.yml` 条目由交付后的正式 sync 处理，不在源码树中手改投射物。

## 验证口径

- 删除后全仓库 `grep` 不再存在每日演进的活跃引用（归档历史与 CHANGELOG 除外）。
- `services/buildr` 受影响测试（contract/system/integration/unit、verification registry 审计）与 `services/buildr-web` 测试通过；`npm run build` 与类型检查通过。
