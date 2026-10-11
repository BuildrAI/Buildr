import { LanguageDescription } from '@codemirror/language';

/** Common source formats load locally on demand; other UTF-8 files remain editable. */
export const fileEditingLanguages = [
  LanguageDescription.of({ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'], load: async () => (await import('@codemirror/lang-markdown')).markdown() }),
  LanguageDescription.of({ name: 'JavaScript', extensions: ['js', 'mjs', 'cjs', 'jsx'], load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }) }),
  LanguageDescription.of({ name: 'TypeScript', extensions: ['ts', 'mts', 'cts', 'tsx'], load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'JSON', extensions: ['json', 'jsonc'], load: async () => (await import('@codemirror/lang-json')).json() }),
  LanguageDescription.of({ name: 'CSS', extensions: ['css'], load: async () => (await import('@codemirror/lang-css')).css() }),
  LanguageDescription.of({ name: 'HTML', extensions: ['html', 'htm'], load: async () => (await import('@codemirror/lang-html')).html() }),
  LanguageDescription.of({ name: 'YAML', extensions: ['yml', 'yaml'], load: async () => (await import('@codemirror/lang-yaml')).yaml() }),
];
