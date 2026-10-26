/** Exercise the actual hover/fixed navigation modes without a hidden sidebar assumption. */
export async function showPrimaryNavigation(page: any, area: 'code' | 'workspace' | 'workbench') {
  const trigger = page.locator('.primary-navigation-rail button[data-nav="' + area + '"]');
  if (await page.locator('.primary-secondary-navigation.is-fixed:visible').count()) {
    if (await page.locator('.primary-navigation').getAttribute('data-fixed-area') !== area) await trigger.click();
  }
  else {
    // A prior navigation can close the preview while the pointer remains on
    // its trigger. Leave first so this is a real new hover, as a user would do.
    await page.mouse.move(400, 4);
    await trigger.hover();
  }
  try {
    await page.locator('.primary-secondary-navigation:visible[data-navigation-area="' + area + '"]').waitFor();
  } catch (error) {
    const state = await page.evaluate(() => ({
      navigation: [...document.querySelectorAll('.primary-secondary-navigation')].map(element => ({ area: element.getAttribute('data-navigation-area'), hidden: element.hasAttribute('hidden'), mode: element.getAttribute('data-navigation-mode') })),
      triggers: [...document.querySelectorAll('.primary-navigation-trigger')].map(element => ({ area: element.getAttribute('data-nav'), hover: element.matches(':hover'), expanded: element.getAttribute('aria-expanded') })),
      focus: document.activeElement?.getAttribute('class'),
    }));
    throw new Error('Navigation did not open: ' + JSON.stringify(state), { cause: error });
  }
}
