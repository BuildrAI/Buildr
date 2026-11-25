export function pluginPackageName(released: boolean): string {
  return released ? '@buildr-ai/dsh-buildr-development' : '@buildr-ai/dsh-buildr-development-dev';
}

export function pluginLocales(released: boolean): {
  en: { meta: { title: string; description: string } };
  zh: { meta: { title: string; description: string } };
} {
  return {
    en: {
      meta: {
        title: released ? 'Buildr Development' : 'Buildr Development Dev',
        description: released
          ? 'Use your local Buildr Development workbench inside DeepSeek Harness.'
          : 'Local development Buildr Development workbench in DeepSeek Harness.',
      },
    },
    zh: {
      meta: {
        title: released ? 'Buildr Development' : 'Buildr Development Dev',
        description: released
          ? '在 DeepSeek Harness 中打开并使用本机 Buildr Development 工作台。'
          : '在 DeepSeek Harness 中连接本机开发版 Buildr Development 工作台。',
      },
    },
  };
}

export const pluginIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M4 5.2A2.2 2.2 0 0 1 6.2 3h4.5v8.1H4V5.2Z" fill="#0a4fb3"/>
  <path d="M4 12.9h6.7V21H6.2A2.2 2.2 0 0 1 4 18.8v-5.9Z" fill="#0a4fb3"/>
  <path d="M12.3 3h3.9l4.3 4.3v3.8h-4.2V8.6L14.8 7.1h-2.5V3Z" fill="#f29e04"/>
  <path d="M12.3 21h3.9l4.3-4.3v-3.8h-4.2v2.5l-1.5 1.5h-2.5V21Z" fill="#0c84f6"/>
</svg>
`;
