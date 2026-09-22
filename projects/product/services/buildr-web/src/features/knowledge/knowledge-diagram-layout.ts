export type KnowledgeDiagramSize = { width: number; height: number };

/** Archify's native embed adds 0.5rem (8px) on every side of the main SVG. */
export function knowledgeDiagramPreviewHeight(
  containerWidth: number,
  size?: KnowledgeDiagramSize | null,
): number | null {
  if (
    !size ||
    ![containerWidth, size.width, size.height].every(Number.isFinite) ||
    containerWidth <= 0 || size.width <= 0 || size.height <= 0
  ) return null;
  const height = Math.max(0, containerWidth - 16) * size.height / size.width + 16;
  return Number.isFinite(height) ? Math.ceil(height) : null;
}
