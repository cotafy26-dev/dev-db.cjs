export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string (como o modelo devolve)
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ChatToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ChatResponse {
  content: string;
  toolCalls: ChatToolCall[];
  usage?: ChatUsage;
  raw?: unknown;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** Verifica conectividade/modelo. */
  health(): Promise<{ ok: boolean; detail: string }>;
}
