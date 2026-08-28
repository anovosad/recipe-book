// frontend/src/services/api.ts - Updated with separated image handling
import axios, { AxiosResponse, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { translate, currentLanguage } from '@/i18n';
import {
  User,
  Recipe,
  Ingredient,
  Tag,
  LoginForm,
  RegisterForm,
  RecipeForm,
  RecipeImage,
  IngredientForm,
  TagForm,
  ApiResponse,
  SearchResponse,
  Features,
  RecipeImportDraft
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
      toast.error(translate(currentLanguage(), 'net.timeout'));
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
      toast.error(translate(currentLanguage(), 'net.rateLimited'));
    } else if ((error.response?.status ?? 0) >= 500) {
      toast.error(translate(currentLanguage(), 'net.serverError'));
    } else if (!error.response) {
      toast.error(translate(currentLanguage(), 'net.offline'));
    }

    return Promise.reject(error);
  }
);

// withLang appends the reader's language to a GET. The server falls back on its
// own when a recipe has no version in it, so this is a preference rather than a
// filter - nothing disappears for asking in the wrong language.
const withLang = (url: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}lang=${currentLanguage()}`;

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
    data?: any,
    // Per-request axios overrides. Only the import uses one: reading a page
    // with an AI runs far past the 15s default that suits every other call.
    options?: { timeout?: number }
  ): Promise<ApiResponse<T>> {
    try {
      const config: any = {
        method,
        url,
        ...(data && { data }),
        ...options
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
    data?: any,
    options?: { timeout?: number }
  ): Promise<T> {
    const envelope = await this.request<T>(method, url, data, options);
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

  // A successful change reissues the cookie, so this session survives it while
  // every other one is retired server-side.
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    return this.request('PUT', '/api/auth/password', {
      current_password: currentPassword,
      new_password: newPassword
    });
  }

  // Recipe API (JSON only - no images)
  // Every read carries the language. The server answers in it where it can and
  // says in `language` what it actually used, so a recipe that exists only in
  // Czech still appears on the English side rather than going missing.
  async getRecipes(): Promise<Recipe[]> {
    return this.requestData<Recipe[]>('GET', withLang('/api/recipes'));
  }

  async getRecipe(id: number): Promise<Recipe> {
    return this.requestData<Recipe>('GET', withLang(`/api/recipes/${id}`));
  }

  // The canonical spelling of a search is the filtered recipe collection.
  async searchRecipes(query: string): Promise<SearchResponse> {
    const envelope = await this.request<Recipe[]>('GET', withLang(`/api/recipes?q=${encodeURIComponent(query)}`));
    return {
      success: envelope.success,
      query: envelope.meta?.query ?? query,
      results: envelope.data ?? [],
      count: envelope.meta?.count ?? envelope.data?.length ?? 0,
    };
  }

  async getRecipesByTag(tagId: number): Promise<Recipe[]> {
    return this.requestData<Recipe[]>('GET', withLang(`/api/recipes?tag=${tagId}`));
  }

  // POST answers 201 with the created recipe (and a Location header), so `data`
  // is the resource itself rather than a bag holding its id.
  async createRecipe(recipeData: Omit<RecipeForm, 'images'>): Promise<ApiResponse<Recipe>> {
    // Remove images from recipe data - they're handled separately
    const { images, ...jsonData } = recipeData as RecipeForm;
    
    const payload = {
      texts: jsonData.texts,
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
      texts: jsonData.texts,
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

  // The cover is whichever image sorts first, so this reorders rather than
  // setting a flag. Answers with the recipe's images in their new order.
  async setImageCover(imageId: number): Promise<ApiResponse<RecipeImage[]>> {
    return this.request('PUT', `/api/images/${imageId}/cover`);
  }

  // What this deployment can do. Asked once so the recipe form only offers the
  // URL import where the server has a key to do it with.
  async getFeatures(): Promise<Features> {
    return this.requestData<Features>('GET', '/api/features');
  }

  // Read a recipe off a web page. Nothing is saved - the draft goes into the
  // form for review. Fetching the page and having a model read it takes tens of
  // seconds, hence the timeout well past the default.
  async importRecipe(url: string): Promise<RecipeImportDraft> {
    return this.requestData<RecipeImportDraft>('POST', '/api/recipes/import', { url }, { timeout: 180000 });
  }

  // Add one more language to a recipe that already exists. Unlike the import
  // this one saves: the recipe was checked when it was written, and translating
  // checked text is not the same gamble as reading a strange web page.
  async translateRecipe(id: number, language: string): Promise<ApiResponse<Recipe>> {
    return this.request('POST', `/api/recipes/${id}/translate`, { language }, { timeout: 180000 });
  }

  // Fill in the ingredient and tag names that have no version in a language.
  // The one-off that finishes what the startup migration could not.
  async backfillTranslations(language: string): Promise<ApiResponse<{ ingredients: number; tags: number }>> {
    return this.request('POST', '/api/translations/backfill', { language }, { timeout: 180000 });
  }

  // Ingredient API
  async getIngredients(): Promise<Ingredient[]> {
    return this.requestData<Ingredient[]>('GET', withLang('/api/ingredients'));
  }

  async createIngredient(ingredientData: IngredientForm): Promise<ApiResponse> {
    return this.request('POST', '/api/ingredients', ingredientData);
  }

  async updateIngredient(id: number, name: string): Promise<ApiResponse<Ingredient>> {
    return this.request('PUT', `/api/ingredients/${id}`, { name });
  }

  async deleteIngredient(id: number): Promise<ApiResponse> {
    return this.request('DELETE', `/api/ingredients/${id}`);
  }

  // Tag API
  async getTags(): Promise<Tag[]> {
    return this.requestData<Tag[]>('GET', withLang('/api/tags'));
  }

  async createTag(tagData: TagForm): Promise<ApiResponse> {
    return this.request('POST', '/api/tags', tagData);
  }

  // An empty colour keeps the stored one.
  async updateTag(id: number, name: string, color?: string): Promise<ApiResponse<Tag>> {
    return this.request('PUT', `/api/tags/${id}`, { name, color: color ?? '' });
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
        toast.error(translate(currentLanguage(), 'form.imagesFailed'));
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
        toast.error(translate(currentLanguage(), 'form.imagesFailed'));
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