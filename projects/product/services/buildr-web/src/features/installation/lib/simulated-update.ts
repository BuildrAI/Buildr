/**
 * 开发版模拟更新目标：只提升版本号末尾数字段，不接触真实 registry。
 * 1.2.3 → 1.2.4；0.1.0-rc.47 → 0.1.0-rc.48。
 */
export function simulatedTargetVersion(current: string | null | undefined): string | null {
  if (!current) return null;
  const bumped = current.replace(/(\d+)(?=\D*$)/u, (digits) => String(Number(digits) + 1));
  return bumped !== current ? bumped : null;
}
