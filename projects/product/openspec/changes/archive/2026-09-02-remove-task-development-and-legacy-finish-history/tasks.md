## 1. 解除真实消费者

- [x] 1.1 删除OpenSpec、Current Knowledge、Triage、Buildr/Release Skills中的Task Development与Task Planning Identity binding、调用和流程文案
- [x] 1.2 删除release task correlation中的Development与legacy Finish role，同时保持Product Candidate source、generation、CI和tarball模型不变
- [x] 1.3 收窄Task Overview、Task Record和Parent历史读取，只保留Task、Review、Verification、Environment与Retrospective事实

## 2. 删除本体、旧收尾和数据

- [x] 2.1 删除Task Development、Content Target observer、Task Planning Identity的Domain/Application/Repository/driver/runtime port与专属测试
- [x] 2.2 删除legacy Task Finish、Terminal Delivery、历史adapter、CLI/HTTP/JSON投影、runtime port与专属测试，保留默认task-finish Skill
- [x] 2.3 增加连续SQLite migration直接DROP task_development_current与task_finish_current，并覆盖fresh/upgrade/其他表不变测试

## 3. 删除Buildr Web与Package surface

- [x] 3.1 删除Development GET、旧Finish/Terminal Delivery接口、schema、mapping、typed client与DTO投影
- [x] 3.2 删除Buildr Web研发页签、旧交付历史展示、状态标签、样式和Browser fixture/assertion
- [x] 3.3 删除package manifest中的Task Development Skill/contract/provider、内部route、Doctor/static validation与installed-layout残留

## 4. TypeScript单一人工源码

- [x] 4.1 直接重写的Task Overview、Repository、HTTP契约与Web接口继续使用严格TypeScript单一来源；退役模块代码不为迁移而保留
- [x] 4.2 直接删除退役模块的专属测试、fixture和helper；共享MJS验证基础只移除旧依赖，不做仅改扩展名的伪TypeScript迁移
- [x] 4.3 核对TypeScript源码没有配对人工JavaScript、`@ts-nocheck`、无边界`any`或掩盖职责边界的类型断言，并保持构建、npm入口与生成DTO一致

## 5. 当前认知与直接验证

- [x] 5.1 更新overview、产品/技术架构、OpenSpec/收尾流程、Buildr/Buildr Web说明、术语和任务系统路线图，并完成knowledge impact reconcile
- [x] 5.2 验证无Development/legacy Finish的Task、OpenSpec、Review、Verification、Environment、Overview、Web与默认收尾场景
- [x] 5.3 运行TypeScript、Unit、Component、Contract、Integration、System、Browser、SQLite migration、package/npm与Product Candidate受影响回归
- [x] 5.4 核对全部退役代码、接口、binding、schema、测试和current数据零残留，并通过OpenSpec strict与convergence readiness检查
