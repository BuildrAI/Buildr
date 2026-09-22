/** Resolve document links inside the selected knowledge scope, never arbitrary URLs. */
export function resolveKnowledgePath(
  base: string,
  href: string,
): string | null {
  if (
    /^[a-z]+:/i.test(href) ||
    href.startsWith("/") ||
    href.includes("\\") ||
    href.includes("\0")
  )
    return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split("#")[0]);
  } catch {
    return null;
  }
  if (
    /^[a-z]+:/i.test(decoded) ||
    decoded.startsWith("/") ||
    decoded.includes("\\")
  )
    return null;
  const parts = base.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (segment && segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}
export function selectedKnowledgeObject(
  event: { source: unknown; origin: string; data: unknown },
  frame: unknown,
  objects: string[],
): string | null {
  if (
    !frame ||
    event.source !== frame ||
    event.origin !== "null" ||
    !event.data ||
    typeof event.data !== "object"
  )
    return null;
  const value = event.data as Record<string, unknown>;
  return value.type === "buildr.knowledge.select" &&
    typeof value.objectId === "string" &&
    objects.includes(value.objectId)
    ? value.objectId
    : null;
}

/** Follow declared article ownership when crossing topics; do not retain an unrelated topic. */
export function knowledgeArtifactTarget(
  artifact: { id: string; kind: string; objects: string[] },
  current: string | null,
): { object?: string; artifact?: string } {
  const object =
    current && artifact.objects.includes(current)
      ? current
      : artifact.objects.length === 1
        ? artifact.objects[0]
        : undefined;
  return artifact.kind === "document" && object
    ? { object }
    : { object, artifact: artifact.id };
}
