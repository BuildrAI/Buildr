/** Identifier fields accept ASCII letters, digits and `._-` only; pasted Unicode dashes and invisible characters are normalized before validation. */
export const CODE_INPUT_PATTERN = '[A-Za-z0-9]([A-Za-z0-9._]|-)*';
export const CODE_INPUT_TITLE = '标识只能包含字母、数字和「. _ -」。';

const UNICODE_DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const INVISIBLE_CHARACTERS = /[\u00AD\u200B-\u200D\uFEFF]/g;

export function normalizeCodeInput(value: string): string {
  return value.replace(UNICODE_DASHES, '-').replace(INVISIBLE_CHARACTERS, '');
}
