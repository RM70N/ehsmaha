export const DEFAULT_API_BASE = "https://tiktok.eulerstream.com";
export const CHARACTER_LIMIT = 25_000;
export const REQUEST_TIMEOUT_MS = 30_000;

export const REGIONS = [
  "US", "GB", "DE", "RO", "ES", "BE", "FR", "CA", "JP", "BR", "MX", "CO", "AR", "CL", "AU", "KR", "PE", "PL", "SG", "IT", "ID", "TH"
] as const;

export const RATE_LIMIT_TYPES = ["WEBCAST", "ALERTS", "RATE_LIMITS", "RANKINGS"] as const;
export const RANK_TYPES = ["DAILY_RANK", "FANS_TEAM_RANK"] as const;

// Prefixes the generic GET tool may call: read-only discovery endpoints only.
export const RAW_GET_PREFIXES = ["/webcast/", "/accounts/me", "/analytics/"] as const;
