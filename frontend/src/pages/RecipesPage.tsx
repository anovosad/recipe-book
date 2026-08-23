import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, X, Utensils, SlidersHorizontal } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOptimizedRecipes, useOptimizedTags, invalidate } from '@/hooks/useOptimizedData';
import { useAppStore, filterRecipes } from '@/store/appStore';
import apiService from '@/services/api';
import { Recipe } from '@/types';
import RecipeCard from '@/components/RecipeCard';
import { Button, LoadingSpinner, EmptyState, TagChip } from '@/components/ui';
import toast from 'react-hot-toast';

const SEARCH_DEBOUNCE_MS = 250;

const RecipesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();

  const { recipes, isLoading: recipesLoading, loadRecipes } = useOptimizedRecipes();
  const { tags, loadTags } = useOptimizedTags();
  const deleteRecipeFromStore = useAppStore(state => state.deleteRecipe);

  // The URL is the single source of truth for the filters. They used to be
  // mirrored into the app store as well, with an effect copying one into the
  // other on every change - which is what made typing in the box push a value
  // back into the input a moment later.
  const searchQuery = searchParams.get('search') ?? '';
  const tagParam = searchParams.get('tag');
  const activeTagId = tagParam && !Number.isNaN(Number(tagParam)) ? Number(tagParam) : null;

  const [showFilters, setShowFilters] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const [syncedQuery, setSyncedQuery] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjusting state during render, the pattern React documents for "a prop
  // changed and this state derives from it". No effect, so the input never
  // renders one frame behind the URL it is following.
  if (searchQuery !== syncedQuery) {
    setSyncedQuery(searchQuery);
    setInputValue(searchQuery);
  }

  useEffect(() => {
    loadRecipes();
    loadTags();
  }, [loadRecipes, loadTags]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const filteredRecipes = useMemo(
    () => filterRecipes(recipes, searchQuery, activeTagId),
    [recipes, searchQuery, activeTagId]
  );

  const applyFilters = useCallback((search: string, tagId: number | null) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tagId) params.set('tag', String(tagId));
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(value, activeTagId), SEARCH_DEBOUNCE_MS);
  };

  const clearFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue('');
    setSearchParams({}, { replace: true });
  };

  const handleDeleteRecipe = useCallback(async (recipe: Recipe) => {
    if (!window.confirm(`Are you sure you want to delete "${recipe.title}"?`)) return;

    try {
      const response = await apiService.deleteRecipe(recipe.id);
      if (response.success) {
        deleteRecipeFromStore(recipe.id);
        invalidate('recipes');
        toast.success(response.message || 'Recipe deleted successfully');
      } else {
        toast.error(response.error || 'Failed to delete recipe');
      }
    } catch (error: any) {
      console.error('Delete recipe error:', error);
      toast.error(error?.error || 'Failed to delete recipe. Please try again.');
    }
  }, [deleteRecipeFromStore]);

  if (recipesLoading && recipes.length === 0) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activeTag = tags.find(tag => tag.id === activeTagId);
  const hasFilters = Boolean(searchQuery || activeTagId);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight lg:text-4xl">
            <Utensils className="h-8 w-8 text-brand-500" />
            Recipes
          </h1>
          <p className="mt-2 text-ink-500">
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''}
            {hasFilters ? ' matching your filters' : ' in the collection'}
          </p>
        </div>

        {isAuthenticated && (
          <Button as={Link} to="/recipe/new" icon={<Plus className="h-4 w-4" />}>
            Add Recipe
          </Button>
        )}
      </header>

      {/* Search and Filters */}
      <section className="surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              type="search"
              className="field pl-11"
              placeholder="Search recipes, ingredients, or tags…"
              value={inputValue}
              onChange={handleSearchChange}
              aria-label="Search recipes"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={showFilters || activeTagId ? 'primary' : 'secondary'}
              onClick={() => setShowFilters(open => !open)}
              icon={<SlidersHorizontal className="h-4 w-4" />}
              aria-expanded={showFilters}
            >
              Tags
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters} icon={<X className="h-4 w-4" />}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {(showFilters || activeTagId) && tags.length > 0 && (
          <div className="animate-rise mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-4">
            {tags.map(tag => (
              <TagChip
                key={tag.id}
                tag={tag}
                as="button"
                type="button"
                dot
                selected={tag.id === activeTagId}
                onClick={() => applyFilters(searchQuery, tag.id === activeTagId ? null : tag.id)}
                aria-pressed={tag.id === activeTagId}
              />
            ))}
          </div>
        )}

        {activeTag && !showFilters && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
            Filtered by <TagChip tag={activeTag} dot />
          </p>
        )}
      </section>

      {/* Recipes */}
      {filteredRecipes.length > 0 ? (
        <div className="auto-grid">
          {filteredRecipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isOwner={user?.id === recipe.created_by}
              onDelete={handleDeleteRecipe}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Utensils className="h-7 w-7" />}
          title="No recipes found"
          description={
            hasFilters
              ? 'No recipes match your current filters. Try adjusting your search or clearing the tags.'
              : isAuthenticated
              ? 'Be the first to add a delicious recipe!'
              : 'Please log in to add recipes.'
          }
          action={
            hasFilters ? (
              <Button onClick={clearFilters} variant="secondary">
                Clear Filters
              </Button>
            ) : isAuthenticated ? (
              <Button as={Link} to="/recipe/new" icon={<Plus className="h-4 w-4" />}>
                Add Your First Recipe
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
};

export default RecipesPage;
