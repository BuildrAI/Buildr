export const PACKAGE_VERIFIER_ENV = 'BUILDR_PACKAGE_VERIFIER';

export const PACKAGE_VERIFIERS = Object.freeze([
  Object.freeze({ id: 'static', name: 'package static validation', runner: 'static' }),
  Object.freeze({ id: 'workspace', name: 'package workspace smoke', runner: 'workspace' }),
  Object.freeze({ id: 'commands', name: 'package Commands integration', runner: 'commands' }),
  Object.freeze({ id: 'rules', name: 'package Rules integration', runner: 'rules' }),
  Object.freeze({ id: 'skills', name: 'package Skills integration', runner: 'skills' }),
  Object.freeze({ id: 'runtime', name: 'package runtime integration', runner: 'runtime' }),
]);

export function selectPackageVerifiers(selector = '') {
  if (!selector) return [...PACKAGE_VERIFIERS];
  const requested = selector.split(',').map((value) => value.trim()).filter(Boolean);
  const unknown = requested.filter((id) => !PACKAGE_VERIFIERS.some((step) => step.id === id));
  if (unknown.length > 0) throw new Error(`Unknown package verifier: ${unknown.join(', ')}`);
  return PACKAGE_VERIFIERS.filter((step) => requested.includes(step.id));
}
