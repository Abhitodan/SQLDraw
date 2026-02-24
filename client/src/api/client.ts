import type { ParseRequest, ParseResponse, RunRequest, RunResponse, SampleProc, AiConfig, AiChatMessage, AiChatContext } from "./types";

const BASE = "/api/proc";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  parse: (body: ParseRequest) =>
    request<ParseResponse>(`${BASE}/parse`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  run: (body: RunRequest) =>
    request<RunResponse>(`${BASE}/run`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRun: (runId: string) => request<RunResponse>(`${BASE}/run/${runId}`),

  getSamples: () => request<SampleProc[]>(`${BASE}/samples`),

  chatStream: async function* (
    config: AiConfig,
    messages: AiChatMessage[],
    context: AiChatContext,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        azureEndpoint: config.azureEndpoint,
        messages,
        context,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `AI chat failed (${res.status})`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          const delta = JSON.parse(payload) as string;
          if (typeof delta === "string") yield delta;
        } catch { /* skip malformed */ }
      }
    }
  },
};
