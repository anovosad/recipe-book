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
    } else if ((error.response?.status ?? 0) >= 500) {
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
    data?: any
  ): Promise<T> {
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
      throw { error: error.message || 'Network error occurred' };
    }
  }

  // Form data request handler (for image uploads)
  private async uploadFormData<T>(
    method: 'POST' | 'PUT',
    url: string,
    formData: FormData
  ): Promise<T> {
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
      throw { error: error.message || 'Upload failed' };
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

  // Recipe API (JSON only - no images)
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

  async createRecipe(recipeData: Omit<RecipeForm, 'images'>): Promise<ApiResponse<{ recipe_id: number }>> {
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

  async updateRecipe(id: number, recipeData: Omit<RecipeForm, 'images'>): Promise<ApiResponse> {
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
    images.forEach((image, index) => {
      formData.append('images', image);
      // You can also add captions if needed
      // formData.append(`caption_${index}`, caption || '');
    });

    return this.uploadFormData('POST', `/api/recipes/${recipeId}/images`, formData);
  }

  async deleteImage(imageId: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/images/${imageId}`);
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

  // Utility method for uploading single image
  async uploadSingleImage(file: File): Promise<{ filename: string }> {
    const formData = new FormData();
    formData.append('image', file);
    return this.uploadFormData('POST', '/api/upload/image', formData);
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    return this.request('GET', '/health');
  }

  // Helper method to create recipe with images in sequence
  async createRecipeWithImages(recipeData: RecipeForm): Promise<{ recipeId: number; uploadedImages: number }> {
    // Step 1: Create recipe (JSON only)
    const recipeResponse = await this.createRecipe(recipeData);
    
    if (!recipeResponse.success || !recipeResponse.data?.recipe_id) {
      throw new Error('Failed to create recipe');
    }

    const recipeId = recipeResponse.data.recipe_id;
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