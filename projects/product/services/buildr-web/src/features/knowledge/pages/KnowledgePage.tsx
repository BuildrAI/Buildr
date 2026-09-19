import { ResourceActions } from "../../workbench/components/ResourceActions";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Alert, Button, Breadcrumb, Modal, Space, Spin } from "antd";
import { useAppShell } from "../../../app/AppShellContext";
import { useResourcePreview } from "../../../app/resource-preview";
import { useWorkspacePageTabs } from "../../../app/pageTabs";
import { WorkspaceStage } from "../../../components/WorkspaceStage";
import { workspaceHref } from "../../../lib/labels";
import { KnowledgeCatalog } from "../components/KnowledgeCatalog";
import { KnowledgeArtifactReader } from "../components/KnowledgeArtifactReader";
import {
  KnowledgeReadingPane,
  type KnowledgePane,
} from "../components/KnowledgeReadingPane";
import { useKnowledgeReading } from "../useKnowledgeReading";
import { knowledgeCategory } from "../knowledge-catalog";
import {
  resolveKnowledgePath,
  knowledgeArtifactTarget,
} from "../knowledge-navigation";
import type { KnowledgeScope } from "../api/knowledge-api";
import "../knowledge.css";
export function KnowledgePage() {
  const { scopeKind, scopeId = "" } = useParams();
  const scope: KnowledgeScope = {
      kind: scopeKind === "service" ? "service" : "project",
      id: scopeId,
    },
    scopeKey = `${scope.kind}:${scope.id}`;
  const { workspaceId, setBreadcrumbParts, openAgentAction } = useAppShell(),
    previews = useResourcePreview(),
    tabs = useWorkspacePageTabs(workspaceId),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  const objectId = params.get("object"),
    artifactId = params.get("artifact"),
    legacyReading = params.get("reading"),
    parentProject = params.get("fromProject"),
    category = knowledgeCategory(params.get("view")),
    query = params.get("q") || "";
  const [refresh, setRefresh] = useState(0),
    [readingState, setReadingState] = useState<{
      scope: string;
      items: KnowledgePane[];
      active: string | null;
    }>({ scope: scopeKey, items: [], active: null });
  const panes = readingState.scope === scopeKey ? readingState.items : [],
    activePane = readingState.scope === scopeKey ? readingState.active : null;
  const [referenceChoices, setReferenceChoices] = useState<string[]>([]),
    [linkNotice, setLinkNotice] = useState(""),
    [selectedReference, setSelectedReference] = useState<string | null>(null);
  const main = useKnowledgeReading(
      scope,
      artifactId ? "artifacts" : objectId ? "objects" : undefined,
      artifactId || objectId,
      refresh,
    ),
    data = main.data,
    index = data?.index || null;
  const selected = index?.objects.find((o) => o.id === objectId),
    primaryArtifact = data?.artifacts?.find((a) => a.id === artifactId);
  const root = useRef<HTMLDivElement>(null),
    positions = useRef<Record<string, number>>({}),
    viewKey = JSON.stringify([objectId, artifactId, category, query]);
  const baseHref = workspaceHref(
    workspaceId,
    scope.kind === "project" ? `/projects/${scopeId}` : `/services/${scopeId}`,
  );
  const title =
    primaryArtifact?.title ||
    selected?.title ||
    (scope.kind === "project" ? "项目知识" : "服务知识");
  useEffect(() => {
    if (!data) return;
    setBreadcrumbParts([
      data.scope.title,
      "知识",
      ...(objectId || artifactId ? [title] : []),
    ]);
    tabs.register({
      key:
        scope.kind === "project"
          ? `proj:${scopeId}`
          : `knowledge:service:${scopeId}`,
      kind: "proj",
      title: data.scope.title,
      path: location.pathname,
    });
  }, [data?.scope.id, data?.scope.title, title, scopeId, workspaceId]);
  useLayoutEffect(() => {
    if (!main.loading)
      root.current
        ?.closest(".pane-body")
        ?.scrollTo(0, positions.current[viewKey] || 0);
  }, [main.loading, viewKey]);
  useEffect(() => {
    const item = index?.artifacts.find((a) => a.id === legacyReading);
    if (!item) return;
    setReadingState((s) => {
      const items = s.scope === scopeKey ? s.items : [];
      const key = `artifact:${item.id}`;
      return items.some((p) => p.key === key)
        ? s
        : {
            scope: scopeKey,
            items: [
              ...items,
              {
                key,
                kind: "artifact",
                id: item.id,
                title: item.title,
                origin: "关联阅读",
              },
            ],
            active: key,
          };
    });
  }, [legacyReading, index?.scope.id]);
  const move = (next: Record<string, string | undefined>, replace = false) => {
    positions.current[viewKey] =
      root.current?.closest(".pane-body")?.scrollTop || 0;
    const value = new URLSearchParams(
      parentProject ? { fromProject: parentProject } : {},
    );
    if (legacyReading) value.set("reading", legacyReading);
    for (const [key, item] of Object.entries(next))
      if (item) value.set(key, item);
    setLinkNotice("");
    setReferenceChoices([]);
    setParams(value, { replace, state: location.state });
  };
  const openPrimary = (id: string) => {
    const a = index?.artifacts.find((a) => a.id === id);
    if (a)
      move({
        ...knowledgeArtifactTarget(a, objectId),
        view: category,
        q: query,
      });
  };
  const readingAnchor = useRef<HTMLElement | null>(null);
  const sideOpen =
    panes.length > 0 ||
    Boolean(previews?.states[location.pathname]?.items.length);
  useLayoutEffect(() => {
    if (!sideOpen) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const anchor = readingAnchor.current;
        if (anchor?.isConnected && root.current?.contains(anchor))
          anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [sideOpen]);
  const rememberAnchor = () => {
    const element = document.activeElement;
    readingAnchor.current =
      element instanceof HTMLElement && root.current?.contains(element)
        ? element
        : null;
  };
  const openPane = (
    kind: KnowledgePane["kind"],
    id: string,
    description?: string,
  ) => {
    const item =
      kind === "artifact"
        ? index?.artifacts.find((a) => a.id === id)
        : index?.sources.find((s) => s.id === id);
    if (!item) return;
    rememberAnchor();
    const key = `${kind}:${id}`;
    setReadingState((s) => {
      const items = s.scope === scopeKey ? s.items : [];
      return {
        scope: scopeKey,
        items: items.some((p) => p.key === key)
          ? items
          : [
              ...items,
              { key, kind, id, title: item.title, origin: title, description },
            ],
        active: key,
      };
    });
    previews?.activate(location.pathname, "");
  };
  const closePane = (key: string) => {
    setReadingState((s) => {
      const items = s.items.filter((p) => p.key !== key);
      return {
        ...s,
        items,
        active: s.active === key ? items.at(-1)?.key || null : s.active,
      };
    });
    if (key === `artifact:${legacyReading}`) {
      const next = new URLSearchParams(params);
      next.delete("reading");
      setParams(next, { replace: true, state: location.state });
    }
  };
  const openSource = (id: string, description?: string) => {
    const s = index?.sources.find((s) => s.id === id);
    if (!s) return;
    rememberAnchor();
    setSelectedReference(id);
    if (s.kind === "skill" && s.skillId) {
      previews?.open(
        location.pathname,
        workspaceHref(workspaceId, `/skills/${encodeURIComponent(s.skillId)}`),
      );
      return;
    }
    openPane("source", id, description);
  };
  const follow = (
    base: string,
    href: string,
    file = false,
    description?: string,
  ) => {
    const path = resolveKnowledgePath(base, href);
    if (!path) return;
    const sources =
        index?.sources.filter((s) => (s.link || s.path) === path) || [],
      artifact = index?.artifacts.find((a) => a.path === path);
    if (file && sources.length === 1) {
      openSource(sources[0].id, description);
      return;
    }
    if (artifact) {
      if (artifact.kind === "document") openPrimary(artifact.id);
      else openPane("artifact", artifact.id);
      return;
    }
    if (sources.length === 1) openSource(sources[0].id, description);
    else if (sources.length > 1) setReferenceChoices(sources.map((s) => s.id));
    else setLinkNotice("该文件尚未登记阅读关联，请在完善内容时补齐。");
  };
  const reader = {
    index,
    workspaceId: workspaceId || "",
    scope,
    onLink: (base: string, href: string) => follow(base, href),
    onFile: (base: string, href: string, description?: string) =>
      follow(base, href, true, description),
    onSource: openSource,
    onOpen: (id: string) => openPane("artifact", id),
    onObject: (id: string) => move({ object: id, view: category, q: query }),
  };
  const construct = (mode: "construct" | "diagram" | "improve") =>
    openAgentAction("knowledge", {
      mode,
      readingPath: location.pathname + location.search,
      topic: title,
      articles: index?.artifacts
        .filter(
          (a) =>
            a.kind === "document" &&
            (!objectId || a.objects.includes(objectId)),
        )
        .map((a) => ({
          id: a.id,
          title: a.title,
          path: a.path,
          objects: a.objects,
        })),
      scope: data?.scope,
      objectId,
      artifactId,
      artifactKind: primaryArtifact?.kind,
      indexRevision: data?.revision,
      observations: data?.observations.map((o) => ({
        id: o.id,
        digest: o.digest,
        status: o.status,
      })),
      artifacts: data?.artifacts?.map((a) => ({ id: a.id, digest: a.digest })),
      selectedSource: selectedReference,
      relatedReadings: panes.map((p) => ({
        kind: p.kind,
        id: p.id,
        title: p.title,
        origin: p.origin,
        observation: p.observation,
      })),
    });
  const changed =
    data?.observations.filter((o) =>
      ["changed", "missing", "unreadable"].includes(o.status),
    ) || [];
  return (
    <WorkspaceStage
      pageTabs={tabs.tabs}
      onClosePageTab={tabs.close}
      objectTabs={panes.map((p) => ({
        key: p.key,
        kind: "doc" as const,
        title: p.title,
      }))}
      activeObject={activePane}
      onActivateObject={(key) =>
        setReadingState((s) => ({ ...s, active: key }))
      }
      onCloseObject={closePane}
      objectContent={
        <>
          {panes.map((p) => (
            <div key={p.key} hidden={activePane !== p.key}>
              <KnowledgeReadingPane
                pane={p}
                scope={scope}
                refresh={refresh}
                reader={reader}
                onPrimary={openPrimary}
                onObserved={(key, observation) =>
                  setReadingState((s) =>
                    s.scope !== scopeKey || !s.items.some((p) => p.key === key)
                      ? s
                      : {
                          ...s,
                          items: s.items.map((p) =>
                            p.key === key ? { ...p, observation } : p,
                          ),
                        },
                  )
                }
              />
            </div>
          ))}
        </>
      }
    >
      <div ref={root} className="knowledge-page">
        <Breadcrumb
          items={[
            ...(parentProject
              ? [
                  {
                    title: (
                      <Link
                        to={workspaceHref(
                          workspaceId,
                          `/projects/${encodeURIComponent(parentProject)}`,
                        )}
                      >
                        返回项目
                      </Link>
                    ),
                  },
                ]
              : []),
            {
              title: (
                <Link to={baseHref}>{data?.scope.title || "返回详情"}</Link>
              ),
            },
            {
              title:
                objectId || artifactId ? (
                  <Button
                    type="link"
                    onClick={() => move({ view: category, q: query })}
                  >
                    {scope.kind === "project" ? "项目知识" : "服务知识"}
                  </Button>
                ) : (
                  "知识"
                ),
            },
            ...(objectId || artifactId ? [{ title }] : []),
          ]}
        />
        <div className="knowledge-title">
          <div>
            <h1>{title}</h1>
            {!(objectId || artifactId) && (
              <p className="knowledge-summary">
                以事实为依据，理解这个
                {scope.kind === "project" ? "项目" : "服务"}。
              </p>
            )}
          </div>
          <Space wrap>
            <ResourceActions resource={data ? { kind: "knowledge", key: "knowledge:" + scopeKey + ":" + (artifactId || objectId || "home"), label: title, href: location.pathname + location.search } : null} />
            <Button onClick={() => setRefresh((v) => v + 1)}>刷新</Button>
            {(objectId || artifactId) && (
              <Button
                disabled={!data || main.loading || Boolean(main.error)}
                onClick={() => construct("improve")}
              >
                完善当前内容
              </Button>
            )}
          </Space>
        </div>
        <Modal
          title="选择对应文件"
          open={referenceChoices.length > 0}
          footer={null}
          onCancel={() => setReferenceChoices([])}
        >
          {referenceChoices.map((id) => (
            <p key={id}>
              <Button
                onClick={() => {
                  setReferenceChoices([]);
                  openSource(id);
                }}
              >
                {index?.sources.find((s) => s.id === id)?.title || id}
              </Button>
            </p>
          ))}
        </Modal>
        {linkNotice && (
          <Alert
            type="info"
            closable
            onClose={() => setLinkNotice("")}
            message={linkNotice}
          />
        )}
        {main.error ? (
          <Alert type="error" message={main.error} />
        ) : main.loading ? (
          <Spin />
        ) : data && (objectId || artifactId) ? (
          <>
            {selected && (
              <p className="knowledge-summary">{selected.summary}</p>
            )}
            {changed.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="相关文件已有变化或暂不可读，请结合当前文件理解下面内容。"
                description={
                  <Space wrap>
                    {changed.map((o) => (
                      <Button
                        key={o.id}
                        type="link"
                        onClick={() => openSource(o.id)}
                      >
                        {index?.sources.find((s) => s.id === o.id)?.title ||
                          o.id}{" "}
                        ·{" "}
                        {o.status === "changed"
                          ? "已变化"
                          : o.status === "missing"
                            ? "缺失"
                            : "不可读"}
                      </Button>
                    ))}
                  </Space>
                }
              />
            )}
            {(artifactId
              ? data.artifacts?.filter((a) => a.id === artifactId) || []
              : (data.artifacts || []).filter((a) => a.kind === "document")
            ).map((a) => (
              <KnowledgeArtifactReader
                key={a.id}
                {...reader}
                showTitle={false}
                artifact={a}
                artifacts={data.artifacts || []}
              />
            ))}
            {!artifactId &&
              !data.artifacts?.some((a) => a.kind === "document") &&
              data.artifacts?.map((a) => (
                <KnowledgeArtifactReader
                  key={a.id}
                  {...reader}
                  artifact={a}
                  artifacts={data.artifacts || []}
                />
              ))}
          </>
        ) : data ? (
          <KnowledgeCatalog
            index={data.index}
            category={category}
            query={query}
            onFilter={(view, q) => move({ view, q }, true)}
            onOpen={openPrimary}
            onConstruct={construct}
          />
        ) : null}
      </div>
    </WorkspaceStage>
  );
}
