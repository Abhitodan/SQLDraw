import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Global styles
const style = document.createElement("style");
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

  :root {
    /* Neumorphism Design System - Cool Grey Palette */
    --neu-bg: #E0E5EC;
    --neu-fg: #2D3748;
    --neu-muted: #2D3748; /* Same as neu-fg for consistent text color */
    --neu-accent: #6C63FF;
    --neu-accent-secondary: #FF6B6B;
    --neu-accent-light: #4ECDC4;
    --neu-success: #48BB78;
    --neu-warning: #ED8936;
    --neu-error: #F56565;
    --neu-info: #4299E1;
    
    /* Neumorphic Shadows */
    --neu-extruded: 
      8px 8px 16px rgba(163, 177, 198, 0.4),
      -8px -8px 16px rgba(255, 255, 255, 0.7);
    --neu-extruded-hover: 
      10px 10px 20px rgba(163, 177, 198, 0.5),
      -10px -10px 20px rgba(255, 255, 255, 0.8);
    --neu-inset: 
      inset 8px 8px 16px rgba(163, 177, 198, 0.4),
      inset -8px -8px 16px rgba(255, 255, 255, 0.7);
    --neu-inset-sm: 
      inset 4px 4px 8px rgba(163, 177, 198, 0.4),
      inset -4px -4px 8px rgba(255, 255, 255, 0.7);
    --neu-inset-deep: 
      inset 12px 12px 24px rgba(163, 177, 198, 0.5),
      inset -12px -12px 24px rgba(255, 255, 255, 0.8);
    
    /* Radii */
    --neu-radius-xs: 4px;
    --neu-radius-sm: 8px;
    --neu-radius-md: 12px;
    --neu-radius-lg: 16px;
    --neu-radius-xl: 24px;
    --neu-radius-2xl: 32px;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    background: var(--neu-bg); 
    color: var(--neu-fg);
    font-family: 'DM Sans', sans-serif;
    overflow: hidden; 
    -webkit-font-smoothing: antialiased;
  }

  /* Neumorphic Utility Classes */
  .neu-extruded { box-shadow: var(--neu-extruded); }
  .neu-extruded:hover { box-shadow: var(--neu-extruded-hover); transform: translateY(-1px); }
  .neu-extruded:active { box-shadow: var(--neu-inset-sm); transform: translateY(0.5px); }
  
  .neu-inset { box-shadow: var(--neu-inset); }
  .neu-inset-deep { box-shadow: var(--neu-inset-deep); }
  
  .neu-card {
    background: var(--neu-bg);
    border-radius: 32px;
    box-shadow: var(--neu-extruded);
    padding: 24px;
    transition: all 0.3s ease-out;
  }
  
  .neu-button {
    background: var(--neu-bg);
    border-radius: 16px;
    box-shadow: var(--neu-extruded);
    transition: all 0.3s ease-out;
    border: none;
    color: var(--neu-fg);
    cursor: pointer;
  }
  .neu-button:hover {
    box-shadow: var(--neu-extruded-hover);
    transform: translateY(-1px);
  }
  .neu-button:active {
    box-shadow: var(--neu-inset-sm);
    transform: translateY(0.5px);
  }

  .neu-input {
    background: var(--neu-bg);
    border-radius: 16px;
    box-shadow: var(--neu-inset);
    border: none;
    transition: all 0.3s ease-out;
    color: var(--neu-fg);
  }
  .neu-input:focus {
    box-shadow: var(--neu-inset-deep);
    outline: 2px solid var(--neu-accent);
    outline-offset: 2px;
  }

  /* Ant Design Overrides for Neumorphism */
  .ant-btn { box-shadow: var(--neu-extruded) !important; background: var(--neu-bg) !important; color: var(--neu-fg) !important; border: none !important; transition: all 0.3s ease-out !important; }
  .ant-btn:hover { box-shadow: var(--neu-extruded-hover) !important; transform: translateY(-1px); }
  .ant-btn:active { box-shadow: var(--neu-inset-sm) !important; transform: translateY(0.5px); }
  
  .ant-btn-primary { background: var(--neu-accent) !important; color: white !important; }
  
  .ant-input, .ant-select-selector { box-shadow: var(--neu-inset) !important; background: var(--neu-bg) !important; border: none !important; }
  .ant-input:focus, .ant-select-focused .ant-select-selector { box-shadow: var(--neu-inset-deep) !important; outline: 2px solid var(--neu-accent) !important; outline-offset: 2px; }
  
  .ant-card { box-shadow: var(--neu-extruded); border: none !important; background: var(--neu-bg) !important; }
  
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: var(--neu-bg); box-shadow: var(--neu-inset-sm); }
  ::-webkit-scrollbar-thumb { background: var(--neu-fg); opacity: 0.5; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--neu-fg); opacity: 0.8; }
  
  .ant-segmented { box-shadow: var(--neu-inset) !important; padding: 4px !important; }
  .ant-segmented-item-selected { box-shadow: var(--neu-extruded-sm) !important; }
  .ant-slider-handle::after { border-color: var(--neu-accent) !important; }
  
  /* Force consistent text colors, but exempt monaco-editor and its children */
  body, div:not(.monaco-editor):not(.monaco-editor *), span:not(.monaco-editor *), p, h1, h2, h3, h4, h5, h6,
  .ant-typography, .ant-text, .ant-title, .ant-label, .ant-form-item-label > label, 
  .ant-table, .ant-table-thead > tr > th, .ant-table-tbody > tr > td,
  .ant-select-selection-item, .ant-input, .ant-btn:not(.ant-btn-primary),
  .ant-tooltip-inner, .ant-popover-inner-content,
  .ant-tag:not(.ant-tag-success):not(.ant-tag-error):not(.ant-tag-warning):not(.ant-tag-processing),
  .ant-divider-inner-text,
  .ant-alert-message, .ant-alert-description,
  .ant-empty-description, .ant-spin-text,
  .ant-modal-title, .ant-drawer-title,
  .ant-dropdown-menu-item, .ant-menu-item,
  .ant-breadcrumb-link, .ant-pagination-item {
    color: var(--neu-fg) !important;
  }
  
  /* Ensure placeholder text is also consistent */
  ::placeholder, .ant-input::placeholder, .ant-select-selection-placeholder {
    color: var(--neu-fg) !important;
    opacity: 0.6;
  }
  
  /* Keep special colors for semantic elements */
  .ant-btn-primary { color: white !important; }
  .ant-tag-success { color: white !important; background: var(--neu-success) !important; }
  .ant-tag-error { color: white !important; background: var(--neu-error) !important; }
  .ant-tag-warning { color: white !important; background: var(--neu-warning) !important; }
  .ant-tag-processing { color: white !important; background: var(--neu-info) !important; }

  /* Monaco Editor Overrides */
  .monaco-editor, .monaco-editor-background, .monaco-editor .margin, .monaco-editor .inputarea.ime-input {
    background-color: transparent !important;
  }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
