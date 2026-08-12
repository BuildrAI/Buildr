let workspaceId: string | null = null;

export function getWorkspaceId(): string | null {
  return workspaceId;
}

export function setWorkspaceId(value: string | null): void {
  workspaceId = value || null;
}
