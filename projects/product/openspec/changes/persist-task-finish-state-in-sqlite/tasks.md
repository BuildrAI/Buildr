## 1. SQLite authority 与 Domain repository

- [x] 1.1 增加连续Workspace SQLite migration，建立Task Finish current run、compact completion、target lease与transient artifact metadata窄表、foreign keys、唯一slots和必要indexes
- [x] 1.2 收敛Task Finish closed run/result schema与SQLite repository，覆盖整值写入、写后读取、transaction rollback、busy/corrupt、单Task current slot和terminal Result retention
- [x] 1.3 将target lease改为SQLite owner/token/expiry/heartbeat事务，删除文件lease writer与正常routing依赖

## 2. 五阶段执行与 transient lifecycle

- [x] 2.1 将Task Finish Application、product executor和`run|inspect`切换到SQLite唯一authority，保留五阶段、Development handoff、target-race与Delivery Adaptation行为
- [x] 2.2 建立run-owned transient artifact registry与安全locator边界，使完整stdout/stderr、diagnostics和Delivery Carrier保持文件态但不进入长期Result
- [x] 2.3 重排cleanup checkpoint：先持久化delivery/`cleanup_pending`，幂等消费Task Environment cleanup，再清理Finish transient/lease并原子写completion与Task Record terminal transition
- [x] 2.4 移除legacy cutover、旧目录扫描与File Store fallback；SQLite-only runtime不读取、不写入旧协议，启用前由受控步骤直接清理`.buildr/task-finish`

## 3. Consumer、Doctor 与产品资产

- [x] 3.1 让Terminal Delivery Application、Local App Task详情和CLI inspect只消费Task Finish Application read model，覆盖current、blocked、cleanup pending与delivered投影，不投影legacy residue
- [x] 3.2 扩展Doctor检查Finish migration/current slot、dangling reference、expired lease、escaped/missing artifact、orphan transient与cleanup pending；不扫描旧目录，并保持有界输出和零危险自动删除
- [x] 3.3 更新`task-finish` Skill/contract、CLI reference、JSON contracts与架构说明，保留Task Finish名称和五阶段入口，明确`task complete`只表达Task Record终态
- [x] 3.4 更新package/runtime投射及自举激活输入，移除旧File Store目录/协议的生产引用，并保持post-Finish self-bootstrap只消费compact Formal Result

## 4. 直接实现验证

- [x] 4.1 增加SQLite integration tests，覆盖fresh/upgrade、foreign key/unique slot、transaction rollback、busy/corrupt、writer provenance、lease竞争与candidate validation-store隔离
- [x] 4.2 增加Task Finish integration/System journeys，覆盖正常完成、blocked/resume、target-race、Delivery Adaptation、远端回读失败、Environment已cleaned崩溃恢复及transient cleanup failure
- [x] 4.3 增加legacy retirement fixtures，覆盖旧目录存在时不读取、不导入、不扫描、不双写，以及启用前直接清理旧目录
- [x] 4.4 增加CLI/Local App/Doctor tests，证明consumer不扫描legacy files、不直接查询SQLite、不读取完整diagnostics，并证明成功后无current row、lease、Carrier或orphan transient
- [ ] 4.5 运行Product affected/full verification与真实自举candidate migration journey，确认并发`local-app-read-store-boundary`的只读provenance契约仍成立

## 5. 当前认知与 Change disposition readiness

- [x] 5.1 按`.buildr/knowledge-impact.yml`更新technical architecture、Buildr Service knowledge与glossary，使SQLite authority、transient retention及Task Finish/Task complete术语边界与最终实现一致
- [x] 5.2 reconcile `brief.md`、delta specs、CLI/JSON文档、实现与测试证据，处理所有unresolved knowledge/terminology items
- [x] 5.3 基于最新canonical specs重检active Change冲突并运行严格OpenSpec validation，确认本Change具备converge/archive disposition条件
