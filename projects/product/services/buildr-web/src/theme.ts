import type { ThemeConfig } from 'antd';

/** Soft product tokens — mist teal primary, light radius, light shadow. */
export const softProductTheme: ThemeConfig = {
  token: {
    colorPrimary: '#4f8f8a',
    colorInfo: '#5b8fa8',
    colorSuccess: '#5a9a78',
    colorWarning: '#c4a35a',
    colorError: '#c46b6b',
    colorBgBase: '#f3f6f6',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f3f6f6',
    colorText: '#1e2a2a',
    colorTextSecondary: '#5c6b6a',
    colorBorder: '#d5e0de',
    colorBorderSecondary: '#e4eceb',
    borderRadius: 10,
    borderRadiusLG: 12,
    borderRadiusSM: 8,
    fontFamily:
      '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI", system-ui, sans-serif',
    boxShadow: '0 1px 2px rgba(30, 42, 42, 0.04), 0 6px 16px rgba(30, 42, 42, 0.05)',
    boxShadowSecondary: '0 1px 2px rgba(30, 42, 42, 0.03)',
    controlHeight: 36,
  },
  components: {
    Layout: {
      siderBg: '#f7faf9',
      headerBg: '#ffffff',
      bodyBg: '#f3f6f6',
      triggerBg: '#4f8f8a',
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemHeight: 40,
    },
    Button: {
      borderRadius: 10,
      primaryShadow: '0 1px 2px rgba(79, 143, 138, 0.18)',
    },
    Card: {
      borderRadiusLG: 12,
    },
    Table: {
      borderRadius: 10,
      headerBg: '#f0f5f4',
    },
    Drawer: {
      paddingLG: 20,
    },
  },
};

export const SOFT_PRIMARY = '#4f8f8a';
