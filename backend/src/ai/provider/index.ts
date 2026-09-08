import { env } from '../../core/env';
import type { AIProvider } from './types';
import { OpenAICompatibleProvider } from './openai-compatible';
import { StubProvider } from './stub';

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (instance) return instance;
  instance = env.AI_PROVIDER === 'stub' ? new StubProvider() : new OpenAICompatibleProvider();
  return instance;
}

/** Usado nos testes para forcar o provider. */
export function setAIProvider(p: AIProvider | null): void {
  instance = p;
}

export type { AIProvider } from './types';
