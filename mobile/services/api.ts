import axios, { AxiosRequestConfig } from "axios";
import * as SecureStore from "expo-secure-store";

import { API_BASE_URL } from "../constants/config";
import { ApiResponse } from "../types/api.types";

export const TOKEN_KEY = "letsgoride.auth.token";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
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
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
