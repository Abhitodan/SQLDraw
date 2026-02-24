import { useMemo, useState } from "react";
import { Button, Layout, Typography } from "antd";
import { CodeOutlined, PlayCircleOutlined, RobotOutlined, DatabaseOutlined, LeftOutlined, RightOutlined, SettingOutlined } from "@ant-design/icons";
import InputPanel from "../components/input/InputPanel";
import CfgGraph from "../components/graph/CfgGraph";
import TracePanel from "../components/trace/TracePanel";
import SettingsModal from "../components/settings/SettingsModal";
import { ReactFlowProvider } from "@xyflow/react";
import { useAppState } from "../stores/appStore";
import "./workspace.css";

const { Content } = Layout;
const { Text } = Typography;

export default function WorkspacePage() {
  const { cfg, runResult, aiConfig, aiMessages } = useAppState();
  const [collapsedPanels, setCollapsedPanels] = useState({
    input: false,
    trace: false,
  });
  const [settingsVisible, setSettingsVisible] = useState(false);

  const handlePanelCollapse = (panel: 'input' | 'trace') => {
    setCollapsedPanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };

  const steps = [
    {
      title: "Parse",
      icon: <CodeOutlined />,
    },
    {
      title: "Execute",
      icon: <PlayCircleOutlined />,
    },
    {
      title: "Analyze",
      icon: <DatabaseOutlined />,
    },
    {
      title: "AI Chat",
      icon: <RobotOutlined />,
    },
  ];

  const currentStep = useMemo(() => {
    if (aiMessages.length > 0) return 3;
    if (runResult) return 2;
    if (cfg) return 1;
    return 0;
  }, [cfg, runResult, aiMessages.length]);

  return (
    <ReactFlowProvider>
      <Layout className="ws-shell">
        <div className="ws-topbar">
          <div className="ws-brand-wrap">
            <Text className="ws-brand">SQLDraw Studio</Text>
            <Text className="ws-subtitle">Procedure parsing, simulation, and AI analysis</Text>
          </div>

          <div className="ws-flow" aria-label="Workflow">
            {steps.map((step, idx) => {
              const stepState = idx < currentStep ? "done" : idx === currentStep ? "active" : "idle";
              return (
                <div key={step.title} className={`ws-step ws-step-${stepState}`} title={step.title}>
                  {step.icon}
                  <span>{step.title}</span>
                </div>
              );
            })}
          </div>

          <div className="ws-status">
            {cfg && <span>{cfg.nodes.length} nodes</span>}
            {runResult && <span>{runResult.executedNodes.length} executed</span>}
            {runResult && <span>{runResult.summary.mode.toUpperCase()}</span>}
            {aiConfig && <span>AI Ready</span>}
            <Button
              icon={<SettingOutlined />}
              type="text"
              size="small"
              onClick={() => setSettingsVisible(true)}
              className="ws-settings-btn"
              title="Settings"
            />
          </div>
        </div>

        <Content className="ws-content">
          <div className="ws-main-grid">
            <section className={`ws-panel ws-panel-input ${collapsedPanels.input ? 'ws-panel-collapsed-left' : ''}`}>
              <button
                className="ws-panel-head ws-panel-head-clickable"
                onClick={() => handlePanelCollapse('input')}
                aria-expanded={!collapsedPanels.input}
                aria-label={collapsedPanels.input ? 'Expand Procedure Input' : 'Collapse Procedure Input'}
              >
                <span>Procedure Input</span>
                <span className="ws-panel-collapse-icon">
                  {collapsedPanels.input ? <RightOutlined /> : <LeftOutlined />}
                </span>
              </button>
              {!collapsedPanels.input && (
                <div className="ws-panel-body">
                  <InputPanel />
                </div>
              )}
            </section>

            <section className="ws-panel ws-panel-graph">
              <div className="ws-panel-head ws-panel-head-between">
                <span>Control Flow Graph</span>
                <div className="ws-legend">
                  <span><i className="dot dot-executed" />Executed</span>
                  <span><i className="dot dot-idle" />Not executed</span>
                  <span><i className="line line-definite" />Definite path</span>
                  <span><i className="line line-potential" />Potential path</span>
                </div>
              </div>
              <div className="ws-panel-body">
                <CfgGraph />
              </div>
            </section>

            <section className={`ws-panel ws-panel-trace ${collapsedPanels.trace ? 'ws-panel-collapsed-right' : ''}`}>
              <button
                className="ws-panel-head ws-panel-head-clickable"
                onClick={() => handlePanelCollapse('trace')}
                aria-expanded={!collapsedPanels.trace}
                aria-label={collapsedPanels.trace ? 'Expand Execution & AI' : 'Collapse Execution & AI'}
              >
                <span>Execution & AI</span>
                <span className="ws-panel-collapse-icon">
                  {collapsedPanels.trace ? <LeftOutlined /> : <RightOutlined />}
                </span>
              </button>
              {!collapsedPanels.trace && (
                <div className="ws-panel-body">
                  <TracePanel />
                </div>
              )}
            </section>
          </div>
        </Content>
      </Layout>
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </ReactFlowProvider>
  );
}
