export function pluginPackageName(released: boolean): string {
  return released ? '@buildr-ai/dsh-buildr-harness' : '@buildr-ai/dsh-buildr-harness-dev';
}

export function pluginLocales(released: boolean): {
  en: { meta: { title: string; description: string } };
  zh: { meta: { title: string; description: string } };
} {
  return {
    en: {
      meta: {
        title: released ? 'Buildr Harness' : 'Buildr Harness Dev',
        description: released
          ? 'Use your local Buildr Harness workspace inside DeepSeek Harness.'
          : 'Local development Buildr Harness workspace in DeepSeek Harness.',
      },
    },
    zh: {
      meta: {
        title: released ? 'Buildr Harness' : 'Buildr Harness Dev',
        description: released
          ? '在 DeepSeek Harness 中打开并使用本机 Buildr Harness 工作空间。'
          : '在 DeepSeek Harness 中连接本机开发版 Buildr Harness 工作空间。',
      },
    },
  };
}

export const pluginIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path d="M3.5 5.1c0-.5.27-.96.7-1.2l3.6-2.02c.4-.22.9.07.9.53v19.18c0 .46-.5.75-.9.53l-3.6-2.02c-.43-.24-.7-.7-.7-1.2Z" fill="#14b3a4"/>
  <path d="M20.5 5.1c0-.5-.27-.96-.7-1.2l-3.6-2.02c-.4-.22-.9.07-.9.53v19.18c0 .46.5.75.9.53l3.6-2.02c.43-.24.7-.7.7-1.2Z" fill="#1f92f6"/>
  <path d="M3.8 12l2.6-2.6h6.55L9.65 14.6H6.4Z" fill="#e59e04"/>
  <path d="M14.35 9.4h3.25l2.6 2.6-2.6 2.6h-6.55Z" fill="#f8af08"/>
</svg>
`;
