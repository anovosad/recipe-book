import { create } from 'zustand';
import { Recipe, Ingredient, Tag } from '@/types';

interface AppStore {
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Data
  recipes: Recipe[];
  ingredients: Ingredient[];
  tags: Tag[];
  currentRecipe: Recipe | null;
  
  // Search and filters
  searchQuery: string;
  activeTagId: number | null;
  filteredRecipes: Recipe[];
  
  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Recipe actions
  setRecipes: (recipes: Recipe[]) => void;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  addRecipe: (recipe: Recipe) => void;
  updateRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: number) => void;
  
  // Ingredient actions
  setIngredients: (ingredients: Ingredient[]) => void;
  addIngredient: (ingredient: Ingredient) => void;
  deleteIngredient: (id: number) => void;
  
  // Tag actions
  setTags: (tags: Tag[]) => void;
  addTag: (tag: Tag) => void;
  deleteTag: (id: number) => void;
  
  // Search and filter actions
  setSearchQuery: (query: string) => void;
  setActiveTagId: (tagId: number | null) => void;
  clearFilters: () => void;
  
  // Computed getters
  getFilteredRecipes: () => Recipe[];
}

// Helper function to ensure recipe arrays are never null
const normalizeRecipe = (recipe: Recipe): Recipe => ({
  ...recipe,
  tags: recipe.tags || [],
  ingredients: recipe.ingredients || [],
  images: recipe.images || []
});

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  isLoading: false,
  error: null,
  recipes: [],
  ingredients: [],
  tags: [],
  currentRecipe: null,
  searchQuery: '',
  activeTagId: null,
  filteredRecipes: [],

  // Basic actions
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),

  // Recipe actions
  setRecipes: (recipes: Recipe[]) => {
    const normalizedRecipes = recipes.map(normalizeRecipe);
    set({ recipes: normalizedRecipes });
    get().getFilteredRecipes();
  },
  
  setCurrentRecipe: (recipe: Recipe | null) => {
    const normalizedRecipe = recipe ? normalizeRecipe(recipe) : null;
    set({ currentRecipe: normalizedRecipe });
  },
  
  addRecipe: (recipe: Recipe) => {
    const normalizedRecipe = normalizeRecipe(recipe);
    const recipes = [...get().recipes, normalizedRecipe];
    set({ recipes });
    get().getFilteredRecipes();
  },
  
  updateRecipe: (updatedRecipe: Recipe) => {
    const normalizedRecipe = normalizeRecipe(updatedRecipe);
    
    const recipes = get().recipes.map(recipe =>
      recipe.id === normalizedRecipe.id ? normalizedRecipe : recipe
    );
    set({ recipes });
    
    // Update current recipe if it's the one being updated
    if (get().currentRecipe?.id === normalizedRecipe.id) {
      set({ currentRecipe: normalizedRecipe });
    }
    
    get().getFilteredRecipes();
  },
  
  deleteRecipe: (id: number) => {
    const recipes = get().recipes.filter(recipe => recipe.id !== id);
    set({ recipes });
    
    // Clear current recipe if it's the one being deleted
    if (get().currentRecipe?.id === id) {
      set({ currentRecipe: null });
    }
    
    get().getFilteredRecipes();
  },

  // Ingredient actions
  setIngredients: (ingredients: Ingredient[]) => set({ ingredients }),
  
  addIngredient: (ingredient: Ingredient) => {
    const ingredients = [...get().ingredients, ingredient];
    set({ ingredients });
  },
  
  deleteIngredient: (id: number) => {
    const ingredients = get().ingredients.filter(ingredient => ingredient.id !== id);
    set({ ingredients });
  },

  // Tag actions
  setTags: (tags: Tag[]) => set({ tags }),
  
  addTag: (tag: Tag) => {
    const tags = [...get().tags, tag];
    set({ tags });
  },
  
  deleteTag: (id: number) => {
    const tags = get().tags.filter(tag => tag.id !== id);
    set({ tags });
    
    // Clear active tag filter if it's the one being deleted
    if (get().activeTagId === id) {
      set({ activeTagId: null });
      get().getFilteredRecipes();
    }
  },

  // Search and filter actions
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    get().getFilteredRecipes();
  },
  
  setActiveTagId: (tagId: number | null) => {
    set({ activeTagId: tagId });
    get().getFilteredRecipes();
  },
  
  clearFilters: () => {
    set({ searchQuery: '', activeTagId: null });
    get().getFilteredRecipes();
  },

  // Computed filtered recipes
  getFilteredRecipes: () => {
    const { recipes, searchQuery, activeTagId } = get();
    let filtered = [...recipes];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(recipe => {
        // Search in basic fields
        const title = recipe.title?.toLowerCase() || '';
        const description = recipe.description?.toLowerCase() || '';
        const instructions = recipe.instructions?.toLowerCase() || '';
        
        if (title.includes(query) || description.includes(query) || instructions.includes(query)) {
          return true;
        }
        
        // Search in ingredients
        if (recipe.ingredients?.some(ing => ing.name?.toLowerCase().includes(query))) {
          return true;
        }
        
        // Search in tags
        if (recipe.tags?.some(tag => tag.name?.toLowerCase().includes(query))) {
          return true;
        }
        
        return false;
      });
    }

    // Apply tag filter
    if (activeTagId) {
      filtered = filtered.filter(recipe => {
        return recipe.tags?.some(tag => tag.id === activeTagId) || false;
      });
    }

    set({ filteredRecipes: filtered });
    return filtered;
  }
}));