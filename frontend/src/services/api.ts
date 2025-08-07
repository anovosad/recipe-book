// frontend/src/services/api.ts
import axios, { AxiosResponse, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import {
  User,
  Recipe,
  Ingredient,
  Tag,
  LoginForm,
  RegisterForm,
  RecipeForm,
  IngredientForm,
  TagForm,
  ApiResponse,
  SearchResponse
} from '@/types';

// Configure axios defaults
axios.defaults.timeout = 15000;
axios.defaults.withCredentials = true;

// Create axios instance
const api = axios.create({
  baseURL: '',
  timeout: 15000,
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Don't set Content-Type for FormData (let browser set it with boundary)
    if (!(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    console.error('API Error:', error);
    
    if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please try again.');
    } else if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login if needed
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        toast.error('Session expired. Please log in again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
      }
    } else if (error.response?.status === 429) {
      toast.error('Too many requests. Please slow down.');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (!error.response) {
      toast.error('Network error. Please check your connection.');
    }
    
    return Promise.reject(error);
  }
);

class ApiService {
  // Generic API request handler
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any,
    options: { isFormData?: boolean } = {}
  ): Promise<T> {
    try {
      const config: any = {
        method,
        url,
        ...(data && { data })
      };

      if (options.isFormData) {
        // Let browser set Content-Type with boundary for FormData
        config.headers = {};
      }

      const response = await api(config);
      return response.data;
    } catch (error: any) {
      // Re-throw with better error info
      if (error.response?.data) {
        throw error.response.data;
      }
      throw { error: error.message || 'Network error occurred' };
    }
  }

  // Authentication API
  async login(credentials: LoginForm): Promise<ApiResponse<{ user: User }>> {
    return this.request('POST', '/api/login', credentials);
  }

  async register(userData: RegisterForm): Promise<ApiResponse> {
    return this.request('POST', '/api/register', userData);
  }

  async logout(): Promise<ApiResponse> {
    return this.request('POST', '/api/logout');
  }

  async checkAuth(): Promise<User> {
    return this.request('GET', '/api/auth/check');
  }

  // Recipe API
  async getRecipes(): Promise<Recipe[]> {
    return this.request('GET', '/api/recipes');
  }

  async getRecipe(id: number): Promise<Recipe> {
    return this.request('GET', `/api/recipes/${id}`);
  }

  async searchRecipes(query: string): Promise<SearchResponse> {
    return this.request('GET', `/api/search?q=${encodeURIComponent(query)}`);
  }

  async getRecipesByTag(tagId: number): Promise<Recipe[]> {
    return this.request('GET', `/api/recipes/tag/${tagId}`);
  }

  async createRecipe(recipeData: RecipeForm): Promise<ApiResponse<{ recipe_id: number }>> {
    const formData = this.prepareRecipeFormData(recipeData);
    return this.request('POST', '/api/recipes', formData, { isFormData: true });
  }

  async updateRecipe(id: number, recipeData: RecipeForm): Promise<ApiResponse> {
    const formData = this.prepareRecipeFormData(recipeData);
    return this.request('PUT', `/api/recipes/${id}`, formData, { isFormData: true });
  }

  async deleteRecipe(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/recipes/${id}`);
  }

  private prepareRecipeFormData(recipeData: RecipeForm): FormData {
    const formData = new FormData();
    
    // Basic recipe data
    formData.append('title', recipeData.title);
    formData.append('description', recipeData.description || '');
    formData.append('instructions', recipeData.instructions);
    formData.append('prep_time', recipeData.prep_time.toString());
    formData.append('cook_time', recipeData.cook_time.toString());
    formData.append('servings', recipeData.servings.toString());
    formData.append('serving_unit', recipeData.serving_unit);

    // Add ingredients as JSON strings
    recipeData.ingredients.forEach((ingredient) => {
      formData.append('ingredients', JSON.stringify(ingredient));
    });

    // Add tags
    recipeData.tags.forEach(tagId => {
      formData.append('tags', tagId.toString());
    });

    // Add images
    if (recipeData.images) {
      recipeData.images.forEach(image => {
        formData.append('recipe_images', image);
      });
    }

    return formData;
  }

  // Ingredient API
  async getIngredients(): Promise<Ingredient[]> {
    return this.request('GET', '/api/ingredients');
  }

  async createIngredient(ingredientData: IngredientForm): Promise<ApiResponse> {
    return this.request('POST', '/api/ingredients', ingredientData);
  }

  async deleteIngredient(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/ingredients/${id}`);
  }

  // Tag API
  async getTags(): Promise<Tag[]> {
    return this.request('GET', '/api/tags');
  }

  async createTag(tagData: TagForm): Promise<ApiResponse> {
    return this.request('POST', '/api/tags', tagData);
  }

  async deleteTag(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/tags/${id}`);
  }

  // Image API
  async deleteImage(imageId: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/images/${imageId}`);
  }

  // Upload API
  async uploadImage(file: File): Promise<{ filename: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.request('POST', '/api/upload/image', formData, { isFormData: true });
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;