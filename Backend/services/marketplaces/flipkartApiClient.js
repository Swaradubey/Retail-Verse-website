const { encryptSecret, decryptSecret } = require('../../lib/marketplaces/encryption');
const MarketplaceConnection = require('../../models/MarketplaceConnection');

class FlipkartApiClient {
  constructor() {
    this.baseUrl = process.env.FLIPKART_API_BASE_URL || 'https://api.flipkart.net';
    this.tokenUrl = `${this.baseUrl}/oauth-service/oauth/token`;
    this.authUrl = `${this.baseUrl}/oauth-service/oauth/authorize`;
  }

  /**
   * Helper to fetch developer application credentials from environment
   */
  getDeveloperCredentials() {
    const appId = process.env.FLIPKART_APPLICATION_ID;
    const secret = process.env.FLIPKART_APPLICATION_SECRET;
    if (!appId || !secret) {
      throw new Error('Flipkart Developer Application credentials (FLIPKART_APPLICATION_ID/SECRET) are not configured.');
    }
    return { appId, secret };
  }

  /**
   * Helper to generate standard Basic Authorization header for OAuth requests
   */
  getBasicAuthHeader() {
    const { appId, secret } = this.getDeveloperCredentials();
    return 'Basic ' + Buffer.from(`${appId}:${secret}`).toString('base64');
  }

  /**
   * Exchange OAuth Authorization Code for Access and Refresh tokens
   */
  async exchangeCode(code, redirectUri) {
    const basicAuth = this.getBasicAuthHeader();
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    });

    console.log('[Flipkart API] Exchanging authorization code...');
    const response = await this.executeRawRequest(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Flipkart OAuth token exchange failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      sellerId: data.seller_id || 'flipkart_seller'
    };
  }

  /**
   * Refresh a Connection's Access Token using its Refresh Token
   */
  async refreshAccessToken(connection) {
    const basicAuth = this.getBasicAuthHeader();
    const encryptedRefreshToken = connection.credentials?.encryptedRefreshToken || connection.encryptedRefreshToken;
    if (!encryptedRefreshToken) {
      throw new Error('Refresh token is missing from the connection credentials');
    }

    const refreshToken = decryptSecret(encryptedRefreshToken);
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    console.log(`[Flipkart API] Refreshing access token for connection ${connection._id}...`);
    const response = await this.executeRawRequest(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      connection.connectionStatus = 'REAUTH_REQUIRED';
      connection.status = 'connection_error';
      connection.apiHealthStatus = 'REAUTH_REQUIRED';
      connection.lastErrorCode = 'REFRESH_TOKEN_EXPIRED';
      connection.lastErrorMessage = `Refresh token exchange failed: ${errText}`;
      await connection.save();
      throw new Error(`Flipkart token refresh failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token || refreshToken; // Roll refresh token if rotated
    const expiresIn = data.expires_in || 3600;

    // Encrypt and update tokens
    connection.credentials = connection.credentials || {};
    connection.credentials.encryptedAccessToken = encryptSecret(newAccessToken);
    connection.credentials.encryptedRefreshToken = encryptSecret(newRefreshToken);
    connection.accessTokenExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000); // 1 minute safety buffer
    
    // Save updated connection details
    await connection.save();
    console.log('[Flipkart API] Access token refreshed successfully.');

    return newAccessToken;
  }

  /**
   * Get client_credentials access token for SELF_ACCESS mode
   */
  async getClientCredentialsToken(connection) {
    const basicAuth = this.getBasicAuthHeader();
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'seller_api'
    });

    console.log('[Flipkart API] Requesting client credentials token for Self Access Mode...');
    const response = await this.executeRawRequest(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Flipkart client credentials authentication failed: ${errText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;

    connection.credentials = connection.credentials || {};
    connection.credentials.encryptedAccessToken = encryptSecret(accessToken);
    connection.accessTokenExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000);
    await connection.save();

    return accessToken;
  }

  /**
   * Retrieve active valid access token, auto-refreshing if expired or near expiry (within 5 mins)
   */
  async getOrRefreshAccessToken(connection) {
    const mode = connection.applicationMode || 'THIRD_PARTY_OAUTH';

    if (mode === 'SELF_ACCESS') {
      const isExpired = !connection.accessTokenExpiresAt || connection.accessTokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000);
      const encryptedAccessToken = connection.credentials?.encryptedAccessToken || connection.encryptedAccessToken;
      if (isExpired || !encryptedAccessToken) {
        return this.getClientCredentialsToken(connection);
      }
      return decryptSecret(encryptedAccessToken);
    } else {
      // THIRD_PARTY_OAUTH
      const isExpired = !connection.accessTokenExpiresAt || connection.accessTokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000);
      const encryptedAccessToken = connection.credentials?.encryptedAccessToken || connection.encryptedAccessToken;
      if (isExpired || !encryptedAccessToken) {
        return this.refreshAccessToken(connection);
      }
      return decryptSecret(encryptedAccessToken);
    }
  }

  /**
   * Execute an API request with Bearer authentication and token management
   */
  async executeAuthorizedRequest(connection, endpoint, options = {}) {
    let accessToken;
    try {
      accessToken = await this.getOrRefreshAccessToken(connection);
    } catch (authErr) {
      console.error('[Flipkart API] Access token retrieval failed:', authErr.message);
      throw authErr;
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const requestOptions = {
      ...options,
      headers
    };

    console.log(`[Flipkart API] Executing request: ${options.method || 'GET'} ${endpoint}`);
    let response = await this.executeRawRequest(url, requestOptions);

    // If 401, refresh token once and retry
    if (response.status === 401) {
      console.warn('[Flipkart API] Request returned 401. Attempting token refresh & retry...');
      try {
        accessToken = await this.refreshAccessToken(connection);
        headers['Authorization'] = `Bearer ${accessToken}`;
        response = await this.executeRawRequest(url, requestOptions);
      } catch (refreshErr) {
        console.error('[Flipkart API] Retry token refresh failed:', refreshErr.message);
        throw refreshErr;
      }
    }

    return response;
  }

  /**
   * executeRawRequest with Timeout, Exponential Backoff, and rate limit handling
   */
  async executeRawRequest(url, options, attempt = 1) {
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const fetchOptions = {
      ...options,
      signal: controller.signal
    };

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Handle retryable status codes: HTTP 429, HTTP 500, 502, 503, 504
      const isRetryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
      if (isRetryable && attempt <= 3) {
        let delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s backoff
        if (response.status === 429) {
          // Check retry-after header if present
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            delay = parseInt(retryAfter, 10) * 1000 || delay;
          }
        }
        console.warn(`[Flipkart API] Request failed with status ${response.status}. Retrying in ${delay}ms (attempt ${attempt}/3)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeRawRequest(url, options, attempt + 1);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        err.message = `Flipkart API request timed out after ${timeoutMs}ms`;
      }

      const isNetworkError = err.name === 'TypeError' || err.message.includes('fetch');
      if ((isNetworkError || err.name === 'AbortError') && attempt <= 3) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[Flipkart API] Network/Timeout error: ${err.message}. Retrying in ${delay}ms (attempt ${attempt}/3)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeRawRequest(url, options, attempt + 1);
      }

      throw err;
    }
  }

  /**
   * API Method: Check connection health
   */
  async checkHealth(connection) {
    try {
      // Get location or make a request to check auth.
      // We call details/locations or GET /listings/v3/RV-DUMMY-SKU to verify auth.
      const response = await this.executeAuthorizedRequest(connection, '/listings/v3/RV-DUMMY-SKU-HEALTH-CHECK', {
        method: 'GET'
      });

      // 404 means auth was successful, but product doesn't exist (which is correct and healthy!)
      // 401 or 403 means auth failed.
      if (response.status === 200 || response.status === 404) {
        return {
          status: 'HEALTHY',
          message: 'API access verified successfully.'
        };
      } else if (response.status === 401 || response.status === 403) {
        return {
          status: 'REAUTH_REQUIRED',
          message: `Authentication failed (HTTP ${response.status})`
        };
      } else if (response.status === 429) {
        return {
          status: 'RATE_LIMITED',
          message: 'Flipkart API rate limit exceeded.'
        };
      } else {
        return {
          status: 'UNHEALTHY',
          message: `Flipkart API returned error code ${response.status}`
        };
      }
    } catch (err) {
      return {
        status: 'UNHEALTHY',
        message: err.message
      };
    }
  }

  /**
   * API Method: Create Listing
   * POST /listings/v3
   */
  async createListing(connection, payload) {
    const response = await this.executeAuthorizedRequest(connection, '/listings/v3', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Listing Creation failed: ${errMessage}`);
    }
    return data;
  }

  /**
   * API Method: Update Listing Attributes
   * POST /listings/v3/update
   */
  async updateListing(connection, payload) {
    const response = await this.executeAuthorizedRequest(connection, '/listings/v3/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Listing Update failed: ${errMessage}`);
    }
    return data;
  }

  /**
   * API Method: Get Listing by SKU ID
   * GET /listings/v3/{sku-ids}
   */
  async getListing(connection, sku) {
    const response = await this.executeAuthorizedRequest(connection, `/listings/v3/${sku}`, {
      method: 'GET'
    });

    if (response.status === 404) {
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Listing Fetch failed: ${errMessage}`);
    }
    return data;
  }

  /**
   * API Method: Search Flipkart catalog by title / keywords / query
   * POST /listings/v3/product/search
   */
  async searchProduct(connection, query) {
    const response = await this.executeAuthorizedRequest(connection, '/listings/v3/product/search', {
      method: 'POST',
      body: JSON.stringify({ q: query })
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Catalog Search failed: ${errMessage}`);
    }
    return data;
  }

  /**
   * API Method: Update Price
   * POST /listings/v3/update/price
   */
  async updatePrice(connection, payload) {
    const response = await this.executeAuthorizedRequest(connection, '/listings/v3/update/price', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Price Update failed: ${errMessage}`);
    }
    return data;
  }

  /**
   * API Method: Update Inventory
   * POST /listings/v3/update/inventory
   */
  async updateInventory(connection, payload) {
    const response = await this.executeAuthorizedRequest(connection, '/listings/v3/update/inventory', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMessage = data?.message || JSON.stringify(data);
      throw new Error(`Flipkart Inventory Update failed: ${errMessage}`);
    }
    return data;
  }
}

module.exports = new FlipkartApiClient();
