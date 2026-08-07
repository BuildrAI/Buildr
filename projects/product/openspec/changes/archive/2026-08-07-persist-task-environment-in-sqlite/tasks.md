## 1. 契约与 SQLite schema

- [x] 1.1 为 `task_environment_current` 增加连续 migration，包含 Task foreign key、JSON validity、status/updated_at constraints 和 migration checksum。
- [x] 1.2 更新 Workspace Structured Store schema inventory、Doctor、package/static validation 与 integration fixtures，证明 fresh/upgrade/candidate store 行为。
- [x] 1.3 更新 Task Environment、lifecycle read model、public JSON contract 与相关 current knowledge/术语，完成 strict OpenSpec validation。

## 2. Environment current Repository 与 Application

- [x] 2.1 实现 SQLite Environment repository，整值保存/读取 normalized Receipt，覆盖 writer provenance、busy/corrupt、foreign key、rollback 和写后回读。
- [x] 2.2 将 prepare 的初始 receipt、probe checkpoint、resource register/release 与 cleanup 状态更新切换到 SQLite current row，移除正常文件 writer。
- [x] 2.3 将 Environment inspect 改为纯 SQLite current read，缺失时返回稳定 unavailable；禁止 `environment.json` fallback、probe 和 projection 回填。
- [x] 2.4 在同一 Application action 中更新 Environment current 与 lifecycle Environment summary，保证 current authority 不被 projection 缺失覆盖。

## 3. Legacy migration 与文件 authority retirement

- [x] 3.1 实现 retained controller 执行的一次性 v2 `environment.json` inventory/import，校验 canonical root、Task identity、schema、普通文件/symlink 与 ownership，冲突零切换。
- [x] 3.2 迁移后停止创建、更新、读取和双写 `environment.json`；保留历史 bytes，禁止从文件补齐 SQLite current。
- [x] 3.3 更新 Task Environment migration/legacy tests，覆盖合法导入、损坏/冲突保留、重复执行幂等和 candidate validation-store 隔离。

## 4. Local App 与消费者

- [x] 4.1 让 Local App Environment Application reader 直接消费 SQLite current，保留 Workspace/Task 输入边界、no-store、sanitized read model 与无 writer UI。
- [x] 4.2 更新 Local App HTTP/Web fixture，证明缺失/ready/blocked/cleaned 与资源/cleanup 进度来自 SQLite，不读取 Environment 文件。
- [x] 4.3 更新 CLI JSON schema、CLI/checkout parity、Task detail tests 与 Doctor diagnostics，移除文件 path authority 断言。

## 5. 正式验证与交付准备

- [x] 5.1 运行受影响的 SQLite、Environment、lifecycle、Local App、package/contract/system tests，修复真实失败。
- [x] 5.2 对稳定 Content Target 执行 Task Verification，形成 current Result、Completion Review、decision 与 Development handoff。
- [x] 5.3 通过 Task Finish 交付、验证 retained runtime/Doctor、完成 Environment cleanup，并确认新数据库 schema 与旧 Environment files 的最终边界。
