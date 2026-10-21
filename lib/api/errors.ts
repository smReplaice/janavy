/**
 * JANAVI API error type.
 *
 * Reimplements the never-committed `lib/api/errors` module that AGPL code
 * (lib/api/documents/validate-external-url.ts, lib/api/usage.ts) imports.
 * Independent JANAVI implementation — not derived from proprietary source.
 */

/** Machine-readable error codes used by JANAVI APIs and usage logging. */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable_entity"
  | "rate_limited_exceeded"
  | "internal_server_error";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable_entity: 422,
  rate_limited_exceeded: 429,
  internal_server_error: 500,
};

/** Error with a machine-readable code and HTTP status, for API handlers. */
export class PapermarkApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Alias of `status` for handlers that read `err.statusCode`. */
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "PapermarkApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 500;
    this.statusCode = this.status;
  }
}
