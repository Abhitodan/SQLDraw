import { Modal, App, Form, Input, Select, Button, Tabs, Typography, Divider, Space, Alert } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useConnectionConfig, useAIConfig } from '../../stores/configStore';
import { useAppDispatch } from '../../stores/appStore';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { connectionString, setConnectionString } = useConnectionConfig();
  const aiConfig = useAIConfig();
  const dispatch = useAppDispatch();
  const { message } = App.useApp();

  const [loadingModels, setLoadingModels] = useState(false);
  const [geminiModels, setGeminiModels] = useState<string[]>([]);

  const fetchGeminiModels = async () => {
    const key = aiConfig.geminiApiKey;
    if (!key.trim()) {
      message.error('Please enter a Gemini API key first');
      return;
    }
    setLoadingModels(true);
    try {
      const response = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'gemini', apiKey: key }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch models');
      }
      const data = await response.json();
      setGeminiModels(data.models || []);
      message.success(`Found ${data.models?.length || 0} models`);
    } catch (err: unknown) {
      message.error((err as Error).message || 'Failed to fetch models');
    } finally {
      setLoadingModels(false);
    }
  };

  // Persist AI config to appStore so the chat panel picks it up immediately
  const syncAiToAppStore = () => {
    const provider = aiConfig.provider;
    const apiKey =
      provider === 'anthropic' ? aiConfig.anthropicApiKey
      : provider === 'openai' ? aiConfig.openaiApiKey
      : provider === 'azure' ? aiConfig.azureApiKey
      : aiConfig.geminiApiKey;

    if (apiKey.trim() && aiConfig.model.trim()) {
      dispatch({
        type: 'SET_AI_CONFIG',
        payload: {
          provider,
          apiKey,
          model: aiConfig.model,
          azureEndpoint: aiConfig.azureEndpoint || undefined,
        },
      });
      message.success('AI configuration saved');
    } else {
      message.warning('Please fill in the API key and model before saving');
    }
  };

  const ConnectionTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Text type="secondary">
        Used for fetching stored procedures and executing against real SQL Server databases.
      </Text>

      <Form layout="vertical">
        <Form.Item label="Connection String" help="The connection string is saved locally and never sent to any external service.">
          <TextArea
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="Server=localhost;Database=YourDatabase;Integrated Security=true;"
            rows={3}
          />
        </Form.Item>
      </Form>

      <Divider />

      <Title level={5}>Examples</Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text strong>Windows Auth: </Text>
          <Text code copyable>Server=localhost;Database=YourDB;Integrated Security=true;</Text>
        </div>
        <div>
          <Text strong>SQL Auth: </Text>
          <Text code copyable>Server=localhost;Database=YourDB;User Id=user;Password=pass;</Text>
        </div>
        <div>
          <Text strong>Azure SQL: </Text>
          <Text code copyable>Server=yourserver.database.windows.net;Database=YourDB;User Id=user@server;Password=pass;Encrypt=true;</Text>
        </div>
      </Space>
    </div>
  );

  const AITab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Alert
        message="Privacy Notice"
        description="Your API key and procedure content will be sent to the selected AI provider. Keys are stored locally only."
        type="warning"
        showIcon
      />

      <Form layout="vertical">
        <Form.Item label="Provider">
          <Select
            value={aiConfig.provider}
            onChange={aiConfig.updateProvider}
          >
            <Option value="anthropic">Anthropic Claude</Option>
            <Option value="openai">OpenAI GPT</Option>
            <Option value="azure">Azure OpenAI</Option>
            <Option value="gemini">Google Gemini</Option>
          </Select>
        </Form.Item>

        <Form.Item label="Model">
          <Select
            value={aiConfig.model}
            onChange={aiConfig.updateModel}
            showSearch
            allowClear
            placeholder="e.g. claude-opus-4-5, gpt-4o, gemini-1.5-pro"
            popupRender={(menu) => (
              <>
                {menu}
                {aiConfig.provider === 'gemini' && (
                  <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
                    <Button
                      type="link"
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loadingModels}
                      onClick={fetchGeminiModels}
                      style={{ width: '100%' }}
                    >
                      Fetch Gemini Models
                    </Button>
                  </div>
                )}
              </>
            )}
          >
            {aiConfig.provider === 'gemini' && geminiModels.length > 0
              ? geminiModels.map((m) => <Option key={m} value={m}>{m}</Option>)
              : [
                  <Option key="claude-opus-4-5" value="claude-opus-4-5">claude-opus-4-5</Option>,
                  <Option key="claude-3-5-sonnet-20240620" value="claude-3-5-sonnet-20240620">claude-3-5-sonnet-20240620</Option>,
                  <Option key="claude-3-opus-20240229" value="claude-3-opus-20240229">claude-3-opus-20240229</Option>,
                  <Option key="gpt-4o" value="gpt-4o">gpt-4o</Option>,
                  <Option key="gpt-4-turbo" value="gpt-4-turbo">gpt-4-turbo</Option>,
                  <Option key="gemini-1.5-pro" value="gemini-1.5-pro">gemini-1.5-pro</Option>,
                  <Option key="gemini-1.5-flash" value="gemini-1.5-flash">gemini-1.5-flash</Option>,
                ]}
          </Select>
        </Form.Item>

        {aiConfig.provider === 'anthropic' && (
          <Form.Item label="Anthropic API Key" help="console.anthropic.com">
            <Input.Password
              value={aiConfig.anthropicApiKey}
              onChange={(e) => aiConfig.updateAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
            />
          </Form.Item>
        )}

        {aiConfig.provider === 'openai' && (
          <Form.Item label="OpenAI API Key" help="platform.openai.com">
            <Input.Password
              value={aiConfig.openaiApiKey}
              onChange={(e) => aiConfig.updateOpenaiKey(e.target.value)}
              placeholder="sk-..."
            />
          </Form.Item>
        )}

        {aiConfig.provider === 'azure' && (
          <>
            <Form.Item label="Azure API Key">
              <Input.Password
                value={aiConfig.azureApiKey}
                onChange={(e) => aiConfig.updateAzureKey(e.target.value)}
                placeholder="Your Azure API key"
              />
            </Form.Item>
            <Form.Item label="Azure Endpoint">
              <Input
                value={aiConfig.azureEndpoint}
                onChange={(e) => aiConfig.updateAzureEndpoint(e.target.value)}
                placeholder="https://your-resource.openai.azure.com/"
              />
            </Form.Item>
          </>
        )}

        {aiConfig.provider === 'gemini' && (
          <Form.Item label="Gemini API Key" help="aistudio.google.com/app/apikey">
            <Input.Password
              value={aiConfig.geminiApiKey}
              onChange={(e) => aiConfig.updateGeminiKey(e.target.value)}
              placeholder="AIza..."
            />
          </Form.Item>
        )}
      </Form>

      <Button type="primary" onClick={syncAiToAppStore} style={{ alignSelf: 'flex-start' }}>
        Save AI Config
      </Button>
    </div>
  );

  const tabItems = [
    { key: 'connection', label: 'Connection', children: ConnectionTab },
    { key: 'ai', label: 'AI', children: AITab },
  ];

  return (
    <Modal
      title="Settings"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      style={{ top: 20 }}
    >
      <Tabs items={tabItems} defaultActiveKey="connection" size="small" />
    </Modal>
  );
}
