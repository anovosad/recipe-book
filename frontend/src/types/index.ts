import React from 'react';

// User types
export interface User {
  id: number;
  username: string;
  email: string;
  // Whether this account may manage other accounts. It decides nothing else:
  // recipes are shared and every signed-in user may edit any of them.
  is_admin?: boolean;
}

export interface NewUserForm {
  username: string;
  email: string;
  password: string;
  is_admin: boolean;
}

// Recipe types
export interface RecipeIngredient {
  ingredient_id: number;
  name: string;
  unit: string;
  quantity: number;
}

export interface RecipeImage {
  id: number;
  recipe_id: number;
  filename: string;
  caption: string;
  order: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

// One language's worth of a recipe's words.
export interface RecipeText {
  title: string;
  description: string;
  instructions: string;
}

export interface Recipe {
  id: number;
  title: string;
  description: string;
  instructions: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  serving_unit: string;
  // Where the recipe came from, when it came from a web page. Rendered as a
  // link rather than glued onto the end of the description, which is where it
  // used to live.
  source_url: string;
  created_by: number;
  created_at: string;
  ingredients: RecipeIngredient[];
  images: RecipeImage[];
  tags: Tag[];
  author_name: string;

  // The language the text above is actually in, which is not always the one
  // that was asked for: a recipe stored only in Czech is still shown to an
  // English reader, labelled. `languages` is every version that exists.
  language: string;
  languages: string[];

  // Every language version, present only when one recipe is fetched on its own.
  // The edit form needs the whole set because saving replaces it.
  texts?: Record<string, RecipeText>;
}

// What the server is configured to do. Recipe import needs an AI API key, and
// without one the endpoint is not even mounted.
export interface Features {
  recipe_import: boolean;
  registration: boolean;
}

// An unsaved recipe read off a web page. `recipe` is shaped like a stored one
// so the form can populate itself from it exactly as it does when editing;
// `notes` is what the model flagged for a human to check.
export interface RecipeImportDraft {
  recipe: Recipe;
  // Every language the import produced. `recipe` is one of them, for display;
  // this is what gets saved.
  texts: Record<string, RecipeText>;
  notes: string[];
  source_url: string;
}

// Ingredient types
export interface Ingredient {
  id: number;
  name: string;
}

// Form types
export interface LoginForm {
  username: string;
  password: string;
}

export interface ChangePasswordForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface RegisterForm {
  username: string;
  email: string;
  password: string;
}

export interface RecipeFormIngredient {
  ingredient_id: number;
  quantity: number;
  unit: string;
}

export interface RecipeForm {
  // The recipe's words in every language it has. The form edits one at a time -
  // whichever the site is switched to - and carries the rest through untouched,
  // because a save replaces the whole set and a missing language would be a
  // deleted one.
  texts: Record<string, RecipeText>;
  prep_time: number;
  cook_time: number;
  servings: number;
  serving_unit: string;
  source_url: string;
  ingredients: RecipeFormIngredient[];
  tags: number[];
  images?: File[];
}

export interface IngredientForm {
  name: string;
}

export interface TagForm {
  name: string;
  color: string;
}

// API response types
// The one shape every /api response takes:
//   { success: true,  data, message?, meta? }
//   { success: false, error, code, details? }
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: any;
  error?: string;
  code?: string;
  // Structured context for a refused request - which recipes still use the
  // ingredient, how long a rate limit block still has to run. These used to sit
  // next to `error` at the top level.
  details?: ApiErrorDetails;
}

export interface ApiErrorDetails {
  usedInRecipes?: boolean;
  recipeCount?: number;
  recipeNames?: string[];
  retryAfterSeconds?: number;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results: Recipe[];
  count: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

// App state types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginForm) => Promise<boolean>;
  register: (userData: RegisterForm) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export interface AppState {
  isLoading: boolean;
  error: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Component props
export interface PageProps {
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
}

// Utility types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Serving units
export const SERVING_UNITS = [
  { value: 'people', label: 'People' },
  { value: 'servings', label: 'Servings' },
  { value: 'portions', label: 'Portions' },
  { value: 'pieces', label: 'Pieces' },
  { value: 'slices', label: 'Slices' },
  { value: 'cups', label: 'Cups' },
  { value: 'bowls', label: 'Bowls' },
  { value: 'glasses', label: 'Glasses' },
  { value: 'liters', label: 'Liters' },
  { value: 'ml', label: 'Milliliters' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'g', label: 'Grams' },
  { value: 'dozen', label: 'Dozen' },
  { value: 'cookies', label: 'Cookies' },
  { value: 'muffins', label: 'Muffins' },
  { value: 'pancakes', label: 'Pancakes' }
] as const;

// Measurement units
export const MEASUREMENT_UNITS = [
  // Volume
  { value: 'tsp', label: 'Teaspoon', category: 'Volume' },
  { value: 'tbsp', label: 'Tablespoon', category: 'Volume' },
  { value: 'cup', label: 'Cup', category: 'Volume' },
  { value: 'ml', label: 'Milliliter', category: 'Volume' },
  { value: 'l', label: 'Liter', category: 'Volume' },
  { value: 'fl oz', label: 'Fluid Ounce', category: 'Volume' },
  
  // Weight
  { value: 'g', label: 'Gram', category: 'Weight' },
  { value: 'kg', label: 'Kilogram', category: 'Weight' },
  { value: 'oz', label: 'Ounce', category: 'Weight' },
  { value: 'lb', label: 'Pound', category: 'Weight' },
  
  // Count
  { value: 'piece', label: 'Piece', category: 'Count' },
  { value: 'clove', label: 'Clove', category: 'Count' },
  { value: 'slice', label: 'Slice', category: 'Count' },
  { value: 'can', label: 'Can', category: 'Count' },
  { value: 'package', label: 'Package', category: 'Count' },
  
  // Other
  { value: 'pinch', label: 'Pinch', category: 'Other' },
  { value: 'dash', label: 'Dash', category: 'Other' },
  { value: 'to taste', label: 'To taste', category: 'Other' }
] as const;