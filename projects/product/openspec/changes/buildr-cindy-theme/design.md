## Context

Cindy 以隔离的顶层 WebView 加载正式 Buildr Web。

## Goals / Non-Goals

同步正文、底色和边界色，保持独立浏览器的默认配色。插件继续使用现有服务。

## Decisions

采用可选的 `--cindy-workspace-*` 白名单语义变量，宿主通过 CSS 注入更新，网页在未提供变量时使用原有颜色。源码随 Buildr 维护，已有安装用相同插件 ID 更新。
