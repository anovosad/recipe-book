import { lazy } from 'react';
import LoadingSpinner from './LoadingSpinner';

// Lazy load pages that aren't needed immediately
export const RecipesPage = lazy(() => import('../pages/RecipesPage'));
export const RecipeDetailPage = lazy(() => import('../pages/RecipeDetailPage'));
export const RecipeFormPage = lazy(() => import('../pages/RecipeFormPage'));
export const IngredientsPage = lazy(() => import('../pages/IngredientsPage'));
export const TagsPage = lazy(() => import('../pages/TagsPage'));
export const LoginPage = lazy(() => import('../pages/LoginPage'));
export const RegisterPage = lazy(() => import('../pages/RegisterPage'));

// Lazy load heavy components
export const RecipeImageGallery = lazy(() => import('./RecipeImageGallery'));
export const SearchComponent = lazy(() => import('./SearchComponent'));

// Default loading component
export const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);