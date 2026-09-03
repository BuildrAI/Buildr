# task-closeout-orchestration Specification

## Purpose

定义已有自举脚本如何独立处理直接交付后的激活；不要求旧收尾运行，不撤销已成立交付。 脚本核对明确任务、Git 基线、目标和远端，再处理适用的同步、开发应用更新与最终诊断，资源清理仍由原所有者独立执行。

## Requirements

### Requirement: 自举激活必须支持无旧收尾运行的直接交付
同一自举技能（Skill）脚本 MUST支持以明确任务、基线、已交付提交、目标分支和远端为待核验输入。脚本 MUST重新核验Task已完成且包含Product scope，并以`deliveredRef`、remote readback和Git identity证明交付；MUST不读取`noChange`或其他Task结果分类作为交付证明，也不创建虚假收尾运行。

#### Scenario: 直接交付
- **WHEN** 匹配Task已完成且Git证明交付提交在目标远端
- **THEN** 唯一脚本 MUST执行适用自举动作，不要求`noChange`、Candidate或Handoff

#### Scenario: 输入不匹配
- **WHEN** Task、Workspace、基线、提交、目标或远端不能证明一致
- **THEN** 脚本 MUST在相关副作用前停止并保留原交付结果

#### Scenario: 激活局部失败
- **WHEN** 交付已成立但同步、安装或诊断失败
- **THEN** 脚本 MUST记录已发生动作并返回独立attention
- **AND** MUST不撤销Task完成或重新推送业务内容
