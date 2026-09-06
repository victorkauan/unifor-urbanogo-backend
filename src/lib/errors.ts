export class AppError extends Error {
  readonly statusCode: number;
  readonly data: unknown;

  constructor(statusCode: number, message: string, data: unknown = null) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.data = data;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Requisição inválida", data: unknown = null) {
    super(400, message, data);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado", data: unknown = null) {
    super(401, message, data);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado", data: unknown = null) {
    super(403, message, data);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado", data: unknown = null) {
    super(404, message, data);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito de estado", data: unknown = null) {
    super(409, message, data);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Payload inválido", data: unknown = null) {
    super(422, message, data);
  }
}
