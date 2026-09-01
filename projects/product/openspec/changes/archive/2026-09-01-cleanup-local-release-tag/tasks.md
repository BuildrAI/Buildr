## 1. 发布 Tag 清理实现

- [x] 1.1 扩展 release Git closeout，在完整 Publication/远端 Tag/本地 Tag 预检后删除本地同名 Tag并记录结果
- [x] 1.2 保持正式远端 Tag、远端 release ref、npm 与 GitHub Release不变，并支持本地 Tag 已缺失的幂等恢复

## 2. 验证与当前认知

- [x] 2.1 增加真实 Git annotated Tag 的成功、缺失、漂移和重复 closeout 回归
- [x] 2.2 更新 Change Brief 与知识影响证据，完成严格 OpenSpec 校验和直接相关测试
