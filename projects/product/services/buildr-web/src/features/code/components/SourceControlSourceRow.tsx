import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Layout = 'full' | 'branch-clipped' | 'name-status' | 'name';
type Props = {
  className: string;
  worktreeId?: string;
  active: boolean;
  measureKey: string;
  children(layout: {branchVisible: boolean; shortcutsVisible: boolean}): ReactNode;
};

/** Keep one live set of controls; hidden controls still provide stable natural widths. */
export function SourceControlSourceRow({className, worktreeId, active, measureKey, children}: Props) {
  const row = useRef<HTMLDivElement>(null);
  const [{layout, branchWidth}, setDensity] = useState<{layout:Layout; branchWidth:number|null}>({layout:'full', branchWidth:null});
  useLayoutEffect(() => {
    const element = row.current;
    if (!element || !active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!element.clientWidth) return;
      const style = getComputedStyle(element);
      const width = Math.floor(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const outerWidth = (part: HTMLElement | null) => {
        if (!part) return 0;
        const appearance = getComputedStyle(part);
        return part.getBoundingClientRect().width + parseFloat(appearance.marginLeft) + parseFloat(appearance.marginRight);
      };
      const leading = element.querySelector<HTMLElement>(':scope > .source-control-fold,:scope > .source-control-worktree-icon');
      const name = element.querySelector<HTMLElement>('.source-control-row-name-text');
      const branch = element.querySelector<HTMLElement>('.source-control-row-branch-measure');
      const branchButton = branch?.closest<HTMLElement>('.source-control-row-action-button');
      const branchStyle = branchButton && getComputedStyle(branchButton);
      const naturalBranchWidth = branch ? Math.ceil(Math.max(branch.getBoundingClientRect().width + (branchStyle ? parseFloat(branchStyle.paddingLeft) + parseFloat(branchStyle.paddingRight) + parseFloat(branchStyle.borderLeftWidth) + parseFloat(branchStyle.borderRightWidth) : 0), branchStyle ? parseFloat(branchStyle.minWidth) || 0 : 0)) : 0;
      const shortcuts = element.querySelector<HTMLElement>(':scope > .source-control-row-shortcuts');
      const menu = element.querySelector<HTMLElement>(':scope > .source-control-row-action-slot');
      const shortcutWidth = outerWidth(shortcuts);
      const gap = parseFloat(style.columnGap) || 0;
      const fixed = outerWidth(leading) + outerWidth(menu) + gap * (1 + Number(Boolean(menu)) + Number(shortcutWidth > 0));
      const nameWidth = name?.getBoundingClientRect().width || 0;
      const copyGap = parseFloat(getComputedStyle(element.querySelector('.source-control-row-copy')!).columnGap) || 0;
      const remaining = Math.floor(width - fixed - nameWidth - shortcutWidth - (naturalBranchWidth ? copyGap : 0));
      const branchVisible = naturalBranchWidth > 0 && remaining >= Math.min(naturalBranchWidth, 48);
      const next:Layout = branchVisible ? remaining >= naturalBranchWidth ? 'full' : 'branch-clipped'
        : Math.ceil(fixed + nameWidth + shortcutWidth) <= width ? naturalBranchWidth ? 'name-status' : 'full' : 'name';
      const allocated = branchVisible ? Math.min(naturalBranchWidth, remaining) : 24;
      setDensity(previous => previous.layout === next && previous.branchWidth === allocated ? previous : {layout:next, branchWidth:allocated});
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    element.querySelectorAll('.source-control-row-name-text,.source-control-row-branch-measure,.source-control-row-shortcuts').forEach(part => observer.observe(part));
    measure();
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [active, measureKey]);
  return <div ref={row} className={className} data-source-worktree={worktreeId} data-source-row-layout={layout} style={branchWidth === null ? undefined : {'--source-control-row-branch-width':branchWidth + 'px'} as CSSProperties}>
    {children({branchVisible: layout === 'full' || layout === 'branch-clipped', shortcutsVisible: layout !== 'name'})}
  </div>;
}
