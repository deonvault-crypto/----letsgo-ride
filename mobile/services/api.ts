import axios, { AxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API_BASE_URL } from "../constants/config";
import { ApiResponse } from "../types/api.types";

export const TOKEN_KEY = "letsgoride.auth.token";

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
  const response = await api.request<ApiResponse<T>>(config);
  if (!response.data.success) {
    throw new Error(response.data.error || "Request failed.");
  }
  return response.data.data;
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
