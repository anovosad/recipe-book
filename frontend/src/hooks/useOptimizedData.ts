import { useCallback, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import apiService from '@/services/api';
import { onLanguageChanged } from '@/i18n';

/**
 * These hooks used to skip the fetch whenever the store already held anything
 * ("if (recipes.length > 0) return"), which is a cache that never expires: add
 * a recipe or a tag from the form page, open the list, and you were looking at
 * the copy loaded on the first visit until a full page reload. They now hold
 * the data for a short window and can be invalidated explicitly after a write.
 */
const FRESHNESS_MS = 30_000;

type Resource = 'recipes' | 'ingredients' | 'tags';

const loadedAt: Record<Resource, number> = { recipes: 0, ingredients: 0, tags: 0 };
// Two mounts of the same page (or React's double-invoked effects in strict
// mode) would otherwise each fire their own request.
const inFlight: Partial<Record<Resource, Promise<unknown>>> = {};

const isFresh = (resource: Resource) =>
  loadedAt[resource] > 0 && Date.now() - loadedAt[resource] < FRESHNESS_MS;

/** Drops the cached copy so the next mount refetches. Call after a write. */
export const invalidate = (...resources: Resource[]) => {
  for (const resource of resources) loadedAt[resource] = 0;
};

// Everything here was fetched in one language: recipe titles, ingredient names,
// tag chips. Switching language makes the whole cache wrong, and a stale cache
// looks exactly like the switch not working.
onLanguageChanged(() => invalidate('recipes', 'ingredients', 'tags'));

function useResource<T>(
  resource: Resource,
  select: (state: ReturnType<typeof useAppStore.getState>) => T[],
  fetcher: () => Promise<T[]>,
  store: (state: ReturnType<typeof useAppStore.getState>) => (items: T[]) => void
) {
  // Selectors, not `const { x } = useAppStore()`: destructuring the whole
  // store subscribes the component to every field in it, so an unrelated
  // write re-rendered every page holding one of these hooks.
  const data = useAppStore(select);
  const setData = useAppStore(store);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!force && isFresh(resource)) return;

    const pending = inFlight[resource];
    if (pending) {
      await pending;
      return;
    }

    setIsLoading(true);
    setError(null);

    const request = fetcher()
      .then(items => {
        setData(Array.isArray(items) ? items : []);
        loadedAt[resource] = Date.now();
      })
      .catch(err => {
        setError(`Failed to load ${resource}`);
        console.error(`Failed to load ${resource}:`, err);
      })
      .finally(() => {
        delete inFlight[resource];
        setIsLoading(false);
      });

    inFlight[resource] = request;
    await request;
    // fetcher/setData are stable for the lifetime of the module and the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, setData]);

  return { data, isLoading, error, load };
}

export const useOptimizedRecipes = () => {
  const { data, isLoading, error, load } = useResource(
    'recipes',
    state => state.recipes,
    () => apiService.getRecipes(),
    state => state.setRecipes
  );
  return { recipes: data, isLoading, error, loadRecipes: load };
};

export const useOptimizedIngredients = () => {
  const { data, isLoading, error, load } = useResource(
    'ingredients',
    state => state.ingredients,
    () => apiService.getIngredients(),
    state => state.setIngredients
  );
  return { ingredients: data, isLoading, error, loadIngredients: load };
};

export const useOptimizedTags = () => {
  const { data, isLoading, error, load } = useResource(
    'tags',
    state => state.tags,
    () => apiService.getTags(),
    state => state.setTags
  );
  return { tags: data, isLoading, error, loadTags: load };
};
