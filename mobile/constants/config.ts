const DEFAULT_API_BASE_URL = "https://letsgoride-backend.onrender.com";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl || DEFAULT_API_BASE_URL;
