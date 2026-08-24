import axios, { AxiosError, AxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API_BASE_URL } from "../constants/config";
import { ApiResponse } from "../types/api.types";

export const TOKEN_KEY = "letsgoride.auth.token";

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type WebStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function getWebStorage() {
  return (globalThis as unknown as { localStorage?: WebStorage }).localStorage;
}

async function readStoredToken() {
  if (Platform.OS === "web") {
    return getWebStorage()?.getItem(TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function writeStoredToken(token: string) {
  if (Platform.OS === "web") {
    getWebStorage()?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeStoredToken() {
  if (Platform.OS === "web") {
    getWebStorage()?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const token = await readStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function requestData<T>(config: AxiosRequestConfig) {
  try {
    const response = await api.request<ApiResponse<T>>(config);
    if (!response.data.success) {
      throw new Error(response.data.error || "Request failed.");
    }
    return response.data.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ApiRequestError(toFriendlyApiError(error), error.response?.status);
    }
    throw error;
  }
}

export function toFriendlyApiError(error: AxiosError<ApiResponse<unknown>>) {
  const status = error.response?.status;
  const responseData = error.response?.data;
  const serverMessage = responseData && responseData.success === false ? responseData.error : undefined;
  const requestUrl = String(error.config?.url || "");

  if (!error.response) {
    return "Could not connect to LetsGoRide. Please check your connection and try again.";
  }

  if (serverMessage) {
    const normalizedMessage = serverMessage.toLowerCase();
    if (normalizedMessage.includes("verify your email")) {
      return "Please verify your email before logging in.";
    }
    if (normalizedMessage.includes("invalid or expired verification")) {
      return "The verification code is incorrect or expired.";
    }
    if (normalizedMessage.includes("invalid email or password")) {
      return "Email or password is incorrect.";
    }
    if (normalizedMessage.includes("email verification could not be sent")) {
      return "Verification code could not be sent. Please try again.";
    }
    if (normalizedMessage.includes("validation failed") || normalizedMessage.includes("validation error")) {
      return "Some details could not be read. Please check them and try again.";
    }
    return serverMessage;
  }

  if (status === 401) {
    return requestUrl.includes("/auth/email-login")
      ? "Email or password is incorrect."
      : "Your session expired. Please log in again.";
  }
  if (status === 403) {
    return requestUrl.includes("/auth/email-login")
      ? "Please verify your email before logging in."
      : "Your session expired. Please log in again.";
  }
  if (status === 400) return "The request could not be completed. Please check your details.";
  if (status && status >= 500) return "Something went wrong. Please try again.";
  return "Could not connect to LetsGoRide. Please check your connection and try again.";
}

export async function saveToken(token: string) {
  await writeStoredToken(token);
}

export async function getToken() {
  return readStoredToken();
}

export async function clearToken() {
  await removeStoredToken();
}
