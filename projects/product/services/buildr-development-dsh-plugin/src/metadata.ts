export function pluginPackageName(released: boolean): string {
  return released ? '@buildr-ai/dsh-buildr' : '@buildr-ai/dsh-buildr-dev';
}

export function pluginLocales(released: boolean): {
  en: { meta: { title: string; description: string } };
  zh: { meta: { title: string; description: string } };
} {
  return {
    en: {
      meta: {
        title: released ? 'Buildr' : 'Buildr Dev',
        description: released
          ? 'Use your local Buildr workbench inside DeepSeek Harness.'
          : 'Local development Buildr workbench in DeepSeek Harness.',
      },
    },
    zh: {
      meta: {
        title: released ? 'Buildr' : 'Buildr Dev',
        description: released
          ? '在 DeepSeek Harness 中打开并使用本机 Buildr 工作台。'
          : '在 DeepSeek Harness 中连接本机开发版 Buildr 工作台。',
      },
    },
  };
}

export const pluginIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M6.2 4.9 11.2 2 14.8 4.1 9.8 7v2.6L6.2 7.5Z" fill="#1f92f6"/>
  <path d="M10.9 6.36 14.8 4.1 18.3 6.1Q19 6.5 19 7.4V10.5L15.2 12.7V8.8Z" fill="#f8af08"/>
  <path d="M10.7 11.4 13.2 10 18.3 12.9Q19 13.3 19 14.2V16.7Q19 17.6 18.3 18L16.3 19.1 13.5 17.5 15.2 16.5V15.3L10.7 12.7Z" fill="#14b3a4"/>
  <path d="M6.2 8.7 9.8 10.8V17.2L11.8 18.4 13.5 17.5 16.5 19.2 11.8 22 4.8 18V16.8L6.2 16Z" fill="#1f92f6"/>
</svg>
`;
