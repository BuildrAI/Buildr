# Workspace测试与Task验证架构

> 当前实现说明。规范性行为以OpenSpec specs、`buildr.task-verification/v4`能力契约和对应Skill为准。

## 一句话模型

> Project负责建设测试；`verification.yml`描述测试地图；Task Verification Skill指导Agent选择和执行测试；Application只维护测试地图与开发完成后的Task验证报告。

## 测试由Project负责

后端通常包括：

- 不启动服务上下文的单元测试；
- 使用Spring context、内存数据库、Testcontainers、本地Redis或mock外部接口的本地功能测试；
- 连接测试或开发环境、通过HTTP验证关键路径的环境冒烟测试。

前端通常包括：

- 工具函数、状态、hooks和组件逻辑的单元测试；
- 组件渲染和事件交互测试；
- 使用Playwright等工具执行真实页面交互的Browser功能测试；
- 已部署测试环境的少量关键路径冒烟测试；
- TypeScript、lint和build等低成本静态检查。

Project自行决定使用哪些测试、fixture、mock、数据库、Redis、消息系统和测试runner。Task Verification不把这些实现统一成Buildr平台。

## Project测试地图

`projects/<project>/verification.yml`使用closed`buildr.project-verification/v4`。它登记测试体系和发现方式，不登记每个测试文件。

每项testing family只描述：

- 稳定id和purpose；
- Project或Service scope；
- 相关源码范围`sourcePaths`；
- 发现具体测试的`testRoots`；
- 完整command或Agent guide；
- Agent选择具体测试时需要的指导；
- 本地资源或环境要求。

Skill指导Agent读取Project/Service登记、`AGENTS.md`、构建入口、测试目录、scripts、Playwright配置、CI和测试说明，形成候选文件。Project Verification Application只提供：

```text
buildr project verification inspect <project>
buildr project verification validate <project> --file <candidate.yml>
buildr project verification update <project> --file <candidate.yml> --expected-identity <identity>
```

Application校验schema、scope、路径、命令和引用，并按已观察identity写入；它不扫描或理解项目，也不自动生成候选。

## 开发中的测试

开发过程中，Agent根据当前改动直接选择并调用Project工具，例如Maven、npm、Playwright、Browser或HTTP：

- 运行相关单元测试；
- 运行任务相关功能测试；
- 失败后修复、补测试并重跑。

这些属于快速开发反馈，不写Task Verification Report。

## 开发完成后的Task验证

开发完成后，Agent重新读取Task目标、实际改动、测试地图、测试代码和开发反馈，自行决定最终验证范围。通常包括：

- 任务相关功能测试；
- 受影响Service的完整低成本单元测试或静态回归；
- 当前目标适用且环境可用时的冒烟测试。

Agent直接调用现有工具执行。Buildr不生成Verification Plan、不统一执行测试、不调度Project资源。

完成后，Agent通过：

```text
buildr task verification record <task-id> --report <report.json>
buildr task verification inspect <task-id>
```

保存或读取一份closed`buildr.task-verification-report/v1` current报告。报告包含Task scope、内容版本、Project测试地图identity、实际checks、selection、targets、结果、gaps、结论和完成时间。只有一句“测试通过”的报告不合法。

## 失败与边界

测试失败时，Agent先处理实际问题：能修复就修复并重跑；属于已有测试或环境问题时如实说明；无法处理时向用户报告。Buildr不为失败创建额外流程状态。

Task Verification：

- 不生成Plan或Run；
- 不创建Task Verification专属Execution Record；
- 不使用Candidate、generation或lease；
- 不依赖Task Development；
- 不保存`proceed / blocked`或风险授权；
- 不判断Task是否可以完成、提交、推送、部署或发布。

Buildr Product自己的复杂测试registry、changed-path planner、DAG、资源协调和Candidate/Release验证仍属于Buildr Project测试架构，不属于通用Task Verification Application。
