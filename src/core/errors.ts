import { GUARDASLI } from "./identity";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "PAYMENT_FAILED"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNSUPPORTED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly requestId: string;

  constructor(code: ErrorCode, message: string, requestId: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  toBody(): ApiErrorBody {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
      requestId: this.requestId,
    };
  }
}

/** Production-safe message: no internals, no stack traces. */
export function safeInternalMessage(requestId: string): string {
  return `خطای داخلی. شناسه پیگیری: ${requestId} — ${GUARDASLI.product}`;
}

export function newRequestId(): string {
  return `ga_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Redact secrets from objects before logging. */
const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api_?key|credential)/i;
export function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v);
  }
  return out;
}
