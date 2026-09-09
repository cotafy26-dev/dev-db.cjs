import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isAppError } from '../../core/errors';
import { currentRole } from '../../core/context';
import { roleHas, type Permission } from '../../core/permissions';
import type { ToolSchema } from '../provider/types';

export class NeedsClarification extends Error {
  constructor(
    public readonly question: string,
    public readonly candidates: unknown[] = [],
  ) {
    super(question);
    this.name = 'NeedsClarification';
  }
}

export class NeedsConfirmation extends Error {
  constructor(public readonly prompt: string) {
    super(prompt);
    this.name = 'NeedsConfirmation';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface HermesTool<T extends z.ZodTypeAny = any> {
  name: string;
  description: string;
  /** Permissao exigida (secao 17: autorizacao). undefined = qualquer usuario autenticado. */
  permission?: Permission;
  /** Operacao de risco: exige confirm=true (secao 18). */
  destructive?: boolean;
  schema: T;
  handler: (args: z.infer<T>) => Promise<unknown>;
}

export function defineTool<T extends z.ZodTypeAny>(t: HermesTool<T>): HermesTool<T> {
  return t;
}

const registry = new Map<string, HermesTool>();

export function registerTools(list: HermesTool[]): void {
  for (const t of list) registry.set(t.name, t);
}

export function allTools(): HermesTool[] {
  return [...registry.values()];
}

/** Ferramentas disponiveis para o perfil atual (secao 30: sem chamadas nao autorizadas). */
export function toolsForCurrentRole(): HermesTool[] {
  const role = currentRole();
  return allTools().filter((t) => !t.permission || (role ? roleHas(role, t.permission) : false));
}

const schemaCache = new Map<string, ToolSchema>();

export function toolSchemasForCurrentRole(): ToolSchema[] {
  return toolsForCurrentRole().map((t) => {
    const cached = schemaCache.get(t.name);
    if (cached) return cached;
    const json = zodToJsonSchema(t.schema, { $refStrategy: 'none', target: 'openApi3' }) as Record<string, unknown>;
    delete json.$schema;
    const schema: ToolSchema = { name: t.name, description: t.description, parameters: json };
    schemaCache.set(t.name, schema);
    return schema;
  });
}

export interface ToolExecution {
  status: 'SUCCESS' | 'ERROR' | 'REJECTED';
  result?: unknown;
  error?: string;
}

export async function executeTool(name: string, rawArgs: unknown): Promise<ToolExecution> {
  const tool = registry.get(name);
  if (!tool) return { status: 'ERROR', error: `Ferramenta desconhecida: ${name}` };

  // Autorizacao (secao 30)
  const role = currentRole();
  if (tool.permission && (!role || !roleHas(role, tool.permission))) {
    return { status: 'REJECTED', result: { denied: true, reason: `Seu perfil nao pode executar "${name}".` } };
  }

  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      status: 'ERROR',
      error: `Argumentos invalidos para ${name}: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    };
  }

  // Confirmacao de operacao destrutiva (secao 18)
  const data = parsed.data as Record<string, unknown>;
  if (tool.destructive && data.confirm !== true) {
    return {
      status: 'REJECTED',
      result: {
        needsConfirmation: true,
        prompt: `Confirmar operacao "${name}"? Responda confirmando para eu prosseguir.`,
      },
    };
  }

  try {
    const result = await tool.handler(parsed.data);
    return { status: 'SUCCESS', result };
  } catch (err) {
    if (err instanceof NeedsClarification) {
      return { status: 'REJECTED', result: { needsClarification: true, question: err.question, candidates: err.candidates } };
    }
    if (err instanceof NeedsConfirmation) {
      return { status: 'REJECTED', result: { needsConfirmation: true, prompt: err.prompt } };
    }
    if (isAppError(err)) return { status: 'ERROR', error: err.message };
    throw err;
  }
}

export { z };
