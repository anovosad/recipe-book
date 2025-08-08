import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FixedSizeList as List } from 'react-window';
import { 
  Plus, 
  Search, 
  Filter, 
  X, 
  Edit, 
  Trash2, 
  Clock, 
  Users,
  Utensils,
  Tag as TagIcon
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOptimizedRecipes, useOptimizedTags } from '@/hooks/useOptimizedData';
import { useAppStore } from '@/store/appStore';
import apiService from '@/services/api';
import { Recipe } from '@/types';
import { formatTime, debounce } from '@/utils';
import { Card, Button, Input, LoadingSpinner, EmptyState } from '@/components/ui';
import toast from 'react-hot-toast';

const ITEM_HEIGHT = 200; // Height of each recipe card
const CONTAINER_HEIGHT = 600; // Height of virtualized container

const RecipesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  
  // Use optimized data hooks
  const { recipes, isLoading: recipesLoading, loadRecipes } = useOptimizedRecipes();
  const { tags, loadTags } = useOptimizedTags();
  
  const { 
    searchQuery, 
    activeTagId,
    setSearchQuery, 
    setActiveTagId,
    deleteRecipe,
    getFilteredRecipes
  } = useAppStore();

  const [showFilters, setShowFilters] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  // Load data on mount
  useEffect(() => {
    loadRecipes();
    loadTags();
  }, [loadRecipes, loadTags]);

  // Initialize from URL params
  useEffect(() => {
    const search = searchParams.get('search') || '';
    const tagId = searchParams.get('tag');
    
    setLocalSearchQuery(search);
    setSearchQuery(search);
    setActiveTagId(tagId ? parseInt(tagId) : null);
  }, [searchParams, setSearchQuery, setActiveTagId]);

  // Memoized filtered recipes for performance
  const filteredRecipes = useMemo(() => {
    return getFilteredRecipes();
  }, [recipes, searchQuery, activeTagId, getFilteredRecipes]);

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      setSearchQuery(query);
      updateUrlParams(query, activeTagId);
    }, 300),
    [setSearchQuery, activeTagId]
  );

  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearchQuery(value);
    debouncedSearch(value);
  };

  // Update URL parameters
  const updateUrlParams = (search: string, tagId: number | null) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tagId) params.set('tag', tagId.toString());
    
    const paramString = params.toString();
    setSearchParams(paramString ? params : {}, { replace: true });
  };

  // Handle tag filter
  const handleTagFilter = (tagId: number | null) => {
    setActiveTagId(tagId);
    updateUrlParams(searchQuery, tagId);
  };

  // Clear filters
  const clearFilters = () => {
    setLocalSearchQuery('');
    setSearchQuery('');
    setActiveTagId(null);
    setSearchParams({}, { replace: true });
  };

  // Delete recipe handler
  const handleDeleteRecipe = async (recipeId: number, recipeName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${recipeName}"?`)) {
      return;
    }

    try {
      const response = await apiService.deleteRecipe(recipeId);
      if (response.success) {
        deleteRecipe(recipeId);
        toast.success('Recipe deleted successfully');
      } else {
        toast.error(response.error || 'Failed to delete recipe');
      }
    } catch (error: any) {
      console.error('Delete recipe error:', error);
      toast.error('Failed to delete recipe. Please try again.');
    }
  };

  // Virtualized row renderer
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const recipe = filteredRecipes[index];
    if (!recipe) return null;

    return (
      <div style={style} className="px-2 py-1">
        <RecipeCard
          recipe={recipe}
          isOwner={user?.id === recipe.created_by}
          onDelete={handleDeleteRecipe}
        />
      </div>
    );
  };

  if (recipesLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const activeTag = tags.find(tag => tag.id === activeTagId);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Utensils className="w-8 h-8 text-red-600" />
            Recipes
          </h1>
          <p className="text-gray-600 mt-1">
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''} found
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
          >
            Filter
          </Button>
          
          {isAuthenticated && (
            <Button
              as={Link}
              to="/recipe/new"
              icon={<Plus className="w-4 h-4" />}
            >
              Add Recipe
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search recipes, ingredients, or tags..."
              value={localSearchQuery}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>

          {(showFilters || activeTagId || searchQuery) && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <TagIcon className="w-4 h-4" />
                  Filter by Tags
                </h3>
                {(activeTagId || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    icon={<X className="w-4 h-4" />}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleTagFilter(tag.id === activeTagId ? null : tag.id)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      tag.id === activeTagId
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-red-300 hover:text-red-600'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Filters Display */}
          {(activeTag || searchQuery) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Active filters:</span>
              {searchQuery && (
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Search: "{searchQuery}"
                </span>
              )}
              {activeTag && (
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">
                  Tag: {activeTag.name}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Recipes List */}
      {filteredRecipes.length > 0 ? (
        <div className="space-y-4">
          {/* Use virtualization for large lists */}
          {filteredRecipes.length > 20 ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Showing {filteredRecipes.length} recipes (virtualized for performance)
              </p>
              <List
                height={CONTAINER_HEIGHT}
                width="100%"
                itemCount={filteredRecipes.length}
                itemSize={ITEM_HEIGHT}
                className="border rounded-lg"
              >
                {Row}
              </List>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRecipes.map(recipe => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  isOwner={user?.id === recipe.created_by}
                  onDelete={handleDeleteRecipe}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Utensils className="w-12 h-12" />}
          title="No recipes found"
          description={
            searchQuery || activeTagId
              ? "No recipes match your current filters. Try adjusting your search or clearing filters."
              : isAuthenticated
              ? "Be the first to add a delicious recipe!"
              : "Please log in to add recipes."
          }
          action={
            isAuthenticated && !searchQuery && !activeTagId ? (
              <Button as={Link} to="/recipe/new" icon={<Plus className="w-4 h-4" />}>
                Add Your First Recipe
              </Button>
            ) : (searchQuery || activeTagId) ? (
              <Button onClick={clearFilters} variant="secondary">
                Clear Filters
              </Button>
            ) : null
          }
        />
      )}
    </div>
  );
};

// Optimized Recipe Card Component - FIXED to always show buttons
interface RecipeCardProps {
  recipe: Recipe;
  isOwner: boolean;
  onDelete: (id: number, name: string) => void;
}

const RecipeCard: React.FC<RecipeCardProps> = React.memo(({ recipe, isOwner, onDelete }) => {
  return (
    <Card className="group hover:shadow-xl transition-shadow duration-300">
      <div className="space-y-4">
        {/* Recipe Header */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Link 
              to={`/recipe/${recipe.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-red-600 transition-colors line-clamp-2"
            >
              {recipe.title}
            </Link>
            {recipe.description && (
              <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                {recipe.description}
              </p>
            )}
          </div>
        </div>

        {/* Recipe Meta */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {recipe.prep_time > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatTime(recipe.prep_time)}
            </div>
          )}
          {recipe.servings > 0 && (
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              {recipe.servings} {recipe.serving_unit}
            </div>
          )}
        </div>

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 3).map(tag => (
              <span
                key={tag.id}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag.name}
              </span>
            ))}
            {recipe.tags.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{recipe.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Actions - ALWAYS VISIBLE for owners */}
        {isOwner && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              as={Link}
              to={`/recipe/${recipe.id}/edit`}
              size="sm"
              variant="secondary"
              icon={<Edit className="w-4 h-4" />}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => onDelete(recipe.id, recipe.title)}
              icon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
});

export default RecipesPage;