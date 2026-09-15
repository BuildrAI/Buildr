# Archify 可选组件（Component）

Archify 用于创建架构、流程、时序、数据流和状态图。Buildr 随包提供固定版本的完整技能（Skill）目录，通过既有组件（Component）能力管理安装、更新和卸载，默认不启用。

## 来源

- 上游仓库：[tt-a1i/archify](https://github.com/tt-a1i/archify)。
- 上游版本：`2.16.0`；Buildr 组件（Component）版本：`2.16.0+buildr.1`。
- 正式发行包：[archify.zip](https://github.com/tt-a1i/archify/releases/download/v2.16.0/archify.zip)。
- 发行包 SHA-256：`4c59fa6557a2385beaaef8c7219cc414573acc9f0c30a932d5053b0b20689a46`。
- 原始内容位于 `resources/workspace/skills/buildr/archify/assets/archify/`，完整保留 MIT 许可证、上游正文和程序。没有从个人安装目录复制缓存或依赖。

## 使用

在目标工作空间（Workspace）调用：

```bash
buildr component list --target <workspace> --json
buildr component install archify --agent <agent> --target <workspace>
buildr component check archify --target <workspace> --json
buildr component uninstall archify --agent <agent> --target <workspace>
```

安装会写入 `skills/buildr/archify/` 及当前智能体运行时（Agent Runtime）的技能（Skill）目录。Codex 对应 `.agents/skills/archify/`；在该目录读取 `SKILL.md`，按入口指引使用随附 `assets/archify/bin/archify.mjs`。上游要求 Node.js 18 或以上，基础渲染无需另装依赖；浏览器截图按上游说明使用本机浏览器。

JSON、HTML 和截图由使用者保存到实际项目目录。安装不生成图、不启动浏览器、不安装全局命令；卸载不删除项目图。存在用户级同名技能（Skill）时，沿用 Buildr 所有权检查，先明确选择和处理已有安装，不自动覆盖、接管或删除。

## 更新

维护者选择新的上游正式发行包，核对来源、摘要及许可证，整体替换产品源目录并更新组件（Component）版本和成员摘要，验证安装、升级、卸载及绘图后随 Buildr 交付。用户通过 Buildr 同步获得已选择组件（Component）的新版本；已卸载状态继续保留。不要直接修改工作空间（Workspace）副本或生成目录。上游更新通知不表示受管版本已更新。
