## 1. 插件包名、元数据与双插件互切修复

- [x] 1.1 将 Harness 与 Development DSH 开发插件包名统一为 `@buildr-ai/dsh-buildr-harness-dev` 与 `@buildr-ai/dsh-buildr-development-dev`
- [x] 1.2 为两插件补齐 `src/metadata.ts`、`locale/en.json`、`locale/zh.json`、`icon.svg` 及构建打包导出配置
- [x] 1.3 为四条通道分配独立 `main.conversation` 优先级并抽出 `src/panel-controller.ts` 修复同优先级冲突、订阅阻断与同步 `align()` 重入竞态
- [x] 1.4 在两个插件补充双插件互切与产物元数据单元测试并全部通过

## 2. 自举迁移、规范文档与集成验证

- [x] 2.1 更新 `skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs`、`SKILL.md` 及 `component.yml` 完整性清单以支持旧开发包名平滑迁移
- [x] 2.2 更新 `self-bootstrap-closeout.test.ts` 与双插件 README、架构文档并跑通全部相关测试
- [x] 2.3 归档 OpenSpec 变更、提交推送并执行自举同步与收尾清理
