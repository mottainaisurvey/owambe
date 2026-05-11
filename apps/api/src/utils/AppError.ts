// ─── AppError.ts ─────────────────────────────────────
// OWB-REM-01: Added optional `errorCode` field for machine-readable error
// discrimination (e.g. COHORT_CODE_INVALID vs COHORT_CODE_EXHAUSTED vs COHORT_CODE_EXPIRED).
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode?: string;

  constructor(message: string, statusCode: number = 500, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (errorCode) this.errorCode = errorCode;
    Error.captureStackTrace(this, this.constructor);
  }
}
