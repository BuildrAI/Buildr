# 项目测试建设与验证

测试代码、依赖、真实执行程序与测试登记由项目（Project）和服务（Service）拥有。Buildr 帮助智能体（Agent）发现长期入口并保存已有正式任务（Task）的验证报告，不要求用户项目采用同一种技术栈，也不以任务或 Git 基线作为检查运行前提。

## 两项职责

| 职责 | 唯一负责技能（Skill） |
| --- | --- |
| 设计测试、补齐必要案例、维护项目入口、发现与选择映射，以及 `verification.yml` 测试登记 | [项目测试建设（project-testing）](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md) |
| 按用户请求或任务目标选择和实际执行检查，交付证据，记录或读取已有任务报告 | [项目验证（project-verification）](../../../services/buildr/resources/workspace/skills/buildr/project-verification/SKILL.md) |

不另设声明接入中转；准备命令变化由 `buildr` 的[准备声明指引](../../../services/buildr/resources/runtime/skills/buildr/references/preparation-declarations.md)处理。项目测试登记的应用模块仍可保留 `project-testing` 代码名，报告命令仍是 `task verification inspect|record`，这不改变技能分工。

## 分类与请求

只使用静态检查（Static Check）、单元测试（Unit Test）、集成测试（Integration Test）、端到端测试（End-to-End Test，E2E）四类，详见[测试模型](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md)。单元测试（Unit Test）可以检查完整内部功能，关键是外部依赖被替换、准备少和集合低成本；不设统一秒数门槛。真实数据库、网络、文件协议、Git 和外部程序检查属于集成测试（Integration Test）；实际入口完整使用流程属于端到端测试（End-to-End Test，E2E）。

用户可以请求某条现有检查、某类全量、指定相关范围或完整验证；智能体（Agent）根据真实内容与入口执行，不先要求创建任务、冻结候选或提供比较基线。相关选择需覆盖公共行为和全部必要边界，路径匹配仅提供线索。发现能力不存在时报告并在授权范围补建，不把空选择或仅有命令成功当作目标通过。

Buildr 产品自身的推送前政策是四服务全部静态检查（Static Check）与单元测试（Unit Test）；其他项目按其明确政策执行，不把产品自用规则推广为统一硬门禁。开发中涉及的真实边界仍需相关验证，发布再核对准确原包及必要平台；不因阶段名称重复有效检查，也不因叫作发布检查推迟任务必要证明。

## 测试登记

`projects/<project>/verification.yml` 使用 `buildr.project-verification/v4`，只登记少量稳定测试能力。每族说明身份、项目与服务范围、用途、源码与发现位置、完整入口、选择方式和环境要求，不维护一份具体文件清单或一次性执行计划。

由 `project-testing` 按[声明字段](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/project-verification-v4.md)与[维护方法](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/maintain-map.md)读取当前身份、校验完整候选、按已观察版本更新并回读。应用（Application）继续承担 `project verification inspect|validate|update` 的结构、安全路径和并发版本保护，不分析语义、不执行测试。

选择执行由 `project-verification` 读取当前登记与 `locations`，按真实根和项目包装入口运行。单个位置不可用只影响对应项，其他已授权检查继续；路径可用不等于环境、覆盖或结果成立。入口与声明失配回到唯一维护者处理，不能为运行方便在验证技能另维护一份地图。

## 证据与报告

每次交付说明被测内容、实际选择与目标、命令和环境、结果、复用来源及具体未覆盖项。失败、未执行、环境不匹配和缺少测试分别报告；只有授权或业务取舍缺口才请求用户决定，普通内部选择和执行连续推进。

没有正式任务时直接交付结果。有仍为 `active` 的任务且开发验证已完成时，按[报告登记](../../../services/buildr/resources/workspace/skills/buildr/project-verification/references/record-report.md)保存当前相关检查的完整集合，报告模型仍是 `buildr.task-verification-report/v1`。合法写入入口、内容版本、地图身份、已观察报告摘要和原子替换保持不变；任务完成后不补造报告。

报告成功不等于业务验收、任务完成、提交、推送、安装或发布。检查登记缺失、辅助证据问题不能抹掉实际成功；必要边界仍未覆盖时，诚实报告验证不完整。
