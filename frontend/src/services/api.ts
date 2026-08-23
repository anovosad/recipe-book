// frontend/src/services/api.ts - Updated with separated image handling
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
    // Always set Content-Type to application/json for API requests
    // except for form data uploads
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Called when the API answers 401. The auth store registers the handler at
 * module load - a callback rather than an import, because the store already
 * imports this module and a cycle between the two is not worth the trouble.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler) => {
  onUnauthorized = handler;
};

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    console.error('API Error:', error);

    if (error.code === 'ECONNABORTED') {
      toast.error('Request timeout. Please try again.');
    } else if (error.response?.status === 401) {
      // Report it and let the auth store decide. This used to toast "Session
      // expired" and set window.location.href = '/login' for *any* 401 - and
      // the first request an anonymous visitor makes is GET /api/auth/check,
      // which correctly answers 401. So every reload of a public page threw
      // the reader onto the login screen, even though reading needs no
      // account. The store only reacts when a session actually existed, and
      // PrivateRoute already sends the routes that do need one to /login.
      onUnauthorized?.();
    } else if (error.response?.status === 429) {
      toast.error('Too many requests. Please slow down.');
    } else if ((error.response?.status ?? 0) >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (!error.response) {
      toast.error('Network error. Please check your connection.');
    }

    return Promise.reject(error);
  }
);

class ApiService {
  // Every /api response is the same envelope:
  //   { success: true,  data, message?, meta? }
  //   { success: false, error, code, details? }
  // request() returns the envelope; requestData() unwraps `data` for the calls
  // that only want the resource. Failures are thrown as the error envelope, so
  // callers keep reading `error.error` (and now `error.code` / `error.details`).
  private async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    try {
      const config: any = {
        method,
        url,
        ...(data && { data })
      };

      const response = await api(config);
      return response.data;
    } catch (error: any) {
      // Re-throw with better error info
      if (error.response?.data) {
        throw error.response.data;
      }
      throw { success: false, error: error.message || 'Network error occurred', code: 'network_error' };
    }
  }

  private async requestData<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any
  ): Promise<T> {
    const envelope = await this.request<T>(method, url, data);
    return envelope.data as T;
  }

  // Form data request handler (for image uploads)
  private async uploadFormData<T = any>(
    method: 'POST' | 'PUT',
    url: string,
    formData: FormData
  ): Promise<ApiResponse<T>> {
    try {
      const response = await api({
        method,
        url,
        data: formData,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw error.response.data;
      }
      throw { success: false, error: error.message || 'Upload failed', code: 'network_error' };
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
    return this.requestData<User>('GET', '/api/auth/check');
  }

  // Recipe API (JSON only - no images)
  async getRecipes(): Promise<Recipe[]> {
    return this.requestData<Recipe[]>('GET', '/api/recipes');
  }

  async getRecipe(id: number): Promise<Recipe> {
    return this.requestData<Recipe>('GET', `/api/recipes/${id}`);
  }

  // The canonical spelling of a search is the filtered recipe collection.
  async searchRecipes(query: string): Promise<SearchResponse> {
    const envelope = await this.request<Recipe[]>('GET', `/api/recipes?q=${encodeURIComponent(query)}`);
    return {
      success: envelope.success,
      query: envelope.meta?.query ?? query,
      results: envelope.data ?? [],
      count: envelope.meta?.count ?? envelope.data?.length ?? 0,
    };
  }

  async getRecipesByTag(tagId: number): Promise<Recipe[]> {
    return this.requestData<Recipe[]>('GET', `/api/recipes?tag=${tagId}`);
  }

  // POST answers 201 with the created recipe (and a Location header), so `data`
  // is the resource itself rather than a bag holding its id.
  async createRecipe(recipeData: Omit<RecipeForm, 'images'>): Promise<ApiResponse<Recipe>> {
    // Remove images from recipe data - they're handled separately
    const { images, ...jsonData } = recipeData as RecipeForm;
    
    const payload = {
      title: jsonData.title,
      description: jsonData.description || '',
      instructions: jsonData.instructions,
      prep_time: jsonData.prep_time,
      cook_time: jsonData.cook_time,
      servings: jsonData.servings,
      serving_unit: jsonData.serving_unit,
      ingredients: jsonData.ingredients,
      tags: jsonData.tags
    };

    return this.request('POST', '/api/recipes', payload);
  }

  async updateRecipe(id: number, recipeData: Omit<RecipeForm, 'images'>): Promise<ApiResponse<Recipe>> {
    // Remove images from recipe data - they're handled separately
    const { images, ...jsonData } = recipeData as RecipeForm;
    
    const payload = {
      title: jsonData.title,
      description: jsonData.description || '',
      instructions: jsonData.instructions,
      prep_time: jsonData.prep_time,
      cook_time: jsonData.cook_time,
      servings: jsonData.servings,
      serving_unit: jsonData.serving_unit,
      ingredients: jsonData.ingredients,
      tags: jsonData.tags
    };

    return this.request('PUT', `/api/recipes/${id}`, payload);
  }

  async deleteRecipe(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/recipes/${id}`);
  }

  // Image API (Form data only)
  async uploadRecipeImages(recipeId: number, images: File[]): Promise<ApiResponse<{ images: any[] }>> {
    if (!images || images.length === 0) {
      throw { error: 'No images provided' };
    }

    const formData = new FormData();
    
    // Add images to form data
    images.forEach((image) => {
      formData.append('images', image);
    });

    return this.uploadFormData('POST', `/api/recipes/${recipeId}/images`, formData);
  }

  async deleteImage(imageId: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/images/${imageId}`);
  }

  // Ingredient API
  async getIngredients(): Promise<Ingredient[]> {
    return this.requestData<Ingredient[]>('GET', '/api/ingredients');
  }

  async createIngredient(ingredientData: IngredientForm): Promise<ApiResponse> {
    return this.request('POST', '/api/ingredients', ingredientData);
  }

  async deleteIngredient(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/ingredients/${id}`);
  }

  // Tag API
  async getTags(): Promise<Tag[]> {
    return this.requestData<Tag[]>('GET', '/api/tags');
  }

  async createTag(tagData: TagForm): Promise<ApiResponse> {
    return this.request('POST', '/api/tags', tagData);
  }

  async deleteTag(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/tags/${id}`);
  }

  // Health check
  // /health is not part of /api and keeps its own flat shape.
  async healthCheck(): Promise<{ status: string }> {
    const response = await api({ method: 'GET', url: '/health' });
    return response.data;
  }

  // Helper method to create recipe with images in sequence
  async createRecipeWithImages(recipeData: RecipeForm): Promise<{ recipeId: number; uploadedImages: number }> {
    // Step 1: Create recipe (JSON only)
    const recipeResponse = await this.createRecipe(recipeData);
    
    if (!recipeResponse.success || !recipeResponse.data?.id) {
      throw new Error('Failed to create recipe');
    }

    const recipeId = recipeResponse.data.id;
    let uploadedImagesCount = 0;

    // Step 2: Upload images if provided
    if (recipeData.images && recipeData.images.length > 0) {
      try {
        const imageResponse = await this.uploadRecipeImages(recipeId, recipeData.images);
        uploadedImagesCount = imageResponse.data?.images?.length || 0;
      } catch (error) {
        console.warn('Failed to upload images:', error);
        // Don't fail the whole operation if images fail
        toast.error('Recipe created but some images failed to upload');
      }
    }

    return {
      recipeId,
      uploadedImages: uploadedImagesCount
    };
  }

  // Helper method to update recipe with images
  async updateRecipeWithImages(id: number, recipeData: RecipeForm): Promise<{ uploadedImages: number }> {
    // Step 1: Update recipe data (JSON only)
    await this.updateRecipe(id, recipeData);
    
    let uploadedImagesCount = 0;

    // Step 2: Upload new images if provided
    if (recipeData.images && recipeData.images.length > 0) {
      try {
        const imageResponse = await this.uploadRecipeImages(id, recipeData.images);
        uploadedImagesCount = imageResponse.data?.images?.length || 0;
      } catch (error) {
        console.warn('Failed to upload images:', error);
        toast.error('Recipe updated but some images failed to upload');
      }
    }

    return {
      uploadedImages: uploadedImagesCount
    };
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;