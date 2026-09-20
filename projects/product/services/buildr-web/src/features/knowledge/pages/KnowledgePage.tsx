import { ResourceActions } from "../../workbench/components/ResourceActions";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Alert, Button, Breadcrumb, Modal, Space, Spin } from "antd";
import { ArrowUpOutlined } from "@ant-design/icons";
import { useAppShell } from "../../../app/AppShellContext";
import { useResourcePreview } from "../../../app/resource-preview";
import { useWorkspacePageTabs } from "../../../app/pageTabs";
import { WorkspaceStage } from "../../../components/WorkspaceStage";
import { RefreshButton } from "../../../components/RefreshButton";
import { workspaceHref } from "../../../lib/labels";
import { KnowledgeCatalog } from "../components/KnowledgeCatalog";
import { KnowledgeArtifactReader } from "../components/KnowledgeArtifactReader";
import { KnowledgePreviewNotice } from "../components/KnowledgePreviewNotice";
import {
  KnowledgeReadingPane,
  type KnowledgePane,
} from "../components/KnowledgeReadingPane";
import { useKnowledgeReading } from "../useKnowledgeReading";
import { useKnowledgeCatalog } from "../useKnowledgeCatalog";
import { useCompleteKnowledgeReading } from "../useCompleteKnowledgeReading";
import { knowledgeCategory } from "../knowledge-catalog";
import {
  resolveKnowledgePath,
  knowledgeArtifactTarget,
} from "../knowledge-navigation";
import type { KnowledgeIndex, KnowledgeScope } from "../api/knowledge-api";
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
  const isReading = Boolean(objectId || artifactId);
  const catalog = useKnowledgeCatalog({ workspaceId, scope, category, query, refresh, enabled: !isReading });
  const main = useCompleteKnowledgeReading(
      workspaceId || '',
      scope,
      artifactId ? "artifacts" : objectId ? "objects" : undefined,
      artifactId || objectId || undefined,
      refresh,
      isReading,
    ),
    data = main.data;
  const legacy = useKnowledgeReading(scope, "artifacts", legacyReading, refresh, Boolean(legacyReading) && !isReading);
  const [referenceIndex, setReferenceIndex] = useState<{ scope: string; index: KnowledgeIndex | null }>({ scope: scopeKey, index: null });
  const rememberIndex = useCallback((value: KnowledgeIndex) => {
    setReferenceIndex((previous) => previous.scope === scopeKey && previous.index === value ? previous : { scope: scopeKey, index: value });
  }, [scopeKey]);
  useEffect(() => {
    const value = data?.index || legacy.data?.index;
    if (value) rememberIndex(value);
  }, [data?.index, legacy.data?.index, rememberIndex]);
  const index = data?.index || legacy.data?.index || (referenceIndex.scope === scopeKey ? referenceIndex.index : null);
  const pageScope = data?.scope || catalog.data?.scope || legacy.data?.scope;
  const pageLoading = isReading ? main.loading : catalog.loading;
  const selected = index?.objects.find((o) => o.id === objectId),
    primaryArtifact = data?.artifacts?.find((a) => a.id === artifactId);
  const root = useRef<HTMLDivElement>(null),
    positions = useRef<Record<string, number>>({}),
    viewKey = JSON.stringify([scopeKey, objectId, artifactId, category, query]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollContext = useRef({ viewKey, loading: pageLoading });
  scrollContext.current = { viewKey, loading: pageLoading };
  const refreshPage = () => {
    if (!isReading) {
      positions.current[viewKey] = 0;
      root.current?.closest<HTMLElement>(".pane-body")?.scrollTo({ top: 0 });
    }
    setRefresh((value) => value + 1);
  };
  const baseHref = workspaceHref(
    workspaceId,
    scope.kind === "project" ? `/projects/${scopeId}` : `/services/${scopeId}`,
  );
  const title =
    primaryArtifact?.title ||
    selected?.title ||
    (scope.kind === "project" ? "项目知识" : "服务知识");
  useEffect(() => {
    if (!pageScope) return;
    setBreadcrumbParts([
      pageScope.title,
      "知识",
      ...(objectId || artifactId ? [title] : []),
    ]);
    tabs.register({
      key:
        scope.kind === "project"
          ? `proj:${scopeId}`
          : `knowledge:service:${scopeId}`,
      kind: "proj",
      title: pageScope.title,
      path: location.pathname,
    });
  }, [pageScope?.id, pageScope?.title, title, scopeId, workspaceId]);
  useLayoutEffect(() => {
    if (!pageLoading)
      root.current
        ?.closest(".pane-body")
        ?.scrollTo(0, positions.current[viewKey] || 0);
  }, [pageLoading, viewKey]);
  useEffect(() => {
    const host = root.current?.closest<HTMLElement>(".pane-body");
    if (!host) return;
    const observeScroll = () => {
      if (scrollContext.current.viewKey !== viewKey || scrollContext.current.loading) return;
      positions.current[viewKey] = host.scrollTop;
      setShowBackToTop(host.scrollTop > 160);
    };
    observeScroll();
    host.addEventListener("scroll", observeScroll, { passive: true });
    return () => host.removeEventListener("scroll", observeScroll);
  }, [viewKey, pageLoading]);
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
  }, [legacyReading, index, scopeKey]);
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
    const a = (!isReading ? catalog.data?.items.find((a) => a.id === id) : undefined)
      || index?.artifacts.find((a) => a.id === id);
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
    if (s.kind === "skill" && s.skillId && s.path === 'SKILL.md') {
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
      articles: (isReading ? index?.artifacts : catalog.data?.items)
        ?.filter(
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
      scope: pageScope,
      objectId,
      artifactId,
      artifactKind: primaryArtifact?.kind,
      indexRevision: isReading ? data?.revision : catalog.data?.revision,
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
  const unavailableSources = data?.observations.filter(item => ["missing", "unreadable"].includes(item.status)) || [];
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
                onIndex={rememberIndex}
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
        <nav className="knowledge-sticky-navigation" aria-label="知识阅读导航">
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
                <Link to={baseHref}>{pageScope?.title || "返回详情"}</Link>
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
        {showBackToTop && <Button
          id="knowledge-back-to-top"
          type="text"
          size="small"
          icon={<ArrowUpOutlined />}
          onClick={() => root.current?.closest<HTMLElement>(".pane-body")?.scrollTo({ top: 0, behavior: "smooth" })}
        >回到顶部</Button>}
        </nav>
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
            <ResourceActions size="middle" resource={pageScope ? { kind: "knowledge", key: "knowledge:" + scopeKey + ":" + (artifactId || objectId || "home"), label: title, href: location.pathname + location.search } : null} />
            <RefreshButton label="刷新当前知识" text="刷新" loading={pageLoading} onClick={refreshPage} />
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
        <KnowledgePreviewNotice sourceDirectory={pageScope?.directory} />
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
        {main.relatedErrors.map(error => <Alert key={error} type="warning" message={error} />)}
        {isReading && main.error ? (
          <Alert type="error" message={main.error} />
        ) : isReading && main.loading ? (
          <Spin />
        ) : data && isReading ? (
          <>
            {selected && (
              <p className="knowledge-summary">{selected.summary}</p>
            )}
            {unavailableSources.length > 0 && <Alert type="warning" showIcon data-knowledge-unavailable-sources
              message="部分来源缺失或暂不可读，其余内容仍可查看。"
              description={<Space wrap>{unavailableSources.map(item => <Button key={item.id} type="link" onClick={() => openSource(item.id)}>
                {index?.sources.find(source => source.id === item.id)?.title || item.id} · {item.status === "missing" ? "缺失" : "不可读"}
              </Button>)}</Space>} />}
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
        ) : !isReading ? (
          <KnowledgeCatalog
            entries={catalog.data?.items || []}
            matchingCount={catalog.data?.matchingCount || 0}
            loading={catalog.loading}
            loadingMore={catalog.loadingMore}
            hasMore={catalog.data?.hasMore || false}
            error={catalog.error}
            loadMoreError={catalog.loadMoreError}
            changed={catalog.changed}
            canConstruct={Boolean(pageScope)}
            category={category}
            query={query}
            onFilter={(view, q) => move({ view, q }, true)}
            onOpen={openPrimary}
            onConstruct={construct}
            onLoadMore={catalog.loadMore}
            onRetry={catalog.retryLoadMore}
            onRefresh={refreshPage}
          />
        ) : null}
      </div>
    </WorkspaceStage>
  );
}
