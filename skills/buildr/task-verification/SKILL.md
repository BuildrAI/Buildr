---
name: task-verification
description: 用户要探查或维护 Project 测试地图，开发中选择并运行已有前后端测试，或开发完成后记录和查看正式 Task 验证报告时使用；不开发测试、不生成验证计划、不代跑项目测试、不决定 Task 完成。
---

# 任务验证

本技能（Skill）是 `buildr.task-verification/v4` 的默认提供者。项目拥有测试代码、fixture、mock、构建脚本、Playwright 和测试环境；智能体（Agent）选择并调用这些真实工具；Buildr 只维护项目测试地图和开发完成后的任务验证报告。

## 项目测试地图

`projects/<project>/verification.yml` 使用 `buildr.project-verification/v4`，只登记少量稳定测试体系，不列举每个测试文件。智能体读取 Project/Service、`AGENTS.md`、构建文件、测试目录、脚本、CI 和测试说明，归纳后端单元、本地功能、环境冒烟，以及前端静态、单元、组件、Playwright 功能和环境冒烟等实际体系。

每项 testing 说明目的、Project/Service scope、相关源码范围、测试根、完整入口、具体测试选择方法和环境要求。测试不存在时报告建设缺口，不在本技能中生成框架或测试。

维护步骤：

1. `buildr project verification inspect <project> --target <workspace> --json` 读取当前地图。
2. 在操作系统临时目录形成完整候选，不修改受管副本。
3. `buildr project verification validate <project> --file <candidate.yml> --target <workspace> --json` 校验。
4. 展示新增、修改和删除的测试体系；新增外部环境或改变长期测试边界时取得用户决定，已确认入口的普通维护直接继续。
5. `buildr project verification update <project> --file <candidate.yml> --expected-identity <identity|absent> --target <workspace> --json` 按已观察版本写入并回读；随后删除临时文件。

Application 只校验 schema、Project/Service scope、安全相对路径和候选版本冲突，不替智能体理解项目或生成内容。

## 开发中的验证

开发过程中，智能体根据当前修改直接选择和调用项目已有命令及工具：Maven、Gradle、npm、Playwright、Browser、HTTP 等。优先运行相关的 focused 单元或功能测试；形成小闭环后按需要扩大。失败时修复实现或测试，无法在当前范围处理时如实报告。

这些反馈不写 Task Verification Report，不创建 Buildr Plan、Run、Execution Record 或流程状态。

## 开发完成后的任务验证

开发完成后重新读取 Task 目标、当前内容、全部相关 Project 测试地图和真实改动。默认选择受影响 Service 的完整低成本回归、任务相关的本地功能或 Browser 功能测试；只有当前目标适用且环境可用时才执行环境冒烟。

智能体自行形成临时执行安排并直接调用工具。Buildr 不生成计划或统一运行测试。测试失败时先修复和重跑；完整验证结束后才形成报告。

报告必须说明内容版本、实际检查、`focus|task-related|full`选择、具体测试目标、`command|agent`来源、结果、摘要、耗时（可得时）、未覆盖项和结论。只有一句“测试通过”不构成有意义报告。使用：

```text
buildr task verification inspect <task-id> [--content-identity <identity>] --target <canonical-workspace> --json
buildr task verification record <task-id> --report <json-file> --expected-report <absent|sha256-digest> --target <canonical-workspace> --json
```

记录前先用`inspect`读取真实current槽位：不存在时使用`absent`，存在时使用返回的`reportDigest`作为`--expected-report`。Application从Task scope读取当前项目测试地图identity，确认实际检查属于Task且testing family与可用地图一致，生成系统完成时间；Repository在同一事务内比较已观察摘要并原子整值替换唯一current报告。冲突时保持current不变，智能体必须重新读取真实报告和当前内容后决定重做或替换，不能自动重试。摘要只是调用参数，不进入报告业务事实。地图缺失或损坏时不否定已完成的真实测试：Application把相关检查标记为“地图不可用”，并追加明确未覆盖项；智能体不能把它说成已由地图声明。

`passed`至少需要一个实际检查且所有检查均通过；只有未覆盖项不能写成`passed`。`not-passed`必须有失败检查；`incomplete`用于没有失败检查但仍有未覆盖项的情况。只有调用方在`inspect`时提供当前内容identity，Application才能判断内容是`current`还是`stale`；未提供时内容适用性为`unknown`。历史执行日志不迁移为新成功事实。

## 报告边界

报告只说明实际验证情况，不等于业务验收、任务完成、提交、推送、部署或发布。`not-passed`和`incomplete`如实保留；下一步由智能体依据用户目标和当前事实判断，不生成统一`proceed|blocked`。
