## 1. 项目测试地图

- [x] 1.1 实现`buildr.project-verification/v4`测试地图Domain与校验
- [x] 1.2 实现`project verification inspect|validate|update` Application和CLI
- [x] 1.3 更新Product `verification.yml`、模板、Skill和Doctor诊断

## 2. 任务验证报告

- [x] 2.1 实现`buildr.task-verification-report/v1` Domain、Repository和SQLite migration
- [x] 2.2 实现只含`record|inspect`的Task Verification Application和CLI
- [x] 2.3 更新HTTP DTO、Agent prompt与Buildr Web报告展示

## 3. 删除旧执行平台

- [x] 3.1 删除`verification plan|run|cleanup`和`task verification reconcile`入口
- [x] 3.2 删除通用Plan、runner、provider、自动选择和preparation admission实现
- [x] 3.3 删除Task Verification Execution Record owner、正文、恢复、unknown授权、cleanup和GC能力
- [x] 3.4 迁移或删除旧Task Verification Execution Record数据且保持Finish records不变

## 4. 解除外围依赖

- [x] 4.1 删除Task Development对Task Verification Application和Skill capability的依赖
- [x] 4.2 删除Development verification policy、gate、readiness、Candidate绑定、risk和handoff判断
- [x] 4.3 删除Terminal Delivery、Task Entry、Overview和Web对Development verification gate或历史record的解释
- [x] 4.4 删除Task Execution Record对Project Verification execution support的依赖

## 5. 契约与当前知识

- [x] 5.1 更新Task Development、Execution Record、CLI、HTTP、Web和Skill契约测试
- [x] 5.2 删除旧v3/Result/Plan/Run/reconcile文档与当前知识引用
- [x] 5.3 更新测试ownership和代表性旧数据迁移验收

## 6. 验证

- [x] 6.1 运行OpenSpec strict和语义就绪预检
- [x] 6.2 运行TypeScript、静态、单元、组件和契约测试
- [x] 6.3 运行完整Integration及Task相关System、Browser测试
- [x] 6.4 运行changed plan并确认无未归属路径和旧产品入口

## 7. 整体退役Task Execution Record

- [x] 7.1 删除Domain、Application、Repository、body store、Finish recovery适配和模块组装
- [x] 7.2 删除CLI、HTTP、Web面板、DTO、JSON schema与runtime scheduler残留
- [x] 7.3 新增SQLite migration删除Task Execution Record表并更新历史数据测试
- [x] 7.4 删除相关测试、ownership、文档与当前知识引用
- [x] 7.5 重跑OpenSpec、TypeScript、包校验、完整测试、System和Browser验证

## 8. Agent-first边界复审收紧

- [x] 8.1 将check确定性绑定到Task scope与Project测试地图，并由Application派生地图状态
- [x] 8.2 将缺失或损坏测试地图降级为报告gap，不阻止保存真实验证结果
- [x] 8.3 收紧三态结论、更新Skill与Web展示，并覆盖旧数据兼容
- [x] 8.4 重跑OpenSpec、TypeScript、相关测试与完整验证
