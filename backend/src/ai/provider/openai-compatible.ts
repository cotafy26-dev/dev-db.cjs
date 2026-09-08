import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import type { AIProvider, ChatRequest, ChatResponse, ChatMessage } from './types';

function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    return { role: m.role, content: m.content } as ChatCompletionMessageParam;
  });
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly model: string;
  private client: OpenAI;

  constructor() {
    this.id = env.AI_PROVIDER;
    this.model = env.AI_MODEL;
    this.client = new OpenAI({
      apiKey: env.AI_API_KEY || 'not-needed',
      baseURL: env.AI_BASE_URL,
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 1,
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const tools: ChatCompletionTool[] | undefined = req.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAIMessages(req.messages),
      temperature: req.temperature ?? env.AI_TEMPERATURE,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    const toolCalls =
      msg?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.type === 'function' ? tc.function.name : '',
        arguments: tc.type === 'function' ? tc.function.arguments : '{}',
      })) ?? [];

    return {
      content: msg?.content ?? '',
      toolCalls,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
      },
      raw: completion,
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { ok: true, detail: `modelo ${res.model ?? this.model} respondendo` };
    } catch (err) {
      logger.warn({ err }, 'AI health check falhou');
      return { ok: false, detail: err instanceof Error ? err.message : 'erro desconhecido' };
    }
  }
}
