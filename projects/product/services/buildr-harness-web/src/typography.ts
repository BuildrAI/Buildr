/**
 * Product typography authority. Page styles reference these roles, not local
 * pixel values. Reading and dense source text intentionally have separate roles.
 */
export const productTypography = {
  meta: 12,
  secondary: 13,
  body: 14,
  reading: 15,
  code: 13,
  subheading: 16,
  heading: 18,
  title: 22,
  page: 26,
  display: 32,
} as const;

/** Icon geometry is independent of readable text; never use it for labels. */
export const productIconSizes = {
  tiny: 10,
  small: 12,
  label: 14,
  regular: 16,
  navigation: 18,
  large: 20,
  prominent: 24,
  hero: 28,
  display: 32,
  empty: 40,
  illustration: 48,
  splash: 64,
} as const;

type StyleTarget = { setProperty(name: string, value: string): void };

/** Applied by the shared theme, including every existing prototype entry. */
export function applyProductTypography(style: StyleTarget): void {
  for (const [role, size] of Object.entries(productTypography)) {
    style.setProperty(`--font-size-${role}`, `${size}px`);
  }
  for (const [role, size] of Object.entries(productIconSizes)) {
    style.setProperty(`--icon-size-${role}`, `${size}px`);
  }
}
