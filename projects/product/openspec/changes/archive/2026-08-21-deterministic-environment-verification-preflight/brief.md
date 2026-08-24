# 确定性的 Environment 与 Verification 准备闭包

## 一句话摘要

让 Buildr 在正式验证前自动使用 Project 声明和 Environment Receipt闭合所选capability的真实工具链，不再让Agent或用户手工猜Node、路径和依赖。

## 背景与问题

当前Task Environment `ready`只证明Task scope已选择的基础准备current，不能证明随后选中的Verification capability具备辅助Service依赖、项目本地工具和权威runtime。Buildr自举任务因此多次在正式验证阶段才发现`BUILDR_NODE`、cwd、Buildr Web依赖或TypeScript版本问题；同一结构也可能出现在Java、Python或其他用户Project。

## 目标与非目标

目标是分开Task基础准备与capability辅助准备，由Verification计算闭包、Task Environment唯一执行与恢复；同时分离Workspace路径引用与executable authority、自动传递runtime invocation，并保持npm发行版不依赖Product源码环境。

本Change不扫描技术栈、不创建通用包管理或测试DAG、不扩大Task scope、不保存任意env/secret，也不修改Buildr Web界面。正式准备门禁只约束Formal Verification证据路径，不阻止无关开发、只读调查或明确标记的非正式检查。

## 受影响用户或角色

- 使用Buildr推进正式Task的Agent与维护者。
- 声明Project/Service准备Recipe与Verification capability的团队。
- 安装npm发行版并运行CLI、Doctor、sync或`buildr web`的用户。

## 核心流程

1. Task Environment按Task scope准备基础执行环境并保存权威runtime/path facts。
2. Formal Verification选择capabilities后，从`verification.yml`与`preparation.yml`计算辅助准备闭包。
3. 缺口由同一Task Environment幂等准备；preflight current后才启动昂贵命令、Browser或外部资源。
4. Verification Result只保存portable facts，不复制机器环境。

## 关键变化

- Capability可引用声明Recipe，但辅助scope不获得Task内容所有权。
- Plan/Receipt分别使用typed Workspace path和closed executable authority，并投射权威runtime invocation。
- Browser验证只使用Task Environment中的Buildr Web本地工具链。
- npm安装、Launcher和随包`web-dist`继续与源码preparation隔离。
- coverage、declaration、preparation、authorization与external-system问题按各自owner分类，不全部交给Task Environment。

## 影响、风险与兼容性

新writer需要Plan/Receipt schema演进；旧current只读，显式prepare升级。没有preparation reference的既有Verification declaration继续有效。主要风险是辅助scope越权、runtime invocation变成env旁路和正式门禁过度阻塞，分别通过同Project/声明Recipe限制、closed无secret shape与安全降级边界控制。

## 验收摘要

- selected capability缺少工具链时在execution副作用前得到精确gap、owner分类和适用恢复方向。
- Environment恢复后runner消费相同runtime/path identities，不回退全局工具。
- auxiliary preparation不改变Task scope、Change或Content Target。
- npm发行版的CLI/Web不需要Product checkout、源码`node_modules`、源码TypeScript或手工`BUILDR_NODE`。
- Buildr暂不可用时只阻止正式Verification/Result/完成声明，不阻止无关工作或明确非正式检查。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs)
- [Implementation Tasks](tasks.md)
