/** The sidebar list switch and the reader view tabs are independent; journeys that need both drive each control. */
export async function selectSourceControlView(root: any, view: 'changes' | 'history') {
  const label = view === 'history' ? '提交历史' : '未提交变更';
  const switcher = root.locator('.source-control-browse-tabs');
  if ((await switcher.locator('.ant-segmented-item:has(input:checked)').innerText()).trim() !== label) await switcher.getByText(label, {exact: true}).click();
  const tabs = root.locator('.source-control-view-tabs');
  if (await tabs.getByRole('tab', {name: label, exact: true}).getAttribute('aria-selected') !== 'true') await tabs.getByRole('tab', {name: label, exact: true}).click();
}
