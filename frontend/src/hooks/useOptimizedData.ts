import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import apiService from '@/services/api';

// Custom hook for optimized data fetching
export const useOptimizedRecipes = () => {
  const { recipes, setRecipes } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecipes = useCallback(async (force = false) => {
    // Don't reload if we already have data and not forcing
    if (recipes.length > 0 && !force) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiService.getRecipes();
      setRecipes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError('Failed to load recipes');
      console.error('Failed to load recipes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [recipes.length, setRecipes]);

  return { recipes, isLoading, error, loadRecipes };
};

// Optimized ingredients hook
export const useOptimizedIngredients = () => {
  const { ingredients, setIngredients } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const loadIngredients = useCallback(async () => {
    if (ingredients.length > 0) return;

    setIsLoading(true);
    try {
      const data = await apiService.getIngredients();
      setIngredients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ingredients.length, setIngredients]);

  return { ingredients, isLoading, loadIngredients };
};

// Optimized tags hook
export const useOptimizedTags = () => {
  const { tags, setTags } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  const loadTags = useCallback(async () => {
    if (tags.length > 0) return;

    setIsLoading(true);
    try {
      const data = await apiService.getTags();
      setTags(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tags.length, setTags]);

  return { tags, isLoading, loadTags };
};