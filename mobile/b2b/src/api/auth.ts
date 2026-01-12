import { LoginRequest, LoginResponse, User } from '../types';
import { apiClient } from './client';
import { saveAuth } from '../storage/auth';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', data);
  await saveAuth(response.data.token, response.data.user);
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me');
  return response.data;
}
