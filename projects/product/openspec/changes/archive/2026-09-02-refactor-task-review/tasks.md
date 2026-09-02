## 1. Result与迁移

- [x] 1.1 定义closed Task Review Result v2与operation result v2，删除target applicability
- [x] 1.2 新增连续SQLite migration，把全部合法v1 current rows一次转换为v2并覆盖rollback测试
- [x] 1.3 Repository实现`absent|resultDigest`事务内CAS、冲突回读和零写入

## 2. 最小接口

- [x] 2.1 Application只保留inspect/record，record要求expectedCurrentDigest并删除prompt generator
- [x] 2.2 CLI切换subject identity、CAS参数和v2 JSON，删除旧target/applicability参数
- [x] 2.3 删除Review prompt HTTP route、Schema、mapping、生成DTO和typed client方法
- [x] 2.4 更新module methods/requires、public JSON registry、help与static validation

## 3. Development与其他模块解耦

- [x] 3.1 删除Task Development对Review Application的module dependency和运行时读取
- [x] 3.2 Candidate、knowledge、decision与handoff不再要求Planning/Completion Review gate
- [x] 3.3 退役Development gate action与Review next-action，保留旧Receipt/Handoff只读decode
- [x] 3.4 确认Finish、Parent、Verification、Overview和Terminal不新增Review解释或写入

## 4. Buildr Web与Skill

- [x] 4.1 Review区块展示v2 subject、method、证据和局部结论，不显示current/stale/adopted/gate
- [x] 4.2 Review Agent action使用前端最小指令且不调用后端prompt
- [x] 4.3 重写`task-review` Skill与相关Development/OpenSpec fragments，按真实subject和CAS工作
- [x] 4.4 更新组件integrity、生成DTO与正式web-dist

## 5. TypeScript与验证

- [x] 5.1 Review Domain/Application/Repository/CLI/HTTP及专属测试迁移为TypeScript唯一人工源码
- [x] 5.2 增加无Development、两个Agent并发CAS、v1迁移、损坏回滚、Review变化不影响Development场景
- [x] 5.3 更新ownership、registry、module/static/HTTP/public JSON契约并删除退役专属测试
- [x] 5.4 运行TypeScript、Unit、Component、Integration、System、Browser、package和OpenSpec严格验证

## 6. 当前认知与收敛

- [x] 6.1 更新产品/技术架构、Buildr/Buildr Web Service、Task依赖图与术语说明
- [x] 6.2 reconcile Brief与knowledge impact，确认没有新许可层、状态机或第二事实源
- [x] 6.3 确认全部Change-owned任务完成且deterministic convergence/archive前置检查通过
