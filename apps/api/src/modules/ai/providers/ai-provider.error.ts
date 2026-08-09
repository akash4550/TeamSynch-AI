import { AppError } from '../../../core/errors/AppError';

interface AIProviderErrorOptions {
  provider: string;
  model: string;
  statusCode?: number;
  requestId?: string;
  providerCode?: string;
  // Retry observability (ledger #20): how many times the provider
  // retried this request internally (OpenAI SDK maxRetries), and the
  // server-requested retry-after delay, when the provider exposes it.
  retryCount?: number;
  retryAfterSeconds?: number;
}

export class AIProviderError extends AppError {
  readonly provider: string;
  readonly model: string;
  readonly requestId?: string;
  readonly providerCode?: string;
  readonly retryCount?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: AIProviderErrorOptions,
  ) {
    super(message, options.statusCode ?? 502);

    this.name = 'AIProviderError';
    this.provider = options.provider;
    this.model = options.model;
    this.requestId = options.requestId;
    this.providerCode = options.providerCode;
    this.retryCount = options.retryCount;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}