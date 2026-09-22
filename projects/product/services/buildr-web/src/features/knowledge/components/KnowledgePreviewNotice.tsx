import { useState } from "react";
import { Alert } from "antd";

function readPreviewIdentity() {
  const raw = document
    .querySelector('meta[name="buildr-preview"]')
    ?.getAttribute("content");
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw));
    if (
      value?.schemaVersion !== "buildr.local-app-preview/v1" ||
      typeof value.instance !== "string" ||
      typeof value.branch !== "string" ||
      typeof value.head !== "string" ||
      typeof value.worktree !== "string"
    ) return null;
    return {
      instance: value.instance as string,
      branch: value.branch as string,
      head: value.head as string,
      worktree: value.worktree as string,
      dirty: value.dirty === true,
    };
  } catch {
    return null;
  }
}

type Props = { sourceDirectory?: string };

export function KnowledgePreviewNotice({ sourceDirectory }: Props) {
  const [preview] = useState(readPreviewIdentity);
  if (!preview || !sourceDirectory) return null;
  return (
    <Alert
      className="knowledge-preview-notice"
      type="warning"
      showIcon
      message={
        <span>
          <strong>开发中</strong>
          <span> · 启动时分支（Branch）：<code>{preview.branch}</code></span>
        </span>
      }
      description={
        <details>
          <summary>查看来源与预览身份</summary>
          <dl>
            <dt>知识来源目录</dt><dd><code>{sourceDirectory}</code></dd>
            <dt>预览实例</dt><dd>{preview.instance}</dd>
            <dt>预览目录</dt><dd><code>{preview.worktree}</code></dd>
            <dt>启动时提交（Commit）</dt><dd><code>{preview.head}</code></dd>
            <dt>启动时修改状态</dt><dd>{preview.dirty ? "有未提交修改" : "无未提交修改"}</dd>
          </dl>
          <p>内容按读取时的文件显示；以上分支、提交与修改状态记录于预览启动时。</p>
        </details>
      }
    />
  );
}
