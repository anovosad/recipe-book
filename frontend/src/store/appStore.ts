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
    set({ recipes });
    get().getFilteredRecipes();
  },
  
  setCurrentRecipe: (recipe: Recipe | null) => set({ currentRecipe: recipe }),
  
  addRecipe: (recipe: Recipe) => {
    const recipes = [...get().recipes, recipe];
    set({ recipes });
    get().getFilteredRecipes();
  },
  
  updateRecipe: (updatedRecipe: Recipe) => {
    const recipes = get().recipes.map(recipe =>
      recipe.id === updatedRecipe.id ? updatedRecipe : recipe
    );
    set({ recipes });
    
    // Update current recipe if it's the one being updated
    if (get().currentRecipe?.id === updatedRecipe.id) {
      set({ currentRecipe: updatedRecipe });
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
      filtered = filtered.filter(recipe => 
        recipe.title.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query) ||
        recipe.instructions.toLowerCase().includes(query) ||
        recipe.ingredients.some(ing => ing.name.toLowerCase().includes(query)) ||
        recipe.tags.some(tag => tag.name.toLowerCase().includes(query))
      );
    }

    // Apply tag filter
    if (activeTagId) {
      filtered = filtered.filter(recipe =>
        recipe.tags.some(tag => tag.id === activeTagId)
      );
    }

    set({ filteredRecipes: filtered });
    return filtered;
  }
}));