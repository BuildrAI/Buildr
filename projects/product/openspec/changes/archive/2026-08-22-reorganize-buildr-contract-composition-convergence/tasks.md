## 1. Contracts 与 Release Version owner

- [x] 1.1 将 public JSON identity registry/envelope helper 迁入 Infrastructure Contracts，切换所有生产、测试与 Verification selector 引用并断言旧路径退出
- [x] 1.2 将 release version 迁入 System Installation Domain，切换 Release Awareness、release tools、fixtures 与验证 owner

## 2. Task Internal Workflow Routes

- [x] 2.1 建立 Task contract route catalog 与 injected-runner router，通过 `task/module.mjs` 向 Bootstrap 暴露唯一入口
- [x] 2.2 切换 Bootstrap、Doctor、static validation 与测试引用，删除旧顶层 route inventory/router 并验证未知 route 与既有 driver 行为

## 3. Web HTTP 全量职责拆分

- [x] 3.1 提取 responses、session/request security 与 static-files 模块，保持 header、CSP、body limit、路径防护和 index 注入等价
- [x] 3.2 提取 router 并收窄 server lifecycle/组装入口，保持 route order、contributions、Secret、health、shutdown、404 与 error mapping 等价
- [x] 3.3 补充 Web HTTP 架构、安全与行为回归测试，覆盖非法写请求、静态资源、health/shutdown 和 contribution 顺序

## 4. Bootstrap、知识与旧路径最终清理

- [x] 4.1 更新 architecture verifier、Application Payload/Verification registry、package/static owner 清单和旧路径零残留断言
- [x] 4.2 更新 `docs/architecture/service-architecture.md`、Project technical knowledge 与 Buildr Service knowledge 的最终 owner map
- [x] 4.3 运行 Current Knowledge reconcile/terminology 检查，更新 knowledge impact evidence 并确认无 unresolved

## 5. 实现验证与 Change 收敛准备

- [x] 5.1 运行 public JSON、release、internal workflow route、Bootstrap/architecture 与 Web HTTP affected tests
- [x] 5.2 运行 Buildr Service full candidate verification，修复本 Change 引入的失败并确认旧路径全仓零引用
- [x] 5.3 完成 Change checklist、strict validation 与 current knowledge inspect，使 Change 达到可收敛状态
