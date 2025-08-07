import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Clock, 
  Users, 
  Calendar,
  Edit,
  Trash2,
  ArrowLeft,
  ChefHat,
  Tag as TagIcon,
  Calculator,
  RotateCcw
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import apiService from '@/services/api';
import { Recipe } from '@/types';
import { formatTime, formatDate, formatCookingQuantity } from '@/utils';
import { Card, Button, LoadingSpinner, Alert } from '@/components/ui';
import toast from 'react-hot-toast';

const RecipeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { setCurrentRecipe, deleteRecipe } = useAppStore();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState<number>(0);
  const [originalServings, setOriginalServings] = useState<number>(0);

  useEffect(() => {
    const loadRecipe = async () => {
      if (!id || isNaN(Number(id))) {
        setError('Invalid recipe ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const recipeData = await apiService.getRecipe(Number(id));
        setRecipe(recipeData);
        setServings(recipeData.servings);
        setOriginalServings(recipeData.servings);
        setCurrentRecipe(recipeData);
        setError(null);
      } catch (error: any) {
        console.error('Failed to load recipe:', error);
        setError('Recipe not found');
        setRecipe(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadRecipe();
  }, [id, setCurrentRecipe]);

  const handleDeleteRecipe = async () => {
    if (!recipe) return;

    if (!window.confirm(`Are you sure you want to delete "${recipe.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiService.deleteRecipe(recipe.id);
      if (response.success) {
        deleteRecipe(recipe.id);
        toast.success(response.message || 'Recipe deleted successfully');
        navigate('/recipes');
      } else {
        toast.error(response.error || 'Failed to delete recipe');
      }
    } catch (error: any) {
      console.error('Delete recipe error:', error);
      toast.error('Failed to delete recipe. Please try again.');
    }
  };

  const handleServingsChange = (newServings: number) => {
    if (newServings > 0 && newServings <= 50) {
      setServings(newServings);
    }
  };

  const resetServings = () => {
    setServings(originalServings);
  };

  const getScaledQuantity = (originalQuantity: number): number => {
    if (originalServings === 0) return originalQuantity;
    return (originalQuantity * servings) / originalServings;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="max-w-md mx-auto">
        <Alert type="error">
          <strong>Recipe not found</strong>
          <p className="mt-1">
            The recipe you're looking for doesn't exist or has been removed.
          </p>
        </Alert>
        <div className="mt-4 text-center">
          <Button
            as={Link}
            to="/recipes"
            variant="secondary"
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back to Recipes
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id === recipe.created_by;
  const scalingRatio = originalServings > 0 ? servings / originalServings : 1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <Button
        as={Link}
        to="/recipes"
        variant="ghost"
        size="sm"
        icon={<ArrowLeft className="w-4 h-4" />}
      >
        Back to Recipes
      </Button>

      {/* Recipe Header */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {recipe.title}
            </h1>
            {recipe.description && (
              <p className="text-gray-600 text-lg leading-relaxed">
                {recipe.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>Created {formatDate(recipe.created_at)}</span>
              <span>•</span>
              <span>by {recipe.author_name}</span>
            </div>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2 flex-shrink-0">
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
                onClick={handleDeleteRecipe}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Recipe Meta */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div className="text-center">
            <Clock className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <div className="font-medium text-gray-900">
              {recipe.prep_time > 0 ? formatTime(recipe.prep_time) : 'Not specified'}
            </div>
            <div className="text-sm text-gray-500">Prep Time</div>
          </div>
          <div className="text-center">
            <ChefHat className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <div className="font-medium text-gray-900">
              {recipe.cook_time > 0 ? formatTime(recipe.cook_time) : 'Not specified'}
            </div>
            <div className="text-sm text-gray-500">Cook Time</div>
          </div>
          <div className="text-center">
            <Users className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <div className="font-medium text-gray-900">
              {recipe.servings > 0 ? `${recipe.servings} ${recipe.serving_unit}` : 'Not specified'}
            </div>
            <div className="text-sm text-gray-500">Servings</div>
          </div>
          <div className="text-center">
            <Calculator className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <div className="font-medium text-gray-900">
              {recipe.prep_time > 0 && recipe.cook_time > 0 
                ? formatTime(recipe.prep_time + recipe.cook_time) 
                : 'Variable'
              }
            </div>
            <div className="text-sm text-gray-500">Total Time</div>
          </div>
        </div>
      </Card>

      {/* Recipe Images */}
      {recipe.images && recipe.images.length > 0 && (
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Photos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipe.images.map(image => (
              <div key={image.id} className="group">
                <img
                  src={`/uploads/${image.filename}`}
                  alt={image.caption || recipe.title}
                  className="w-full h-48 object-cover rounded-lg shadow-sm group-hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    // Open image in modal or new tab
                    window.open(`/uploads/${image.filename}`, '_blank');
                  }}
                />
                {image.caption && (
                  <p className="text-sm text-gray-600 mt-2 text-center">
                    {image.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ingredients */}
        <div className="lg:col-span-1">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Ingredients</h2>
              {recipe.servings > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleServingsChange(servings - 1)}
                    disabled={servings <= 1}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold"
                  >
                    -
                  </button>
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg">
                    <input
                      type="number"
                      value={servings}
                      onChange={(e) => handleServingsChange(parseInt(e.target.value) || 1)}
                      className="w-12 text-center bg-transparent border-none focus:outline-none font-medium"
                      min="1"
                      max="50"
                    />
                    <span className="text-sm text-gray-600">{recipe.serving_unit}</span>
                  </div>
                  <button
                    onClick={() => handleServingsChange(servings + 1)}
                    disabled={servings >= 50}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold"
                  >
                    +
                  </button>
                  {scalingRatio !== 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={resetServings}
                      icon={<RotateCcw className="w-3 h-3" />}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              )}
            </div>

            {recipe.ingredients && recipe.ingredients.length > 0 ? (
              <ul className="space-y-3">
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-600 rounded-full flex-shrink-0"></div>
                    <div className="flex-1">
                      <span className={`font-medium ${scalingRatio !== 1 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCookingQuantity(getScaledQuantity(ingredient.quantity))}
                      </span>
                      <span className="text-gray-600 ml-1">{ingredient.unit}</span>
                      <span className="text-gray-900 ml-2">{ingredient.name}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 italic">No ingredients listed</p>
            )}

            {scalingRatio !== 1 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500">
                  Quantities adjusted for {servings} {recipe.serving_unit} 
                  (×{scalingRatio.toFixed(1)} from original)
                </p>
              </div>
            )}
          </Card>

          {/* Tags */}
          {recipe.tags && recipe.tags.length > 0 && (
            <Card className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <TagIcon className="w-5 h-5" />
                Categories
              </h3>
              <div className="flex flex-wrap gap-2">
                {recipe.tags.map(tag => (
                  <Link
                    key={tag.id}
                    to={`/recipes?tag=${tag.id}`}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Instructions */}
        <div className="lg:col-span-2">
          <Card>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Instructions</h2>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {recipe.instructions}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RecipeDetailPage;