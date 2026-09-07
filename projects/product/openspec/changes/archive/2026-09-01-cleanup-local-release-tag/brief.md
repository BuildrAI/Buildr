# 发布成功后清理本地 Tag

## 摘要

正式发布成功并核验远端 Tag 后，release closeout 删除本地同名 Tag，保留全部远端和公开发布事实。

## 背景与问题

当前 closeout 已删除临时 carrier、本地 release branch、lifecycle refs 与任务工作树，却保留可从远端重建的本地 Tag，导致本机必需资源清理不完整。

## 目标与非目标

- 目标：删除与 Publication evidence 和远端 Tag 精确匹配的本地 Tag；支持缺失幂等；漂移时零删除。
- 非目标：不删除或移动远端 Tag，不重新发布 npm 或 GitHub Release，不扫描其他版本。

## 核心流程

release Git owner读取 Publication evidence，核验远端 Tag对象，再核验本地同名 Tag。全部检查通过后，将本地 Tag与其他本地发布资源一起清理；Task Environment仍只清理任务工作树和环境回执。

## 影响、风险与兼容性

本地 Tag删除后可从正式远端重建。错误Tag或网络读取失败时保留现场。公开安装、版本、Tag URL、npm dist-tag和远端release分支不变。

## 验收摘要

- 正式远端 Tag始终保留并与发布证据匹配。
- 本地同名 Tag删除或幂等确认缺失。
- Tag漂移时任何本地发布资源均不删除。
- 重复closeout不重复发布或产生额外Git副作用。

## 技术入口

- `tools/release/release-git-convergence.mjs`
- `test/integration-candidate-release/release-git-convergence.test.mjs`
