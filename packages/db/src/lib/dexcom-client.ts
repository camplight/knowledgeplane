/**
 * Dexcom API Client
 * 
 * Handles OAuth 2.0 authentication and data fetching from Dexcom API v3
 * Documentation: https://developer.dexcom.com/docs/
 */

export interface DexcomConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl?: string; // Defaults to sandbox, use 'https://api.dexcom.com' for production
}

export interface DexcomTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export interface DexcomEGV {
  value: number;
  trend: string;
  trendRate?: number;
  timestamp: string;
  displayTime: string;
  status?: string;
  statusDisplayName?: string;
}

export interface DexcomCalibration {
  value: number;
  timestamp: string;
  displayTime: string;
}

export interface DexcomAlert {
  systemTime: string;
  displayTime: string;
  alertType: string;
  alertName: string;
  value?: number;
  unit?: string;
  snooze?: number;
}

export interface DexcomDevice {
  transmitterGeneration: string;
  displayDevice: string;
  updateTime: string;
  lastDeviceDataUpdateTime: string;
  alertSettings: any[];
  lastUploadDate: string;
  medicalDeviceTime: string;
  medicalDeviceTimeOffsetMinutes: number;
}

export interface DexcomEvent {
  systemTime: string;
  displayTime: string;
  eventType: string;
  eventSubType?: string;
  value?: number;
  unit?: string;
  eventStatus?: string;
}

export interface DexcomDataRange {
  start: string;
  end: string;
}

export class DexcomClient {
  private config: DexcomConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: DexcomConfig) {
    this.config = {
      baseUrl: config.baseUrl || "https://sandbox-api.dexcom.com",
      ...config,
    };
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state?: string, scopes: string[] = ["egv", "calibrations", "events", "devices"]): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      ...(state && { state }),
    });

    const authBaseUrl = this.config.baseUrl?.includes("sandbox")
      ? "https://sandbox-api.dexcom.com"
      : "https://api.dexcom.com";

    return `${authBaseUrl}/v2/oauth2/login?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<DexcomTokenResponse> {
    const tokenUrl = `${this.config.baseUrl}/v2/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for token: ${response.status} ${error}`);
    }

    const tokenData = await response.json() as DexcomTokenResponse;
    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token;
    this.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    return tokenData;
  }

  /**
   * Set access token directly (for use with existing tokens)
   */
  setAccessToken(token: string, expiresIn?: number) {
    this.accessToken = token;
    if (expiresIn) {
      this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<DexcomTokenResponse> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenUrl = `${this.config.baseUrl}/v2/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${error}`);
    }

    const tokenData = await response.json() as DexcomTokenResponse;
    this.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      this.refreshToken = tokenData.refresh_token;
    }
    this.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    return tokenData;
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.accessToken) {
      throw new Error("No access token available. Please authenticate first.");
    }

    // Refresh if token expires in less than 5 minutes
    if (this.tokenExpiresAt && this.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error("Access token expired and no refresh token available");
      }
    }
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    await this.ensureValidToken();

    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dexcom API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get Estimated Glucose Values (EGVs)
   */
  async getEGVs(startDate: string, endDate: string): Promise<DexcomEGV[]> {
    return this.apiRequest<DexcomEGV[]>("/v2/users/self/egvs", {
      startDate,
      endDate,
    });
  }

  /**
   * Get calibrations
   */
  async getCalibrations(startDate: string, endDate: string): Promise<DexcomCalibration[]> {
    return this.apiRequest<DexcomCalibration[]>("/v2/users/self/calibrations", {
      startDate,
      endDate,
    });
  }

  /**
   * Get alerts
   */
  async getAlerts(startDate: string, endDate: string): Promise<DexcomAlert[]> {
    return this.apiRequest<DexcomAlert[]>("/v2/users/self/alerts", {
      startDate,
      endDate,
    });
  }

  /**
   * Get devices
   */
  async getDevices(): Promise<DexcomDevice[]> {
    return this.apiRequest<DexcomDevice[]>("/v2/users/self/devices");
  }

  /**
   * Get events
   */
  async getEvents(startDate: string, endDate: string): Promise<DexcomEvent[]> {
    return this.apiRequest<DexcomEvent[]>("/v2/users/self/events", {
      startDate,
      endDate,
    });
  }

  /**
   * Get data range (available data periods)
   */
  async getDataRange(): Promise<DexcomDataRange> {
    return this.apiRequest<DexcomDataRange>("/v2/users/self/dataRange");
  }

  /**
   * Fetch all available data from Dexcom API
   */
  async fetchAllData(startDate?: string, endDate?: string): Promise<{
    egvs: DexcomEGV[];
    calibrations: DexcomCalibration[];
    alerts: DexcomAlert[];
    devices: DexcomDevice[];
    events: DexcomEvent[];
    dataRange: DexcomDataRange;
  }> {
    // Get data range if dates not provided
    const dataRange = await this.getDataRange();
    const start = startDate || dataRange.start;
    const end = endDate || dataRange.end;

    // Fetch all data in parallel
    const [egvs, calibrations, alerts, devices, events] = await Promise.all([
      this.getEGVs(start, end).catch(() => []),
      this.getCalibrations(start, end).catch(() => []),
      this.getAlerts(start, end).catch(() => []),
      this.getDevices().catch(() => []),
      this.getEvents(start, end).catch(() => []),
    ]);

    return {
      egvs,
      calibrations,
      alerts,
      devices,
      events,
      dataRange,
    };
  }
}

