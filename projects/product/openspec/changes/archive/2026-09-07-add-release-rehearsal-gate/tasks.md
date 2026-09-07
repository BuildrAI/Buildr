## 1. 候选环境准备

- [x] 1.1 新增统一候选环境准备入口与 `base|artifact|source-runtime|host` 闭合档位
- [x] 1.2 将 `verify.yml` 的全部 Candidate 作业迁移到统一准备入口，删除作业内手工准备组合
- [x] 1.3 增加准备档位、干净检出、跨平台命令和 workflow 结构回归测试

## 2. 发布演练与提升

- [x] 2.1 新增 prospective release source 的 prepare/inspect/cleanup owner与闭合身份模型
- [x] 2.2 让同一 Candidate workflow 接受 `candidate|release-rehearsal` purpose并绑定source tree、run与aggregate
- [x] 2.3 新增 selection `promote-rehearsal`，只允许matching全绿演练原子形成新的正式frozen generation
- [x] 2.4 增加冲突、漂移、非全绿、公共事实存在、精确提升和资源清理回归测试

## 3. 发布方法与当前认知

- [x] 3.1 更新 Buildr Release Skill与发布检查清单，明确支持任务内演练到全绿后只做一次最终Candidate
- [x] 3.2 更新发布流程、Buildr Service、技术架构和术语表，并完成knowledge impact reconcile

## 4. 直接验证

- [x] 4.1 运行OpenSpec strict/preflight、发布契约、候选环境准备与演练owner focused tests
- [x] 4.2 运行受影响Product验证并核对现有Candidate evidence与唯一tarball覆盖没有减少
