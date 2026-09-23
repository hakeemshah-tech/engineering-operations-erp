import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE) {
  console.warn('VITE_API_BASE_URL is not defined; check .env files and build command.');
}

// Create axios instance with base configuration
export const api = axios.create({
  baseURL: API_BASE || 'http://localhost:5000',
  withCredentials: false,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData, let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Export a fetch helper for components that prefer fetch
export const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    ...(options.headers || {}),
  };

  // Don't set Content-Type for FormData, let browser set it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${API_BASE || 'http://localhost:5000'}${path}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
};

