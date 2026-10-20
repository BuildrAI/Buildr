import type { ChangeEvent } from 'react';

/** 名称、标题等单行文本：输入时去掉前导空格并清除中间换行，失焦时收掉尾部空格。 */
export function textFieldTrim(onChange: (text: string, event: ChangeEvent<HTMLInputElement>) => void) {
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.trimStart().replace(/\n/g, ''), event),
    onBlur: (event: ChangeEvent<HTMLInputElement>) => { const text = event.target.value.trim(); if (text !== event.target.value) onChange(text, event); },
  };
}

/** 服务编码、分支名、Git 地址、目录等不允许空白字符的值：输入即去掉全部空白。 */
export function codeFieldTrim(onChange: (text: string, event: ChangeEvent<HTMLInputElement>) => void) {
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value.replace(/\s+/g, ''), event),
    onBlur: (event: ChangeEvent<HTMLInputElement>) => { const text = event.target.value.trim(); if (text !== event.target.value) onChange(text, event); },
  };
}
