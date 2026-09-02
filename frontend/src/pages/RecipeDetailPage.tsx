import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { formatCookingQuantity, parseInstructions, cn } from '@/utils';
import { useTranslation, useFormatters, useLanguageStore, LANGUAGES } from '@/i18n';
import { Card, Button, LoadingSpinner, Alert, TagChip } from '@/components/ui';
import { Languages as LanguagesIcon, ExternalLink } from 'lucide-react';
import RecipeImageGallery from '@/components/RecipeImageGallery';
import toast from 'react-hot-toast';

const MAX_SERVINGS = 50;

// The host is the useful part of a source link - "varecha.pravda.sk" says
// where a recipe came from, where the full URL is forty characters of slug.
const sourceHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const RecipeDetailPage: React.FC = () => {
  const language = useLanguageStore(state => state.language);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const { formatDuration, formatDate, formatServings, formatUnit } = useFormatters();
  const setCurrentRecipe = useAppStore(state => state.setCurrentRecipe);
  const deleteRecipeFromStore = useAppStore(state => state.deleteRecipe);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState<number>(0);
  const [originalServings, setOriginalServings] = useState<number>(0);

  // Above the loading and error returns: hooks cannot sit behind them.
  const steps = useMemo(() => parseInstructions(recipe?.instructions ?? ''), [recipe?.instructions]);
  const isNumbered = steps.some(step => step.number !== undefined);

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
    // `language` matters: the server answers in it, so switching has to refetch
    // or the title, description, method, ingredients and tags all stay in the
    // language the page was opened in.
  }, [id, setCurrentRecipe, language]);

  const [isTranslating, setIsTranslating] = useState(false);

  // Write the missing language of a recipe that already exists. The result is
  // saved, unlike an import: this is a translation of text a person already
  // checked, not a reading of a strange web page.
  const handleTranslate = async () => {
    if (!recipe) return;
    setIsTranslating(true);
    try {
      const response = await apiService.translateRecipe(recipe.id, language);
      if (!response.success || !response.data) throw response;
      setRecipe(response.data);
      invalidate('recipes');
      toast.success(t('lang.translated'));
    } catch (error: any) {
      toast.error(error?.error || t('lang.translateFailed'));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleDeleteRecipe = useCallback(async () => {
    if (!recipe) return;

    if (!window.confirm(t('recipe.deleteConfirm', { title: recipe.title }))) {
      return;
    }

    try {
      const response = await apiService.deleteRecipe(recipe.id);
      if (response.success) {
        deleteRecipeFromStore(recipe.id);
        invalidate('recipes');
        toast.success(t('recipes.deleted'));
        navigate('/');
      } else {
        toast.error(response.error || t('recipes.deleteFailed'));
      }
    } catch (err: any) {
      console.error('Delete recipe error:', err);
      toast.error(err?.error || t('recipes.deleteFailed'));
    }
  }, [recipe, deleteRecipeFromStore, navigate, t]);

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
        <Alert type="error" title={t('recipe.notFound')}>
          {t('recipe.notFoundBody')}
        </Alert>
        <div className="text-center">
          <Button as={Link} to="/" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            {t('recipe.back')}
          </Button>
        </div>
      </div>
    );
  }

  // Signed in is the whole test. Authorisation went flat when the collection
  // became shared - the API dropped every "AND created_by = ?" - and this check
  // was left behind, so the buttons stayed hidden for a write the server would
  // have accepted.
  const canEdit = !!user;
  const scalingRatio = originalServings > 0 ? servings / originalServings : 1;
  const isScaled = scalingRatio !== 1;
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  const stats = [
    { icon: Clock, label: t('recipe.prepTime'), value: formatDuration(recipe.prep_time) },
    { icon: Flame, label: t('recipe.cookTime'), value: formatDuration(recipe.cook_time) },
    { icon: Users, label: t('recipe.servings'), value: recipe.servings > 0 ? formatServings(recipe.servings, recipe.serving_unit) : t('common.notSpecified') },
    { icon: Timer, label: t('recipe.totalTime'), value: formatDuration(totalTime) }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Button as={Link} to="/" variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
        {t('recipe.back')}
      </Button>

      {/* Above the fold and full width. It used to be a row of thumbnails in a
          card halfway down the page. */}
      {recipe.images && recipe.images.length > 0 && (
        <RecipeImageGallery images={recipe.images} recipeName={recipe.title} />
      )}

      {/* Recipe Header */}
      <Card padding="lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">{recipe.title}</h1>

            {/* The recipe has no version in the language the site is set to, so
                this is the fallback. Saying so beats showing Czech to someone
                who asked for English and letting them wonder. */}
            {recipe.language !== language && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <LanguagesIcon className="h-4 w-4 shrink-0" />
                <span>{t('lang.shownIn', { language: LANGUAGES[recipe.language as keyof typeof LANGUAGES]?.label ?? recipe.language })}</span>
                {user && (
                  <Button size="sm" variant="secondary" onClick={handleTranslate} loading={isTranslating}>
                    {isTranslating ? t('lang.translating') : t('lang.translateTo', { language: LANGUAGES[language].label })}
                  </Button>
                )}
              </div>
            )}
            {recipe.description && (
              <p className="mt-3 text-lg leading-relaxed text-ink-500">{recipe.description}</p>
            )}

            {/* Its own line, not a bare URL inside the description. rel keeps
                the referrer and the window handle away from the other site. */}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm text-ink-300 underline decoration-dotted underline-offset-4 transition-colors hover:text-brand-600"
                title={recipe.source_url}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('recipe.source', { host: sourceHost(recipe.source_url) })}</span>
              </a>
            )}
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
              <Calendar className="h-4 w-4" />
              <span>{t('recipe.created', { date: formatDate(recipe.created_at) })}</span>
              <span aria-hidden="true">•</span>
              <span>{t('common.by', { author: recipe.author_name })}</span>
            </p>
          </div>

          {canEdit && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                as={Link}
                to={`/recipe/${recipe.id}/edit`}
                size="sm"
                variant="secondary"
                icon={<Edit className="h-4 w-4" />}
              >
                {t('common.edit')}
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteRecipe} icon={<Trash2 className="h-4 w-4" />}>
                {t('common.delete')}
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
              <TagChip key={tag.id} tag={tag} as={Link} to={`/?tag=${tag.id}`} dot />
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Ingredients */}
        <div className="space-y-6 lg:col-span-2">
          <Card padding="lg">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{t('recipe.ingredients')}</h2>
              {isScaled && (
                <Button size="sm" variant="ghost" onClick={() => setServings(originalServings)} icon={<RotateCcw className="h-4 w-4" />}>
                  {t('common.reset')}
                </Button>
              )}
            </div>

            {recipe.servings > 0 && (
              <div className="mb-5 flex items-center justify-center gap-3 rounded-2xl bg-white/60 p-2.5 ring-1 ring-inset ring-black/[0.05]">
                <button
                  onClick={() => handleServingsChange(servings - 1)}
                  disabled={servings <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-40"
                  aria-label={t('recipe.decreaseServings')}
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="min-w-[6rem] text-center">
                  <span className="text-sm font-semibold text-ink-900">{formatServings(servings, recipe.serving_unit)}</span>
                </div>

                <button
                  onClick={() => handleServingsChange(servings + 1)}
                  disabled={servings >= MAX_SERVINGS}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition-colors hover:bg-brand-100 disabled:opacity-40"
                  aria-label={t('recipe.increaseServings')}
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
                    <span className="min-w-[3rem] text-sm text-ink-500">
                      {formatUnit(getScaledQuantity(ingredient.quantity), ingredient.unit)}
                    </span>
                    <span className="flex-1 text-ink-900">{ingredient.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-300 italic">{t('recipe.noIngredients')}</p>
            )}

            {isScaled && (
              <p className="mt-4 border-t border-black/5 pt-4 text-xs text-ink-300">
                {t('recipe.scaledNote', {
                  servings: formatServings(servings, recipe.serving_unit),
                  ratio: scalingRatio.toFixed(2)
                })}
              </p>
            )}
          </Card>
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <Card padding="lg">
            <h2 className="mb-6 text-xl font-semibold">{t('recipe.instructions')}</h2>

            {isNumbered ? (
              // The number sits in a fixed-width column of its own, so a step
              // that wraps lines up under its own text rather than under the
              // digit. space-y-6 is what separates one step from the next -
              // the whole block used to be a single pre-wrapped paragraph, so
              // the gap between steps was just a line break.
              <ol className="space-y-6">
                {steps.map((step, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold tabular-nums text-brand-600">
                      {step.number}
                    </span>
                    <p className="flex-1 leading-relaxed text-ink-700">
                      {step.text}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="space-y-4 leading-relaxed text-ink-700">
                {steps.map((step, index) => (
                  <p key={index}>{step.text}</p>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RecipeDetailPage;
