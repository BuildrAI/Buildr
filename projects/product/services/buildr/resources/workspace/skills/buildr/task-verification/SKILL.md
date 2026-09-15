---
name: task-verification
description: 选择项目已有检查、维护测试地图，或记录和查看任务验证报告时使用；测试由智能体直接调用项目工具。
---

# 任务验证

本技能（Skill）是 `buildr.task-verification/v4` 的默认提供者。项目拥有测试代码、fixture、mock、构建脚本、Playwright 和测试环境；智能体（Agent）选择并调用这些真实工具；Buildr 只维护项目测试地图和开发完成后的任务验证报告。

## 项目测试地图

`projects/<project>/verification.yml` 使用 `buildr.project-verification/v4`，只登记少量稳定测试体系，不列举每个测试文件。智能体读取 Project/Service、`AGENTS.md`、构建文件、测试目录、脚本、CI 和测试说明，归纳后端单元、本地功能、环境冒烟，以及前端静态、单元、组件、Playwright 功能和环境冒烟等实际体系。

每项 testing 说明目的、Project/Service scope、相关源码范围、测试根、完整入口、具体测试选择方法和环境要求。测试不存在时报告建设缺口，不在本技能中生成框架或测试。

维护地图时读取[地图写入步骤](references/maintain-map.md)；只选择已有检查时不加载写入步骤。

## 开发中的验证

开发过程中，智能体根据当前修改直接选择和调用项目已有命令及工具：Maven、Gradle、npm、Playwright、Browser、HTTP 等。优先运行相关的 focused 单元或功能测试；形成小闭环后按需要扩大。失败时修复实现或测试，无法在当前范围处理时如实报告。

这些反馈不写 Task Verification Report，不创建 Buildr Plan、Run、Execution Record 或流程状态。

## 开发完成后的任务验证

开发完成后核对任务目标、当前内容、相关测试地图与真实改动。先判断已有检查的内容、环境、目标和覆盖范围是否仍适用，复用有效结果，只补充尚未覆盖的必要检查。扩大到完整回归应有改动影响、项目必需要求或明确未解决风险作为依据；环境冒烟仅在目标适用、环境可用且已获相应授权时执行。

已有检查仍适用于当前成果且必需检查已通过时，只有新改动、失败或明确未解决风险才补充相关验证。开发阶段的真实检查经上述适用性核对后可纳入完成报告；保留原执行结果并说明复用依据，不把历史日志改写为新的执行事实。无法确认适用性的检查不作为当前成功证据。

智能体自行形成临时执行安排并直接调用工具。Buildr 不生成计划或统一运行测试。Project测试地图提供`kind: command`时，必须按声明的`cwd`与`argv`原样调用，不得把repository-owned wrapper简化为系统PATH上的裸`node`或`npm`。失败时在授权范围内修复并重跑受影响检查；无法完成的检查如实说明，不因阶段转换重复验证。

完成本轮验证并明确未覆盖项后，读取[报告登记步骤](references/record-report.md)，选择合法写入入口并按已观察版本登记。记录报告不触发重新执行检查。

## 报告边界

报告只说明实际验证情况，不等于业务验收、任务完成、提交、推送、部署或发布。`not-passed`和`incomplete`如实保留；下一步由智能体依据用户目标和当前事实判断，不生成统一`proceed|blocked`。
