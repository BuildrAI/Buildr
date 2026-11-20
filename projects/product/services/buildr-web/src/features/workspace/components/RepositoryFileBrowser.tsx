import { RepositoryFileBrowser as HarnessExplorer, type RepositoryFileBrowserProps, type WorkbenchMarkdownInput } from '../../../../../buildr-harness-web/src/explorer';
import { MarkdownHost } from '../../../components/MarkdownHost';
import type { MarkdownRenderOptions } from '../../../markdown';
export type { RepositoryFilePage, RepositoryPreviewFile, RepositoryTreeScope } from '../../../../../buildr-harness-web/src/explorer';

export const renderEngineeringMarkdown = (input: WorkbenchMarkdownInput) => <MarkdownHost {...input} options={input.options as MarkdownRenderOptions} />;
export function RepositoryFileBrowser(props: RepositoryFileBrowserProps) {
  return <HarnessExplorer {...props} renderMarkdown={renderEngineeringMarkdown} />;
}
