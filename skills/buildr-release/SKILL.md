---
name: buildr-release
description: 准备、检查、发布或恢复 Buildr 主包、DSH 插件或联合版本时使用；按统一发布流程核对独立版本、共享源码选择、真实包兼容、逐包授权与恢复事实。
---

# Buildr 发布

本技能只处理 Buildr 自举工作空间的产品发布，不作为 npm 内置技能分发。开始时从当前工作空间根读取唯一发布流程正文 `projects/product/knowledge/docs/flows/open-source-release.md`；[线上入口](https://github.com/BuildrAI/Buildr/blob/dev/projects/product/knowledge/docs/flows/open-source-release.md)访问同一正文。包选择、命令、验证、公开顺序、恢复和清理只在那里维护。插件专属构建与身份由该正文链接到插件说明，不在技能（Skill）中另写流程。

将用户意图路由到正文对应入口：检查只读当前事实；准备停在公开发布之前；发布需有当前所选包准确版本与内容的授权；恢复保留已成立效果，仅继续未完成事项。已有授权在范围未变时继续有效，平台权限及必要审批仍须满足。

完成时按正文报告逐包发布、源码纳入、任务登记、共享资源清理及未验证边界。任务收尾交给 `task-finish`，本机自举只交给 `buildr-self-bootstrap-sync` 的唯一执行器；不自行替代对应所有者（Owner）。
