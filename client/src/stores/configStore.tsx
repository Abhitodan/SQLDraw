import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Config {
  // SQL Server Connection
  connectionString: string;
  
  // AI Configuration
  aiProvider: 'anthropic' | 'openai' | 'azure' | 'gemini';
  anthropicApiKey: string;
  openaiApiKey: string;
  azureApiKey: string;
  geminiApiKey: string;
  azureEndpoint: string;
  aiModel: string;
  
  // UI Preferences
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  showLineNumbers: boolean;
  wordWrap: boolean;
  
  // Execution Preferences
  defaultRunMode: 'dryrun' | 'sqlite' | 'rollback' | 'commit';
  autoSave: boolean;
  
  // Graph Preferences
  layoutDirection: 'TB' | 'BT' | 'LR' | 'RL';
  showMiniMap: boolean;
  animateTransitions: boolean;
}

const defaultConfig: Config = {
  // SQL Server Connection
  connectionString: 'Server=localhost;Database=YourDatabase;Integrated Security=true;',
  
  // AI Configuration
  aiProvider: 'anthropic',
  anthropicApiKey: '',
  openaiApiKey: '',
  azureApiKey: '',
  geminiApiKey: '',
  azureEndpoint: '',
  aiModel: 'claude-opus-4-5',
  
  // UI Preferences
  theme: 'auto',
  fontSize: 'medium',
  showLineNumbers: true,
  wordWrap: true,
  
  // Execution Preferences
  defaultRunMode: 'dryrun',
  autoSave: true,
  
  // Graph Preferences
  layoutDirection: 'TB',
  showMiniMap: false,
  animateTransitions: true,
};

interface ConfigStore {
  config: Config;
  updateConfig: (updates: Partial<Config>) => void;
  resetConfig: () => void;
  exportConfig: () => string;
  importConfig: (configJson: string) => boolean;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      
      updateConfig: (updates: Partial<Config>) => {
        set((state) => ({
          config: { ...state.config, ...updates }
        }));
      },
      
      resetConfig: () => {
        set({ config: defaultConfig });
      },
      
      exportConfig: () => {
        try {
          return JSON.stringify(get().config, null, 2);
        } catch (error) {
          console.error('Failed to export config:', error);
          return '';
        }
      },
      
      importConfig: (configJson: string) => {
        try {
          const imported = JSON.parse(configJson);
          // Validate imported config has required fields
          const validatedConfig = { ...defaultConfig, ...imported };
          set({ config: validatedConfig });
          return true;
        } catch (error) {
          console.error('Failed to import config:', error);
          return false;
        }
      },
    }),
    {
      name: 'sqldraw-config',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState: any, version: number) => {
        // Handle future migrations here
        if (version === 0) {
          // Migration from version 0 to 1
          return {
            ...persistedState,
            config: {
              ...defaultConfig,
              ...persistedState.config,
            },
          };
        }
        return persistedState;
      },
    }
  )
);

// Helper hooks for specific config sections
export const useConnectionConfig = () => {
  const { config, updateConfig } = useConfigStore();
  return {
    connectionString: config.connectionString,
    setConnectionString: (value: string) => updateConfig({ connectionString: value }),
  };
};

export const useAIConfig = () => {
  const { config, updateConfig } = useConfigStore();
  return {
    provider: config.aiProvider,
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
    azureApiKey: config.azureApiKey,
    geminiApiKey: config.geminiApiKey,
    azureEndpoint: config.azureEndpoint,
    model: config.aiModel,
    updateProvider: (provider: Config['aiProvider']) => updateConfig({ aiProvider: provider }),
    updateAnthropicKey: (key: string) => updateConfig({ anthropicApiKey: key }),
    updateOpenaiKey: (key: string) => updateConfig({ openaiApiKey: key }),
    updateAzureKey: (key: string) => updateConfig({ azureApiKey: key }),
    updateGeminiKey: (key: string) => updateConfig({ geminiApiKey: key }),
    updateAzureEndpoint: (endpoint: string) => updateConfig({ azureEndpoint: endpoint }),
    updateModel: (model: string) => updateConfig({ aiModel: model }),
  };
};

export const useUIConfig = () => {
  const { config, updateConfig } = useConfigStore();
  return {
    theme: config.theme,
    fontSize: config.fontSize,
    showLineNumbers: config.showLineNumbers,
    wordWrap: config.wordWrap,
    updateTheme: (theme: Config['theme']) => updateConfig({ theme }),
    updateFontSize: (size: Config['fontSize']) => updateConfig({ fontSize: size }),
    updateShowLineNumbers: (show: boolean) => updateConfig({ showLineNumbers: show }),
    updateWordWrap: (wrap: boolean) => updateConfig({ wordWrap: wrap }),
  };
};

export const useExecutionConfig = () => {
  const { config, updateConfig } = useConfigStore();
  return {
    defaultRunMode: config.defaultRunMode,
    autoSave: config.autoSave,
    updateDefaultRunMode: (mode: Config['defaultRunMode']) => updateConfig({ defaultRunMode: mode }),
    updateAutoSave: (save: boolean) => updateConfig({ autoSave: save }),
  };
};
