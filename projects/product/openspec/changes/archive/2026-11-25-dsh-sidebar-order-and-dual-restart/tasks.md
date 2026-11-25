# Tasks: dsh-sidebar-order-and-dual-restart

- [x] 1.1 调整 `buildr-harness-dsh-plugin/src/channel.ts` 中 `ORDER` 为 `released ? 4 : 5`
- [x] 1.2 调整 `buildr-development-dsh-plugin/src/channel.ts` 中 `ORDER` 为 `released ? 6 : 7`
- [x] 1.3 更新 `buildr-harness-dsh-plugin/test/panel-switching.test.ts` 增加双插件侧栏排序断言，并更新 `buildr-development-dsh-plugin/test/desktop-acceptance.md`
- [x] 2.1 升级 `skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs` 实现四阶段单次 DSH 重启更新编排
- [x] 2.2 更新 `skills/buildr-self-bootstrap-sync/SKILL.md` 及 `components/workspace/buildr-self-bootstrap/component.yml` 版本与完整性摘要
- [x] 2.3 在 `projects/product/services/buildr/test/integration/self-bootstrap-closeout.test.ts` 新增双插件旧包名迁移 + `restartDsh: true` 单次重启集成测试
- [x] 3.1 运行 Harness DSH 插件单测、Development DSH 插件单测及自举集成测试全部通过
- [x] 3.2 归档 OpenSpec 变更、提交推送并执行自举重装与 DSH 重启验证
