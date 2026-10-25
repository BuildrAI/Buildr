export type SourceRowLayout = 'full' | 'branch-clipped' | 'name-status' | 'name';

/** DOM measurements are inputs; fitting and progressive hiding remain pure. */
export function sourceControlRowDensity(input: {width: number; fixed: number; nameWidth: number; shortcutWidth: number; naturalBranchWidth: number; copyGap: number}): {layout: SourceRowLayout; branchWidth: number} {
  const {width, fixed, nameWidth, shortcutWidth, naturalBranchWidth, copyGap} = input;
  const remaining = Math.floor(width - fixed - nameWidth - shortcutWidth - (naturalBranchWidth ? copyGap : 0));
  const visible = naturalBranchWidth > 0 && remaining >= Math.min(naturalBranchWidth, 48);
  const layout = visible ? remaining >= naturalBranchWidth ? 'full' : 'branch-clipped'
    : Math.ceil(fixed + nameWidth + shortcutWidth) <= width ? naturalBranchWidth ? 'name-status' : 'full' : 'name';
  return {layout, branchWidth: visible ? Math.min(naturalBranchWidth, remaining) : 24};
}
