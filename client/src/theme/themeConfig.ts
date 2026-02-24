import type { ThemeConfig } from "antd";

const theme: ThemeConfig = {
  token: {
    // Core Palette
    colorPrimary: "#6C63FF", // Accent: Soft violet
    colorInfo: "#8B84FF", // Accent Light
    colorSuccess: "#38B2AC", // Accent Secondary
    colorError: "#dc2626", // Readable red on cool grey
    colorWarning: "#ea580c", // Readable orange

    // Backgrounds - the "cool clay" surface
    colorBgBase: "#E0E5EC",
    colorBgLayout: "#E0E5EC",
    colorBgContainer: "#E0E5EC",
    colorBgElevated: "#E0E5EC",

    // Typography
    colorText: "#3D4852", // Foreground
    colorTextSecondary: "#6B7280", // Muted
    colorTextTertiary: "#A0AEC0",
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyCode: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    
    // Borders - Neumorphism doesn't use borders, so we make them transparent/subtle
    colorBorder: "transparent",
    colorBorderSecondary: "transparent",
    colorSplit: "transparent",

    // Geometry
    borderRadius: 16,
    borderRadiusLG: 32,
    borderRadiusSM: 12,
    
    // Sizes
    fontSize: 14,
    controlHeight: 44, // Touch-friendly target 44px min
  },
  components: {
    Layout: {
      headerBg: "#E0E5EC",
      siderBg: "#E0E5EC",
      bodyBg: "#E0E5EC",
    },
    Button: {
      colorPrimary: "#6C63FF",
      borderRadius: 16,
      controlHeight: 44,
      colorBgContainer: "#E0E5EC", // Secondary button
    },
    Card: {
      colorBgContainer: "#E0E5EC",
      borderRadiusLG: 32,
    },
    Input: {
      colorBgContainer: "#E0E5EC",
      borderRadius: 16,
      controlHeight: 44,
      colorBorder: "transparent",
    },
    Select: {
      colorBgContainer: "#E0E5EC",
      borderRadius: 16,
      controlHeight: 44,
      colorBorder: "transparent",
    },
    Segmented: {
      trackBg: "#E0E5EC",
      itemSelectedBg: "#E0E5EC",
      borderRadius: 16,
    },
    Tabs: {
      itemColor: "#6B7280",
      itemSelectedColor: "#6C63FF",
      inkBarColor: "#6C63FF",
    }
  },
};

export default theme;
