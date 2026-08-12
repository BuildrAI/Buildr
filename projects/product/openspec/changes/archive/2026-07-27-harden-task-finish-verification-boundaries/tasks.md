## 1. Verification failure 与 repair 边界

- [x] 1.1 扩展Task Finish run/JSON contract，formal failure返回结构化repair decision并在无授权时保持delivery tree零写入
- [x] 1.2 增加版本化repair authorization、repair candidate transition与re-verification supersession evidence
- [x] 1.3 覆盖普通“收尾”停止、预授权修复、失败后授权、scope扩大再次停止和旧run兼容测试

## 2. 收尾阶段与耗时口径

- [x] 2.1 在observation ledger/completion receipt中划分initial verification、repair、re-verification、closeout-only与orchestration gap
- [x] 2.2 保留端到端wall-clock并让closeout-only从最后一个有效assurance通过后开始，避免把测试/修复统称为收尾
- [x] 2.3 增加正常成功、失败停止、授权修复继续和部分coverage的unit/integration benchmark fixtures

## 3. Candidate-aware verification preflight

- [x] 3.1 扩展verification registry声明低成本、无共享副作用、候选owner绑定的preflight selector与artifact dependencies
- [x] 3.2 在affected/Candidate前生成并执行确定性preflight plan，失败或selector歧义时不启动完整正式保证
- [x] 3.3 为Task Finish Skill sequencing contract、receipt portability和未映射路径补preflight选择与回归测试

## 4. Portable OpenSpec receipts

- [x] 4.1 将convergence运行时绝对executable定位转换为portable source reference、version与content/package identity后再持久化
- [x] 4.2 兼容读取旧绝对路径receipt，但任何更新或新写入都只生成portable schema
- [x] 4.3 增加task checkout、历史archive、open-source candidate与contract fixture覆盖，证明tracked receipt不含机器/用户路径

## 5. Failure-first compact diagnostics

- [x] 5.1 从登记child summary与测试输出提取primary failed stage/check/test、exit code、bounded findings和repair decision
- [x] 5.2 将budget warning降为次级字段，并为非结构化大输出保留明确failure excerpt、digest/path与next action
- [x] 5.3 覆盖contract failure叠加多个warning、并行capability单项失败和解析降级场景

## 6. Skills、current knowledge 与验证

- [x] 6.1 更新Task Finish与task-verification capability contracts、Skill、CLI help和公开JSON schema，明确用户授权与阶段口径
- [x] 6.2 更新`brief.md`、Task Finish/OpenSpec lifecycle current knowledge和持续优化任务看板；术语核对为已有verification、repair、re-verification、closeout边界，无新glossary条目
- [x] 6.3 运行聚焦unit/contract/integration、OpenSpec strict与最终affected，记录preflight、initial verification、repair/re-verification和closeout-only真实wall-clock
- [x] 6.4 用一次无缺陷finish和一次fixture化repair流程验证：无授权失败不会改树，正常closeout-only可独立比较，端到端workflow不再冒充纯收尾
