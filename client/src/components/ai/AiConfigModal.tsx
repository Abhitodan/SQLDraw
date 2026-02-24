import { Modal, Form, Select, Input, Button, Space, Typography, Alert, App } from "antd";
import { RobotOutlined, ReloadOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useAppState, useAppDispatch } from "../../stores/appStore";
import { useConfigStore } from "../../stores/configStore";

const { Text } = Typography;
const { Option } = Select;

interface AiConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AiConfigModal({ visible, onClose }: AiConfigModalProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { config, updateConfig } = useConfigStore();
  const [form] = Form.useForm();
  const [loadingModels, setLoadingModels] = useState(false);
  const [geminiModels, setGeminiModels] = useState<string[]>([]);
  const { message } = App.useApp();
  
  // Watch form values reactively
  const provider = Form.useWatch("provider", form);
  const apiKey = Form.useWatch("apiKey", form);

  const fetchGeminiModels = async (apiKey: string) => {
    if (!apiKey.trim()) {
      message.error("Please enter an API key first");
      return;
    }

    setLoadingModels(true);
    try {
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", apiKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch models");
      }

      const data = await response.json();
      setGeminiModels(data.models || []);
      message.success(`Found ${data.models?.length || 0} models`);
    } catch (error: any) {
      message.error(error.message || "Failed to fetch models");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSubmit = async (values: any) => {
    dispatch({ type: "SET_AI_CONFIG", payload: values });
    // Persist to config store so it survives page refresh
    updateConfig({
      aiProvider: values.provider,
      anthropicApiKey: values.provider === 'anthropic' ? values.apiKey : config.anthropicApiKey,
      openaiApiKey: values.provider === 'openai' ? values.apiKey : config.openaiApiKey,
      azureApiKey: values.provider === 'azure' ? values.apiKey : config.azureApiKey,
      geminiApiKey: values.provider === 'gemini' ? values.apiKey : config.geminiApiKey,
      azureEndpoint: values.azureEndpoint ?? config.azureEndpoint,
      aiModel: values.model,
    });
    onClose();
  };

  const handleClear = () => {
    dispatch({ type: "SET_AI_CONFIG", payload: null });
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <RobotOutlined />
          <span>AI Configuration</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
    >
      <Alert
        title="Privacy Notice"
        description="Your API key and procedure content will be sent to the selected AI provider. Configure with caution."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={state.aiConfig || {
          provider: config.aiProvider,
          apiKey: config.aiProvider === 'anthropic' ? config.anthropicApiKey
            : config.aiProvider === 'openai' ? config.openaiApiKey
            : config.aiProvider === 'azure' ? config.azureApiKey
            : config.aiProvider === 'gemini' ? config.geminiApiKey : '',
          model: config.aiModel,
          azureEndpoint: config.azureEndpoint,
        }}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="Provider"
          name="provider"
          rules={[{ required: true, message: "Please select a provider" }]}
        >
          <Select placeholder="Select AI provider">
            <Option value="anthropic">Anthropic Claude</Option>
            <Option value="openai">OpenAI GPT</Option>
            <Option value="azure">Azure OpenAI</Option>
            <Option value="gemini">Google Gemini</Option>
          </Select>
          
        </Form.Item>

        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[{ required: true, message: "Please enter your API key" }]}
        >
          <Input.Password placeholder="Enter your API key" />
        </Form.Item>

        <Form.Item
          label="Model"
          name="model"
          rules={[{ required: true, message: "Please enter a model name" }]}
        >
          <Select
            placeholder="e.g., claude-3-5-sonnet-20240620, gpt-4o, gemini-1.5-pro"
            showSearch
            allowClear
            popupRender={(menu) => (
              <>
                {menu}
                {provider === "gemini" && (
                  <div style={{ padding: "8px", borderTop: "1px solid #f0f0f0" }}>
                    <Button
                      type="link"
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loadingModels}
                      onClick={() => fetchGeminiModels(apiKey || "")}
                      style={{ width: "100%" }}
                    >
                      Fetch Gemini Models
                    </Button>
                  </div>
                )}
              </>
            )}
          >
            {provider === "gemini" && geminiModels.length > 0
              ? geminiModels.map((model) => (
                  <Option key={model} value={model}>
                    {model}
                  </Option>
                ))
              : [
                  <Option key="claude-3-5-sonnet-20240620" value="claude-3-5-sonnet-20240620">
                    claude-3-5-sonnet-20240620
                  </Option>,
                  <Option key="claude-3-opus-20240229" value="claude-3-opus-20240229">
                    claude-3-opus-20240229
                  </Option>,
                  <Option key="gpt-4o" value="gpt-4o">
                    gpt-4o
                  </Option>,
                  <Option key="gpt-4-turbo" value="gpt-4-turbo">
                    gpt-4-turbo
                  </Option>,
                  <Option key="gemini-1.5-pro" value="gemini-1.5-pro">
                    gemini-1.5-pro
                  </Option>,
                  <Option key="gemini-1.5-flash" value="gemini-1.5-flash">
                    gemini-1.5-flash
                  </Option>,
                ]}
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => prevValues.provider !== currentValues.provider}
        >
          {({ getFieldValue }) =>
            getFieldValue("provider") === "azure" ? (
              <Form.Item
                label="Azure Endpoint"
                name="azureEndpoint"
                rules={[{ required: true, message: "Azure endpoint is required for Azure OpenAI" }]}
              >
                <Input placeholder="https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-01" />
              </Form.Item>
            ) : null
          }
        </Form.Item>

        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button onClick={handleClear} danger>
              Clear Config
            </Button>
            <Space>
              <Button onClick={onClose}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Save
              </Button>
            </Space>
          </Space>
        </Form.Item>
      </Form>

      <div style={{ marginTop: 16, padding: "12px", background: "#f6f8fa", borderRadius: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>Recommended models:</strong>
          <br />
          • Anthropic: claude-3-5-sonnet-20240620, claude-3-opus-20240229
          <br />
          • OpenAI: gpt-4o, gpt-4-turbo
          <br />
          • Google Gemini: gemini-1.5-pro, gemini-1.5-flash
          <br />
          • Azure: Use your deployment name as model
        </Text>
      </div>
    </Modal>
  );
}
