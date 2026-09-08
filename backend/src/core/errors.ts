/**
 * Erro de dominio da aplicacao. Carrega um code estavel (para o cliente/IA),
 * uma mensagem legivel e um status HTTP.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} nao encontrado: ${id}` : `${resource} nao encontrado`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Nao autenticado') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
