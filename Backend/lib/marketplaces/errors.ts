export class MarketplaceError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code = 'MARKETPLACE_ERROR', statusCode = 500) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class SSRFError extends MarketplaceError {
  constructor(message = 'Store URL is invalid or resolved to a forbidden address') {
    super(message, 'SSRF_DETECTION_ERROR', 400);
    this.name = 'SSRFError';
  }
}

export class ConfigurationMissingError extends MarketplaceError {
  constructor(marketplace: string, message = `Configuration is missing for ${marketplace}`) {
    super(message, 'CONFIGURATION_MISSING', 400);
    this.name = 'ConfigurationMissingError';
  }
}

export class OAuthStateError extends MarketplaceError {
  constructor(message = 'Invalid or expired state verification') {
    super(message, 'OAUTH_STATE_ERROR', 400);
    this.name = 'OAuthStateError';
  }
}

export class RateLimitError extends MarketplaceError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}
