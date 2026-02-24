import { ConfigProvider, App as AntdApp } from "antd";
import theme from "./theme/themeConfig";
import { AppStoreProvider } from "./stores/appStore";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <AntdApp>
        <AppStoreProvider>
          <WorkspacePage />
        </AppStoreProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
