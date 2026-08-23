import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock,
  Users,
  Calendar,
  Edit,
  Trash2,
  ArrowLeft,
  Flame,
  Tag as TagIcon,
  Timer,
  RotateCcw,
  Minus,
  Plus
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { invalidate } from '@/hooks/useOptimizedData';
import apiService from '@/services/api';
import { Recipe } from '@/types';
import { formatTime, formatDate, formatCookingQuantity, cn } from '@/utils';
import { Card, Button, LoadingSpinner, Alert, TagChip } from '@/components/ui';
import RecipeImageGallery from '@/components/RecipeImageGallery';
import toast from 'react-hot-toast';

const MAX_SERVINGS = 50;

const RecipeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const setCurrentRecipe = useAppStore(state => state.setCurrentRecipe);
  const deleteRecipeFromStore = useAppStore(state => state.deleteRecipe);

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
      } catch (err) {
        console.error('Failed to load recipe:', err);
        setError('Recipe not found');
        setRecipe(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadRecipe();
  }, [id, setCurrentRecipe]);

  const handleDeleteRecipe = useCallback(async () => {
    if (!recipe) return;

    if (!window.confirm(`Are you sure you want to delete "${recipe.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiService.deleteRecipe(recipe.id);
      if (response.success) {
        deleteRecipeFromStore(recipe.id);
        invalidate('recipes');
        toast.success(response.message || 'Recipe deleted successfully');
        navigate('/recipes');
      } else {
        toast.error(response.error || 'Failed to delete recipe');
      }
    } catch (err: any) {
      console.error('Delete recipe error:', err);
      toast.error(err?.error || 'Failed to delete recipe. Please try again.');
    }
  }, [recipe, deleteRecipeFromStore, navigate]);

  const handleServingsChange = (newServings: number) => {
    if (newServings > 0 && newServings <= MAX_SERVINGS) {
      setServings(newServings);
    }
  };

  const getScaledQuantity = (originalQuantity: number): number => {
    if (originalServings === 0) return originalQuantity;
    return (originalQuantity * servings) / originalServings;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Alert type="error" title="Recipe not found">
          The recipe you're looking for doesn't exist or has been removed.
        </Alert>
        <div className="text-center">
          <Button as={Link} to="/recipes" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to Recipes
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id === recipe.created_by;
  const scalingRatio = originalServings > 0 ? servings / originalServings : 1;
  const isScaled = scalingRatio !== 1;
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  const stats = [
    { icon: Clock, label: 'Prep Time', value: recipe.prep_time > 0 ? formatTime(recipe.prep_time) : '—' },
    { icon: Flame, label: 'Cook Time', value: recipe.cook_time > 0 ? formatTime(recipe.cook_time) : '—' },
    { icon: Users, label: 'Servings', value: recipe.servings > 0 ? `${recipe.servings} ${recipe.serving_unit}` : '—' },
    { icon: Timer, label: 'Total Time', value: totalTime > 0 ? formatTime(totalTime) : '—' }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Button as={Link} to="/recipes" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
        Back to Recipes
      </Button>

      {/* Recipe Header */}
      <Card padding="lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{recipe.title}</h1>
            {recipe.description && (
              <p className="mt-3 text-lg leading-relaxed text-ink-500">{recipe.description}</p>
            )}
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
              <Calendar className="h-4 w-4" />
              <span>Created {formatDate(recipe.created_at)}</span>
              <span aria-hidden="true">•</span>
              <span>by {recipe.author_name}</span>
            </p>
          </div>

          {isOwner && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                as={Link}
                to={`/recipe/${recipe.id}/edit`}
                size="sm"
                variant="secondary"
                icon={<Edit className="h-4 w-4" />}
              >
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteRecipe} icon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
            </div>
          )}
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-3 border-t border-black/5 pt-6 lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl bg-white/60 px-4 py-4 text-center ring-1 ring-inset ring-black/[0.05]">
              <Icon className="mx-auto mb-2 h-5 w-5 text-brand-500" />
              <dd className="font-semibold text-ink-900">{value}</dd>
              <dt className="mt-0.5 text-xs tracking-wide text-ink-300 uppercase">{label}</dt>
            </div>
          ))}
        </dl>

        {recipe.tags && recipe.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-black/5 pt-6">
            <TagIcon className="h-4 w-4 text-ink-300" />
            {recipe.tags.map(tag => (
              <TagChip key={tag.id} tag={tag} as={Link} to={`/recipes?tag=${tag.id}`} dot />
            ))}
          </div>
        )}
      </Card>

      {/* Photos. The lightbox component already existed - nothing imported it,
          so clicking a photo opened the raw file in a new browser tab. */}
      {recipe.images && recipe.images.length > 0 && (
        <Card padding="lg">
          <RecipeImageGallery images={recipe.images} recipeName={recipe.title} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Ingredients */}
        <div className="space-y-6 lg:col-span-2">
          <Card padding="lg">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Ingredients</h2>
              {isScaled && (
                <Button size="sm" variant="ghost" onClick={() => setServings(originalServings)} icon={<RotateCcw className="h-4 w-4" />}>
                  Reset
                </Button>
              )}
            </div>

            {recipe.servings > 0 && (
              <div className="mb-5 flex items-center justify-center gap-3 rounded-2xl bg-white/60 p-2.5 ring-1 ring-inset ring-black/[0.05]">
                <button
                  onClick={() => handleServingsChange(servings - 1)}
                  disabled={servings <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-40"
                  aria-label="Decrease servings"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="min-w-[6rem] text-center">
                  <span className="text-lg font-semibold text-ink-900">{servings}</span>
                  <span className="ml-1.5 text-sm text-ink-500">{recipe.serving_unit}</span>
                </div>

                <button
                  onClick={() => handleServingsChange(servings + 1)}
                  disabled={servings >= MAX_SERVINGS}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-40"
                  aria-label="Increase servings"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}

            {recipe.ingredients && recipe.ingredients.length > 0 ? (
              <ul className="divide-y divide-black/5">
                {recipe.ingredients.map((ingredient, index) => (
                  <li key={index} className="flex items-baseline gap-3 py-2.5">
                    <span
                      className={cn(
                        'min-w-[3.5rem] text-right font-semibold tabular-nums',
                        isScaled ? 'text-brand-600' : 'text-ink-900'
                      )}
                    >
                      {formatCookingQuantity(getScaledQuantity(ingredient.quantity))}
                    </span>
                    <span className="min-w-[3rem] text-sm text-ink-500">{ingredient.unit}</span>
                    <span className="flex-1 text-ink-900">{ingredient.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-300 italic">No ingredients listed</p>
            )}

            {isScaled && (
              <p className="mt-4 border-t border-black/5 pt-4 text-xs text-ink-300">
                Scaled to {servings} {recipe.serving_unit} (×{scalingRatio.toFixed(2)} of the original)
              </p>
            )}
          </Card>
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <Card padding="lg">
            <h2 className="mb-5 text-xl font-semibold">Instructions</h2>
            <div className="text-[0.9375rem] leading-[1.75] whitespace-pre-wrap text-ink-700">
              {recipe.instructions}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RecipeDetailPage;
