import type { ThemeConfig } from 'antd';
import { applyProductTypography, productTypography } from './typography';

// Theme initialization is shared by the product and existing prototype entries.
// Keep CSS roles and Ant Design tokens backed by the same numeric authority.
if (typeof document !== 'undefined') {
  applyProductTypography(document.documentElement.style);
}

/** Soft product tokens — mist teal primary, light radius, light shadow. */
export const softProductTheme: ThemeConfig = {
  token: {
    colorPrimary: '#397d74',
    colorPrimaryBg: '#edf5f1',
    colorPrimaryBgHover: '#e4efea',
    controlOutline: 'rgba(57, 125, 116, 0.12)',
    controlOutlineWidth: 1,
    colorInfo: '#5b8fa8',
    colorSuccess: '#5a9a78',
    colorWarning: '#c4a35a',
    colorError: '#c46b6b',
    colorBgBase: '#f7f8f9',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f7f8f9',
    colorText: '#252a31',
    colorTextSecondary: '#5e6873',
    fontSize: productTypography.body,
    fontSizeSM: productTypography.meta,
    fontSizeLG: productTypography.subheading,
    fontSizeHeading1: productTypography.page,
    fontSizeHeading2: productTypography.title,
    fontSizeHeading3: productTypography.heading,
    fontSizeHeading4: productTypography.subheading,
    fontSizeHeading5: productTypography.reading,
    colorBorder: '#e1e5e9',
    colorBorderSecondary: '#eceef1',
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 6,
    fontFamily:
      '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Segoe UI", system-ui, sans-serif',
    boxShadow: '0 1px 2px rgba(30, 42, 42, 0.04), 0 6px 16px rgba(30, 42, 42, 0.05)',
    boxShadowSecondary: '0 1px 2px rgba(30, 42, 42, 0.03)',
    controlHeight: 32,
  },
  components: {
    Layout: {
      siderBg: '#f6f7f8',
      headerBg: '#ffffff',
      bodyBg: '#f7f8f9',
      triggerBg: '#397d74',
    },
    Select: {
      optionSelectedBg: '#edf5f1',
      optionSelectedColor: '#306b62',
      optionActiveBg: '#f4f6f7',
      optionSelectedFontWeight: 500,
    },
    Menu: {
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemHeight: 36,
    },
    Button: {
      borderRadius: 8,
      primaryShadow: '0 1px 2px rgba(79, 143, 138, 0.18)',
    },
    Card: {
      borderRadiusLG: 10,
    },
    Table: {
      borderRadius: 8,
      headerBg: '#f0f5f4',
    },
    Drawer: {
      paddingLG: 20,
    },
  },
};

export const SOFT_PRIMARY = '#397d74';
