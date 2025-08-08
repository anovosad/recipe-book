import axios, { AxiosResponse, AxiosError } from 'axios';
import toast from 'react-hot-toast';

// Create optimized axios instance with better defaults
const api = axios.create({
  baseURL: '',
  timeout: 10000, // Reduced timeout
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request cache for GET requests
const requestCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Request interceptor with caching
api.interceptors.request.use(
  (config) => {
    // Add cache check for GET requests
    if (config.method === 'get') {
      const cacheKey = `${config.url}?${JSON.stringify(config.params)}`;
      const cached = requestCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        // Return cached response
        config.metadata = { fromCache: true, cachedData: cached.data };
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with caching
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Cache GET responses
    if (response.config.method === 'get' && response.status === 200) {
      const cacheKey = `${response.config.url}?${JSON.stringify(response.config.params)}`;
      requestCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      });
    }
    
    return response;
  },
  (error: AxiosError) => {
    // Simplified error handling
    if (error.response?.status === 401) {
      // Handle auth errors silently for better UX
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        setTimeout(() => window.location.href = '/login', 1500);
      }
    }
    
    return Promise.reject(error);
  }
);

// Clear cache function
export const clearApiCache = () => {
  requestCache.clear();
};

export default api;