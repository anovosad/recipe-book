import React from 'react';

// User types
export interface User {
  id: number;
  username: string;
  email: string;
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

export interface Recipe {
  id: number;
  title: string;
  description: string;
  instructions: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  serving_unit: string;
  created_by: number;
  created_at: string;
  ingredients: RecipeIngredient[];
  images: RecipeImage[];
  tags: Tag[];
  author_name: string;
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
  title: string;
  description: string;
  instructions: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  serving_unit: string;
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
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  redirect?: string;
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