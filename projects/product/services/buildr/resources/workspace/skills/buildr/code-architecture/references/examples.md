# 架构案例（Architecture Examples）

以下为示意代码地图，按问题选读。实际文件名、框架和类型可见性遵循项目约定。

## Java：类型放在所属对象内

```text
order/
├── domain/Order.java                 订单实体与自身规则
├── service/OrderService.java         创建、取消、查询订单
│   ├── CreateRequest / OrderVO       内部请求与结果类型
│   └── create() / cancel() / query()
├── mapper/OrderMapper.java           数据读写与自定义 SQL
│   ├── SummaryRow                   内部聚合查询映射类型
│   └── findById() / save() / selectSummary()
└── controller/OrderController.java   HTTP 请求与响应适配
```

`CreateRequest`、`OrderVO` 可采用静态内部类；框架与语言版本支持时也可用内部 record。`SummaryRow` 属于查询映射，在 Mapper 内定义。应用按需要转换查询结果，Controller 不直接依赖 Mapper。公开签名中的内部类型需对调用者可见。

## TypeScript：在同文件内就近定义

```text
order/
├── domain/order.ts                     Order 对象及规则
├── application/order-application.ts    创建、取消、查询订单
│   ├── CreateInput / OrderResult       同文件输入与结果类型
│   └── create() / cancel() / query()
├── persistence/order-repository.ts     数据读取、映射与保存
│   ├── SummaryRow                     同文件查询映射类型
│   └── find() / save() / querySummary()
├── interfaces/order-http.ts           请求与响应适配
└── module.ts                          创建仓储并注入应用对象
```

Java 的内部类型在 TypeScript 中可用同文件的 type/interface 表达，按实际需要导出。

两种实现都表达同一协作：接口入口 → 应用用例 → 数据访问 → 存储；应用同时使用领域对象和必要技术能力。

## 拆分、合并与前端

| 现场 | 调整 | 理由 |
|---|---|---|
| 应用体量适中，创建与查询仍好读 | 保留一个应用文件，内部组织方法 | 没有实际拆分收益 |
| 应用明显庞大，查询与变更分别演进 | 按查询/命令（Query/Command）拆分 | 降低单次阅读和修改范围 |
| 代码不多的支付幂等保护 | 独立文件 | 重要保护能力需要隔离维护 |
| 多个小文件主要转发，总要一起读改 | 合并相关方法与类型 | 减少跳转，保留层边界 |
| 单页短钩子（Hook） | 放在页面文件内 | 只服务当前页面，无独立维护需要 |
| 一个完整表单 | 字段、局部状态和提交同组件维护 | 不机械配套多个辅助文件 |
| 抽屉聚合多个领域表单和状态 | 宿主负责装配，各领域表单独立 | 避免跨领域状态混用 |

小型脚本可在一个文件中分别组织读取、纯计算、写入与入口方法；实际复杂度增长后再拆分。
