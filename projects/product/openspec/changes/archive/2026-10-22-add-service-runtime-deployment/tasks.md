## 1. 运行定义与受管运行（buildr 服务）

- [x] 实现 `runtime.yml` schema、读写与校验（来源、验证时间、字段完整性），含单测。
- [x] 实现受管运行生命周期：按工作树启动/停止、每工作树单实例、端口分配与避让、就绪检查与超时失败，含单测。
- [x] 实现运行日志捕获（stdout/stderr，本地进程不注入秘密）与 `.buildr/local/service-runtime/runs|logs/<run-id>` 存储、pid 对账，含单测。
- [x] 暴露 runtime HTTP/CLI 表面：运行定义读取、启动、停止、日志、运行列表，含集成测试。

## 2. 部署适配器契约（buildr 服务）

- [x] 定义部署程序契约与归一化结果结构（state/version/at/externalUrl），经 connection-skill run 调用，含 mock provider 测试。
- [x] 实现 QA 提交与最近结果存储、unknown 不重试语义，含集成测试。
- [x] 在随包 `connection-authoring` 技能补充部署适配器编写指引与样例（槽位、归一化结果、秘密/日志边界、未知结果语义），使用户工作空间新建 CI/CD 连接技能即符合契约。

## 3. Buildr Web 视图

- [x] 工作台只读本地运行汇总卡片（含跳转，无操作按钮），按原型 [原型说明](@task/service-runtime-prototype)。
- [x] 服务目录合并“运行与部署”状态列：本地/环境前缀标签、行高一致、悬停与点击浮窗、浮窗内跳转详情。
- [x] 服务详情：紧凑运行行、来源只读行与重新配置、启动抽屉、日志抽屉、运行配置抽屉。
- [x] QA 部署抽屉：只读计划、集成分支默认与远端分支改选、未提交改动告警、提交后最近结果与外链。

## 4. 验证与知识

- [x] 更新并运行 Buildr Web 浏览器旅程：目录、详情、启动、QA、日志路径。
- [x] 在任务页验证原型展示（方案设计/单独查看）与正式页面信息架构一致。
- [x] 运行 current-knowledge-maintenance assess，校准 `knowledge/` 代码地图与模块说明中新增服务运行模块；如存在 `.buildr/knowledge-impact.yml` 同步维护。
- [x] 运行 `openspec validate add-service-runtime-deployment --strict` 与 `buildr openspec convergence preflight` 并处理诊断。
