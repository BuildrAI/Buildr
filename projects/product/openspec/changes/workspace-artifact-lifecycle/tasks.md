# 实施任务清单

## 实现

- [x] 新建 `src/modules/artifact-lifecycle/` 模块：domain 类型（产物记录、处置策略、处置状态、发现分类）与 module.ts 组合根
- [x] persistence：`.buildr/local/artifacts/registry/<artifactId>.json` 文件读写（单写者、原子 rename、`buildr.workspace-artifact/v1`、内容摘要条件更新）
- [x] infrastructure：scratch 根枚举（Workspace 根与各服务检出根 `build/`）、目录大小测量、未登记目录发现、任务终态只读读取、保护路径与符号链接校验
- [x] application：`register|list|status|release|clean` 五个应用动作；处置状态即时计算；clean 计划与 execute 两阶段、逐项失败隔离
- [x] interfaces/cli：`artifact` 命令族注册、help 与 `--json` 输出，接入 command metadata catalog 的 `agent-machine` surface
- [x] `services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md`：增补已登记产物逐项处置指引（核验归属→清理/转 retained/报告未决，非门禁）

## 当前认知

- [x] 运行 `buildr.current-knowledge-maintenance` assess，把真实影响写入 `projects/product/.buildr/knowledge-impact.yml`
- [x] 按 assess 结果更新受影响的代码地图/解释文档（新模块登记位置、`artifact` 命令族入口）

## 直接验证

- [x] 新增单元/组件测试覆盖：登记校验、发现分类、处置状态计算、clean dry-run 与 execute 的授权边界、逐项失败隔离
- [x] 运行受影响的项目已有检查（相关测试文件与类型检查），失败按既有约定处理
- [x] `openspec validate workspace-artifact-lifecycle --strict` 与 `buildr openspec convergence preflight` 通过
