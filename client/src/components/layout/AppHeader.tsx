import { Layout, Typography, Space, Tag } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";

const { Header } = Layout;
const { Text } = Typography;

export default function AppHeader() {
  return (
    <Header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: 48,
        borderBottom: "1px solid #30363d",
        background: "#161b22",
      }}
    >
      <Space size={12} align="center">
        <ExperimentOutlined style={{ fontSize: 18, color: "#58a6ff" }} />
        <Text strong style={{ fontSize: 16, color: "#e1e4e8" }}>ProcSim</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>SQL Server Procedure Simulator</Text>
      </Space>
      <Tag color="#30363d" style={{ color: "#8b949e" }}>MVP</Tag>
    </Header>
  );
}
