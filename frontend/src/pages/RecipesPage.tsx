import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, X, Utensils, Tag as TagIcon, Leaf } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOptimizedRecipes, useOptimizedTags, invalidate } from '@/hooks/useOptimizedData';
import { useAppStore, filterRecipes } from '@/store/appStore';
import apiService from '@/services/api';
import { Recipe } from '@/types';
import RecipeCard from '@/components/RecipeCard';
import { Button, LoadingSpinner, EmptyState, TagChip } from '@/components/ui';
import toast from 'react-hot-toast';

const SEARCH_DEBOUNCE_MS = 250;

// Ingredients have no colour of their own, so they all share one, which also
// keeps them visually distinct from the multicoloured tag chips.
const INGREDIENT_COLOR = '#10b981';
// Above this many chips the panel gets its own filter box.
const INGREDIENT_SEARCH_THRESHOLD = 12;

const parseIds = (raw: string | null): number[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map(part => Number(part.trim()))
    .filter(id => Number.isInteger(id) && id > 0);
};

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
  const activeIngredientIds = parseIds(searchParams.get('ingredient'));
  const ingredientKey = activeIngredientIds.join(',');

  // Open on whatever the URL is already filtering by. Arriving from the
  // ingredients page used to land on a filtered list with the panel shut, so
  // adding a second ingredient meant hunting for the button first.
  const [openPanel, setOpenPanel] = useState<'tags' | 'ingredients' | null>(
    activeIngredientIds.length > 0 ? 'ingredients' : activeTagId ? 'tags' : null
  );
  const [ingredientQuery, setIngredientQuery] = useState('');
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
    () => filterRecipes(recipes, {
      search: searchQuery,
      tagId: activeTagId,
      ingredientIds: activeIngredientIds
    }),
    // activeIngredientIds is a fresh array every render; its contents are what
    // matter, and ingredientKey is those contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipes, searchQuery, activeTagId, ingredientKey]
  );

  // Only the ingredients some recipe actually uses. Offering the whole pantry
  // would mean chips that can only ever return nothing.
  const usedIngredients = useMemo(() => {
    const seen = new Map<number, string>();
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients ?? []) {
        if (ingredient.ingredient_id && !seen.has(ingredient.ingredient_id)) {
          seen.set(ingredient.ingredient_id, ingredient.name);
        }
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes]);

  const visibleIngredients = useMemo(() => {
    const query = ingredientQuery.trim().toLowerCase();
    const matching = query
      ? usedIngredients.filter(ingredient => ingredient.name.toLowerCase().includes(query))
      : usedIngredients;

    // Chosen ones first: with a long list they would otherwise scroll out of
    // sight the moment you pick one, and picking the next means finding them
    // again to see what is already on.
    const chosen = new Set(activeIngredientIds);
    return [...matching].sort((a, b) => {
      const diff = Number(chosen.has(b.id)) - Number(chosen.has(a.id));
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    // activeIngredientIds is rebuilt every render; ingredientKey is its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedIngredients, ingredientQuery, ingredientKey]);

  const applyFilters = useCallback((
    search: string,
    tagId: number | null,
    ingredientIds: number[]
  ) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tagId) params.set('tag', String(tagId));
    if (ingredientIds.length > 0) params.set('ingredient', ingredientIds.join(','));
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => applyFilters(value, activeTagId, activeIngredientIds),
      SEARCH_DEBOUNCE_MS
    );
  };

  const toggleIngredient = (id: number) => {
    const next = activeIngredientIds.includes(id)
      ? activeIngredientIds.filter(current => current !== id)
      : [...activeIngredientIds, id];
    applyFilters(searchQuery, activeTagId, next);
  };

  const clearFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue('');
    setIngredientQuery('');
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
  const activeIngredients = usedIngredients.filter(ingredient =>
    activeIngredientIds.includes(ingredient.id)
  );
  const hasFilters = Boolean(searchQuery || activeTagId || activeIngredientIds.length > 0);

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
            {activeIngredients.length > 1 && ` — with all ${activeIngredients.length} ingredients`}
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
              variant={openPanel === 'tags' || activeTagId ? 'primary' : 'secondary'}
              onClick={() => setOpenPanel(panel => (panel === 'tags' ? null : 'tags'))}
              icon={<TagIcon className="h-4 w-4" />}
              aria-expanded={openPanel === 'tags'}
            >
              Tags
            </Button>
            <Button
              variant={openPanel === 'ingredients' || activeIngredientIds.length > 0 ? 'primary' : 'secondary'}
              onClick={() => setOpenPanel(panel => (panel === 'ingredients' ? null : 'ingredients'))}
              icon={<Leaf className="h-4 w-4" />}
              aria-expanded={openPanel === 'ingredients'}
            >
              Ingredients
              {activeIngredientIds.length > 0 && ` (${activeIngredientIds.length})`}
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters} icon={<X className="h-4 w-4" />}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {openPanel === 'tags' && tags.length > 0 && (
          <div className="animate-rise mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-4">
            {tags.map(tag => (
              <TagChip
                key={tag.id}
                tag={tag}
                as="button"
                type="button"
                dot
                selected={tag.id === activeTagId}
                onClick={() => applyFilters(
                  searchQuery,
                  tag.id === activeTagId ? null : tag.id,
                  activeIngredientIds
                )}
                aria-pressed={tag.id === activeTagId}
              />
            ))}
          </div>
        )}

        {openPanel === 'ingredients' && (
          <div className="animate-rise mt-4 space-y-3 border-t border-black/5 pt-4">
            <p className="text-sm text-ink-500">
              Pick as many as you like — recipes have to contain <strong className="font-semibold text-ink-700">all</strong> of them.
            </p>

            {usedIngredients.length > INGREDIENT_SEARCH_THRESHOLD && (
              <input
                type="search"
                className="field"
                placeholder="Find an ingredient…"
                value={ingredientQuery}
                onChange={(e) => setIngredientQuery(e.target.value)}
                aria-label="Filter the ingredient list"
              />
            )}

            {visibleIngredients.length > 0 ? (
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {visibleIngredients.map(ingredient => (
                  <TagChip
                    key={ingredient.id}
                    tag={{ name: ingredient.name, color: INGREDIENT_COLOR }}
                    as="button"
                    type="button"
                    selected={activeIngredientIds.includes(ingredient.id)}
                    onClick={() => toggleIngredient(ingredient.id)}
                    aria-pressed={activeIngredientIds.includes(ingredient.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-300">
                {usedIngredients.length === 0
                  ? 'No recipe lists any ingredients yet.'
                  : `Nothing matches "${ingredientQuery}".`}
              </p>
            )}
          </div>
        )}

        {/* What is currently narrowing the list, when the panels are shut. */}
        {openPanel === null && (activeTag || activeIngredients.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            Filtered by
            {activeTag && (
              <TagChip
                tag={activeTag}
                as="button"
                type="button"
                dot
                onClick={() => applyFilters(searchQuery, null, activeIngredientIds)}
                title={`Remove the ${activeTag.name} tag filter`}
              />
            )}
            {activeIngredients.map(ingredient => (
              <TagChip
                key={ingredient.id}
                tag={{ name: ingredient.name, color: INGREDIENT_COLOR }}
                as="button"
                type="button"
                onClick={() => toggleIngredient(ingredient.id)}
                title={`Remove ${ingredient.name}`}
              />
            ))}
          </div>
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
