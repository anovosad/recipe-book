import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  ArrowLeft,
  Plus,
  Minus,
  Image as ImageIcon,
  X,
  Tag as TagIcon,
  Clock,
  ChefHat,
  Star,
  Link2,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { Recipe, Ingredient, Tag, RecipeForm, RecipeText, SERVING_UNITS, MEASUREMENT_UNITS } from '@/types';
import { validateImageFile, getErrorMessage, cn } from '@/utils';
import { useTranslation, useFormatters, translate, currentLanguage, useLanguageStore } from '@/i18n';
import { Card, Button, Input, Textarea, Select, LoadingSpinner, Modal, TagChip } from '@/components/ui';
import { invalidate } from '@/hooks/useOptimizedData';
import toast from 'react-hot-toast';

// The form edits one language at a time, so its own fields stay flat. The other
// languages ride along in `otherTexts` and are merged back on save - a save
// replaces the whole set, so dropping them would delete them.
interface FormData extends Omit<RecipeForm, 'images' | 'texts'> {
  title: string;
  description: string;
  instructions: string;
  images: FileList | null;
}

const RecipeFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const { unitLabel, unitCategory, servingUnitLabel } = useFormatters();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [imagePreview, setImagePreview] = useState<string[]>([]);
  // Which of the about-to-be-uploaded files should become the cover. Applied
  // after the upload, once the new images have ids.
  const [coverPreviewIndex, setCoverPreviewIndex] = useState<number | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);

  // Importing a recipe from a URL. `canImport` follows the server: without an
  // AI key the endpoint is not mounted at all, and a button that 404s is worse
  // than no button.
  const [canImport, setCanImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importNotes, setImportNotes] = useState<string[]>([]);

  // Every language of this recipe except the one being edited on screen.
  const [otherTexts, setOtherTexts] = useState<Record<string, RecipeText>>({});
  const language = useLanguageStore(state => state.language);
  
  // Modal states
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#ff6b6b');

  const isEditMode = !!id;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    watch,
    reset
  } = useForm<FormData>({
    defaultValues: {
      title: '',
      description: '',
      instructions: '',
      prep_time: 0,
      cook_time: 0,
      servings: 4,
      serving_unit: 'people',
      ingredients: [{ ingredient_id: 0, quantity: 0, unit: '' }],
      tags: [],
      images: null
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'ingredients'
  });

  const watchedImages = watch('images');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoadingData(true);
        
        const [ingredientsData, tagsData] = await Promise.all([
          apiService.getIngredients(),
          apiService.getTags()
        ]);

        setIngredients(ingredientsData || []);
        setTags(tagsData || []);

        // Caught separately from the two above: a server that does not know
        // /api/features must still open the form, it just does not offer the
        // import. Failing the whole load over an optional feature would be a
        // blank page instead of a missing button.
        try {
          const features = await apiService.getFeatures();
          setCanImport(!!features?.recipe_import);
        } catch {
          setCanImport(false);
        }

        // Load recipe if editing
        if (isEditMode && id) {
          try {
            const recipeData = await apiService.getRecipe(Number(id));
            setRecipe(recipeData);
          } catch (error) {
            console.error('Failed to load recipe:', error);
            toast.error(translate(currentLanguage(), 'recipe.notFound'));
            navigate('/');
            return;
          }
        }

        setIsFormReady(true);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error(translate(currentLanguage(), 'form.loadFailed'));
        if (isEditMode) {
          navigate('/');
        }
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
    // `language` is in here because the ingredient and tag pickers come back
    // translated, so a switch has to refetch them. No `t` though: that is a
    // fresh function on every render, and keying a fetch on one starts a loop.
  }, [id, isEditMode, navigate, language]);

  // Switching language while editing swaps which version is in the fields, and
  // keeps what was typed in the one being left.
  //
  // Deliberately not a refetch: the load above brings the recipe back as it is
  // stored, which would throw away unsaved edits the moment somebody pressed
  // the language switch. The form already holds every version - the one on
  // screen and the rest in otherTexts - so the swap is local, and nothing is
  // lost until Save decides what to write.
  const shownLanguage = useRef(language);
  useEffect(() => {
    const previous = shownLanguage.current;
    if (previous === language) return;
    shownLanguage.current = language;

    const leaving = {
      title: getValues('title'),
      description: getValues('description'),
      instructions: getValues('instructions')
    };
    const arriving = otherTexts[language] ?? { title: '', description: '', instructions: '' };

    setOtherTexts(current => {
      const next = { ...current, [previous]: leaving };
      delete next[language];
      return next;
    });

    setValue('title', arriving.title);
    setValue('description', arriving.description);
    setValue('instructions', arriving.instructions);
  }, [language, otherTexts, getValues, setValue]);

  // Populate form when recipe and reference data are loaded.
  //
  // `isFormReady` already means "ingredients, tags and the recipe have all
  // been fetched". The old condition also demanded that the ingredient and tag
  // lists were non-empty, so on an install with no tags defined yet the edit
  // form never populated at all - it showed empty fields for an existing
  // recipe, and saving that wrote the empty values back.
  useEffect(() => {
    if (recipe && isFormReady) {
      // The fields show this language if the recipe has it, otherwise whatever
      // the server fell back to - editing a recipe that has no Czech version
      // should not present three empty boxes.
      const stored = recipe.texts ?? {};
      const shown = stored[language] ?? {
        title: recipe.title,
        description: recipe.description,
        instructions: recipe.instructions
      };
      const rest = { ...stored };
      delete rest[language];
      setOtherTexts(rest);

      reset({
        title: shown.title || '',
        description: shown.description || '',
        instructions: shown.instructions || '',
        prep_time: recipe.prep_time || 0,
        cook_time: recipe.cook_time || 0,
        servings: recipe.servings || 4,
        serving_unit: recipe.serving_unit || 'people',
        ingredients: recipe.ingredients?.length > 0 
          ? recipe.ingredients.map(ing => ({
              ingredient_id: ing.ingredient_id || 0,
              quantity: ing.quantity || 0,
              unit: ing.unit || ''
            }))
          : [{ ingredient_id: 0, quantity: 0, unit: '' }],
        tags: recipe.tags?.map(tag => tag.id) || [],
        images: null
      });

      // Set selected tags
      if (recipe.tags && recipe.tags.length > 0) {
        setSelectedTags(new Set(recipe.tags.map(tag => tag.id)));
      } else {
        setSelectedTags(new Set());
      }
    }
    // No `language` here: the effect above owns switching between versions, and
    // re-running this one would reset the form over whatever was being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, isFormReady, reset]);

  // Handle image preview
  useEffect(() => {
    if (watchedImages && watchedImages.length > 0) {
      const previews: string[] = [];
      
      for (let i = 0; i < Math.min(watchedImages.length, 5); i++) {
        const file = watchedImages[i];
        const validation = validateImageFile(file);
        
        if (validation.valid) {
          const url = URL.createObjectURL(file);
          previews.push(url);
        }
      }
      
      setImagePreview(previews);
      setCoverPreviewIndex(null);

      // Cleanup
      return () => {
        previews.forEach(url => URL.revokeObjectURL(url));
      };
    } else {
      setImagePreview([]);
      setCoverPreviewIndex(null);
    }
  }, [watchedImages]);

  // Read a recipe off a web page and drop it into the form.
  //
  // Nothing is saved here - what comes back is a draft, and the person still
  // presses Create. The one thing the server does write is the taxonomy: an
  // ingredient or tag the recipe needs and the collection lacks is created
  // during the import, so both pickers are reloaded before the draft's ids are
  // handed to the form, or a brand-new ingredient would render as an empty
  // select.
  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) {
      toast.error(t('import.needUrl'));
      return;
    }

    setIsImporting(true);
    setImportNotes([]);

    try {
      const draft = await apiService.importRecipe(url);

      const [ingredientsData, tagsData] = await Promise.all([
        apiService.getIngredients(),
        apiService.getTags()
      ]);
      setIngredients(ingredientsData || []);
      setTags(tagsData || []);
      invalidate('ingredients', 'tags');

      const imported = draft.recipe;
      // The import writes both languages. The one on screen goes into the
      // fields; the other is carried to the save untouched, so a Czech reviewer
      // still stores the English version they never looked at.
      const rest = { ...(draft.texts ?? {}) };
      delete rest[language];
      setOtherTexts(rest);

      reset({
        title: imported.title || '',
        description: imported.description || '',
        instructions: imported.instructions || '',
        prep_time: imported.prep_time || 0,
        cook_time: imported.cook_time || 0,
        servings: imported.servings || 4,
        serving_unit: imported.serving_unit || 'people',
        ingredients: imported.ingredients?.length
          ? imported.ingredients.map(ing => ({
              ingredient_id: ing.ingredient_id,
              quantity: ing.quantity,
              unit: ing.unit
            }))
          : [{ ingredient_id: 0, quantity: 0, unit: '' }],
        tags: imported.tags?.map(tag => tag.id) || [],
        // Photos already chosen are left alone: they came from the person, not
        // from the page, and resetting them would drop the previews too.
        images: watchedImages ?? null
      });
      setSelectedTags(new Set(imported.tags?.map(tag => tag.id) || []));
      setImportNotes(draft.notes || []);

      toast.success(t('import.done'));
    } catch (error: any) {
      // The service throws the error envelope, so the server's own sentence -
      // "that page does not appear to hold a recipe" - is what gets shown.
      toast.error(error?.error || t('import.failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    
    try {
      // Validate ingredients
      const validIngredients = data.ingredients.filter(ing => 
        ing.ingredient_id && ing.quantity > 0 && ing.unit
      );

      if (validIngredients.length === 0) {
        toast.error(t('form.needIngredient'));
        setIsLoading(false);
        return;
      }

      // Prepare form data (without images for the recipe API)
      const recipeData: Omit<RecipeForm, 'images'> = {
        texts: {
          ...otherTexts,
          [language]: {
            title: data.title,
            description: data.description,
            instructions: data.instructions
          }
        },
        prep_time: data.prep_time,
        cook_time: data.cook_time,
        servings: data.servings,
        serving_unit: data.serving_unit,
        ingredients: validIngredients,
        tags: Array.from(selectedTags),
      };

      let recipeId: number;
      let uploadedImages = 0;

      if (isEditMode && recipe) {
        // Update existing recipe
        await apiService.updateRecipe(recipe.id, recipeData);
        recipeId = recipe.id;
        
        // Upload new images if provided
        if (data.images && data.images.length > 0) {
          try {
            const imageResponse = await apiService.uploadRecipeImages(recipeId, Array.from(data.images));
            uploadedImages = imageResponse.data?.images?.length || 0;
            await applyChosenCover(imageResponse.data?.images);
          } catch (error) {
            console.warn('Failed to upload images:', error);
            toast.error(t('form.imagesFailed'));
          }
        }
        
        let message = t('form.updated');
        if (uploadedImages > 0) {
          message += ' ' + t('form.imagesUploaded', { count: uploadedImages });
        }
        toast.success(message);
      } else {
        // Create new recipe
        const createResponse = await apiService.createRecipe(recipeData);
        
        if (!createResponse.success || !createResponse.data?.id) {
          throw new Error(createResponse.error || 'Failed to create recipe');
        }
        
        recipeId = createResponse.data.id;
        
        // Upload images if provided
        if (data.images && data.images.length > 0) {
          try {
            const imageResponse = await apiService.uploadRecipeImages(recipeId, Array.from(data.images));
            uploadedImages = imageResponse.data?.images?.length || 0;
            await applyChosenCover(imageResponse.data?.images);
          } catch (error) {
            console.warn('Failed to upload images:', error);
            toast.error(t('form.imagesFailed'));
          }
        }
        
        let message = t('form.created');
        if (uploadedImages > 0) {
          message += ' ' + t('form.imagesUploaded', { count: uploadedImages });
        }
        toast.success(message);
      }

      invalidate('recipes');
      navigate(`/recipe/${recipeId}`);
    } catch (error: any) {
      console.error('Recipe form error:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // The previews are built from the files that passed validation, and the
  // server validates the same way, so the two lists line up - but if they do
  // not, promoting by position would pick the wrong photo, so it is skipped.
  const applyChosenCover = async (uploaded?: { id: number }[]) => {
    if (coverPreviewIndex === null || !uploaded) return;
    if (uploaded.length !== imagePreview.length) return;

    const chosen = uploaded[coverPreviewIndex];
    if (!chosen) return;

    try {
      await apiService.setImageCover(chosen.id);
    } catch (error) {
      console.warn('Failed to set the cover image:', error);
      toast.error(t('form.coverFailed'));
    }
  };

  const handleSetCover = async (imageId: number) => {
    if (!recipe) return;
    try {
      const response = await apiService.setImageCover(imageId);
      if (response.success) {
        setRecipe({ ...recipe, images: response.data ?? recipe.images });
        invalidate('recipes');
        toast.success(t('form.coverUpdated'));
      } else {
        toast.error(response.error || t('form.coverFailed'));
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleTagToggle = (tagId: number) => {
    const newTags = new Set(selectedTags);
    if (newTags.has(tagId)) {
      newTags.delete(tagId);
    } else {
      newTags.add(tagId);
    }
    setSelectedTags(newTags);
    setValue('tags', Array.from(newTags));
  };

  const handleAddIngredient = async () => {
    if (!newIngredientName.trim()) {
      toast.error(t('ingredients.nameRequired'));
      return;
    }

    try {
      const response = await apiService.createIngredient({ name: newIngredientName.trim() });
      if (response.success) {
        // Refresh ingredients list
        const updatedIngredients = await apiService.getIngredients();
        setIngredients(updatedIngredients);
        invalidate('ingredients');
        setNewIngredientName('');
        setShowIngredientModal(false);
        toast.success(t('ingredients.added'));
      } else {
        toast.error(response.error || t('ingredients.addFailed'));
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      toast.error(t('tags.nameRequired'));
      return;
    }

    try {
      const response = await apiService.createTag({
        name: newTagName.trim(),
        color: newTagColor
      });
      
      if (response.success) {
        // Refresh tags list
        const updatedTags = await apiService.getTags();
        setTags(updatedTags);
        invalidate('tags');
        setNewTagName('');
        setNewTagColor('#ff6b6b');
        setShowTagModal(false);
        toast.success(t('tags.added'));
      } else {
        toast.error(response.error || t('tags.addFailed'));
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoadingData) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          as={Link}
          to={isEditMode && recipe ? `/recipe/${recipe.id}` : '/'}
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          {t('form.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {isEditMode ? t('form.editTitle') : t('form.createTitle')}
          </h1>
          {isEditMode && recipe && (
            <p className="text-ink-500">{t('form.editing', { title: recipe.title })}</p>
          )}
        </div>
      </div>

      {/* Import from a URL. Create-only: running it over a recipe being edited
          would throw away what is already stored. */}
      {!isEditMode && canImport && (
        <Card>
          <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="w-5 h-5" />
            {t('import.title')}
          </h2>
          <p className="mb-4 text-sm text-ink-500">{t('import.hint')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* The wrapper carries the growth, not the Input: its className
                lands on the <input>, while the field's own div is the flex
                item. */}
            <div className="flex-1">
              <Input
                type="url"
                inputMode="url"
                value={importUrl}
                onChange={event => setImportUrl(event.target.value)}
                onKeyDown={event => {
                  // The panel sits outside the <form>, so Enter has nothing to
                  // submit; wiring it here is what makes paste-and-go work.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!isImporting) handleImport();
                  }
                }}
                placeholder={t('import.placeholder')}
                disabled={isImporting}
              />
            </div>
            <Button
              type="button"
              onClick={handleImport}
              loading={isImporting}
              disabled={isImporting || !importUrl.trim()}
              icon={<Link2 className="w-4 h-4" />}
            >
              {isImporting ? t('import.working') : t('import.action')}
            </Button>
          </div>

          {importNotes.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="w-4 h-4" />
                {t('import.notes')}
              </h3>
              <p className="mt-1 text-xs text-ink-500">{t('import.notesHint')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {importNotes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <h2 className="mb-5 text-xl font-semibold">{t('form.basics')}</h2>
          <div className="space-y-4">
            <Input
              label={t('form.title')}
              {...register('title', {
                required: t('valid.titleRequired'),
                maxLength: {
                  value: 200,
                  message: t('valid.titleTooLong')
                }
              })}
              error={errors.title?.message}
              placeholder={t('form.titlePlaceholder')}
            />

            <Textarea
              label={t('form.description')}
              {...register('description', {
                maxLength: {
                  value: 1000,
                  message: t('valid.descriptionTooLong')
                }
              })}
              error={errors.description?.message}
              placeholder={t('form.descriptionPlaceholder')}
              rows={3}
            />
          </div>
        </Card>

        {/* Recipe Details */}
        <Card>
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
            <Clock className="w-5 h-5" />
            {t('form.details')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label={t('form.prepTime')}
              type="number"
              min="0"
              {...register('prep_time', {
                min: { value: 0, message: t('valid.timeNegative') },
                max: { value: 1440, message: t('valid.timeTooLong') },
                valueAsNumber: true
              })}
              error={errors.prep_time?.message}
              placeholder="0"
            />

            <Input
              label={t('form.cookTime')}
              type="number"
              min="0"
              {...register('cook_time', {
                min: { value: 0, message: t('valid.timeNegative') },
                max: { value: 1440, message: t('valid.timeTooLong') },
                valueAsNumber: true
              })}
              error={errors.cook_time?.message}
              placeholder="0"
            />

            <Input
              label={t('form.servings')}
              type="number"
              min="1"
              max="100"
              {...register('servings', {
                required: t('valid.servingsRequired'),
                min: { value: 1, message: t('valid.servingsMin') },
                max: { value: 100, message: t('valid.servingsMax') },
                valueAsNumber: true
              })}
              error={errors.servings?.message}
              placeholder="4"
            />

            <Select
              label={t('form.servingUnit')}
              {...register('serving_unit')}
              options={SERVING_UNITS.map(unit => ({
                value: unit.value,
                label: servingUnitLabel(unit.value)
              }))}
              error={errors.serving_unit?.message}
            />
          </div>
        </Card>

        {/* Ingredients */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <ChefHat className="w-5 h-5" />
              {t('form.ingredients')}
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowIngredientModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              {t('form.addNewIngredient')}
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-3">
                <div className="flex-1">
                  <Select
                    label={index === 0 ? t('form.ingredient') : ''}
                    {...register(`ingredients.${index}.ingredient_id` as const, {
                      required: t('valid.ingredientRequired'),
                      valueAsNumber: true
                    })}
                    options={[
                      { value: '0', label: t('form.selectIngredient') },
                      ...ingredients.map(ing => ({
                        value: ing.id.toString(),
                        label: ing.name
                      }))
                    ]}
                    error={errors.ingredients?.[index]?.ingredient_id?.message}
                  />
                </div>

                <div className="w-24">
                  <Input
                    label={index === 0 ? t('form.quantity') : ''}
                    type="number"
                    step="0.1"
                    min="0"
                    {...register(`ingredients.${index}.quantity` as const, {
                      required: t('valid.quantityRequired'),
                      min: { value: 0.1, message: t('valid.quantityMin') },
                      max: { value: 10000, message: t('valid.quantityMax') },
                      valueAsNumber: true
                    })}
                    error={errors.ingredients?.[index]?.quantity?.message}
                    placeholder="0"
                  />
                </div>

                <div className="w-32">
                  <Select
                    label={index === 0 ? t('form.unit') : ''}
                    {...register(`ingredients.${index}.unit` as const, {
                      required: t('valid.unitRequired')
                    })}
                    options={[
                      { value: '', label: t('form.selectUnit') },
                      ...MEASUREMENT_UNITS.reduce((acc, unit) => {
                        const category = acc.find(g => g.key === unit.category);
                        const option = { value: unit.value, label: unitLabel(unit.value) };
                        if (category) {
                          category.options.push(option);
                        } else {
                          acc.push({ key: unit.category, options: [option] });
                        }
                        return acc;
                      }, [] as { key: string; options: { value: string; label: string }[] }[])
                        .flatMap((group, groupIndex) => [
                          {
                            value: `__separator_${groupIndex}__`,
                            label: `--- ${unitCategory(group.key)} ---`,
                            disabled: true
                          },
                          ...group.options
                        ])
                    ]}
                    error={errors.ingredients?.[index]?.unit?.message}
                  />
                </div>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  icon={<Minus className="w-4 h-4" />}
                />
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => append({ ingredient_id: 0, quantity: 0, unit: '' })}
            icon={<Plus className="w-4 h-4" />}
            className="mt-3"
          >
            {t('form.addIngredientRow')}
          </Button>
        </Card>

        {/* Tags */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <TagIcon className="w-5 h-5" />
              {t('form.tags')}
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowTagModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              {t('form.addNewTag')}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <TagChip
                key={tag.id}
                tag={tag}
                as="button"
                type="button"
                dot
                selected={selectedTags.has(tag.id)}
                aria-pressed={selectedTags.has(tag.id)}
                onClick={() => handleTagToggle(tag.id)}
              />
            ))}
          </div>

          <p className="mt-3 text-sm text-ink-500">
            {t('form.tagsHint')}
          </p>
        </Card>

        {/* Images */}
        <Card>
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
            <ImageIcon className="w-5 h-5" />
            {t('form.images')}
          </h2>
          
          <div className="space-y-4">
            <div>
              <Input
                label={t('form.addImages')}
                type="file"
                multiple
                accept="image/*"
                {...register('images')}
                helperText={t('form.imagesHelp')}
              />
            </div>

            {imagePreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-ink-500">
                  {isEditMode
                    ? t('form.pendingUploadEdit')
                    : t('form.pendingUploadNew')}
                </p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {imagePreview.map((preview, index) => (
                    <div key={index} className="group relative">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className={cn(
                          'aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-black/[0.06]',
                          coverPreviewIndex === index && 'ring-2 ring-brand-400'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setCoverPreviewIndex(current => (current === index ? null : index))}
                        aria-pressed={coverPreviewIndex === index}
                        title={coverPreviewIndex === index ? t('form.coverWillBe') : t('form.setCover')}
                        className={cn(
                          'absolute left-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm transition-all',
                          coverPreviewIndex === index
                            ? 'btn-brand'
                            : 'bg-white/90 text-ink-500 opacity-0 group-hover:opacity-100 hover:text-brand-600 focus-visible:opacity-100'
                        )}
                      >
                        <Star className={cn('h-3.5 w-3.5', coverPreviewIndex === index && 'fill-current')} />
                        {coverPreviewIndex === index ? t('form.cover') : t('form.setCover')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEditMode && recipe?.images && recipe.images.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium text-ink-900">{t('form.currentImages')}</h3>
                <p className="mb-3 text-sm text-ink-500">
                  {t('form.coverExplainer')}
                </p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {recipe.images.map((image, index) => (
                    <div key={image.id} className="group relative">
                      <img
                        src={`/uploads/${image.filename}`}
                        alt={image.caption || recipe.title}
                        className={cn(
                          'aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-black/[0.06]',
                          index === 0 && 'ring-2 ring-brand-400'
                        )}
                      />

                      {/* The cover is simply the image that sorts first, so
                          promoting one is a reorder - which is what the
                          endpoint does. */}
                      {index === 0 ? (
                        <span className="btn-brand absolute left-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          {t('form.cover')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetCover(image.id)}
                          title={t('form.setCover')}
                          className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink-500 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:text-brand-600 focus-visible:opacity-100"
                        >
                          <Star className="h-3.5 w-3.5" />
                          {t('form.setCover')}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiService.deleteImage(image.id);
                            // Refresh recipe data
                            const updatedRecipe = await apiService.getRecipe(recipe.id);
                            setRecipe(updatedRecipe);
                            invalidate('recipes');
                            toast.success(t('form.imageDeleted'));
                          } catch {
                            toast.error(t('form.imageDeleteFailed'));
                          }
                        }}
                        title={t('form.deleteImage')}
                        aria-label={t('form.deleteImage')}
                        className="absolute right-2 top-2 rounded-full bg-rose-500 p-1.5 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Instructions */}
        <Card>
          <h2 className="mb-5 text-xl font-semibold">{t('form.instructions')}</h2>
          <Textarea
            {...register('instructions', {
              required: t('valid.instructionsRequired'),
              maxLength: {
                value: 10000,
                message: t('valid.instructionsTooLong')
              }
            })}
            rows={12}
            error={errors.instructions?.message}
            placeholder={t('form.instructionsPlaceholder')}
          />
        </Card>

        {/* Submit Buttons */}
        <Card>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              as={Link}
              to={isEditMode && recipe ? `/recipe/${recipe.id}` : '/'}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading
                ? (isEditMode ? t('form.updating') : t('form.creating'))
                : (isEditMode ? t('form.update') : t('form.create'))
              }
            </Button>
          </div>
        </Card>
      </form>

      {/* Modals */}
      <Modal
        isOpen={showIngredientModal}
        onClose={() => setShowIngredientModal(false)}
        title={t('ingredients.newTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('form.newIngredientName')}
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
            placeholder={t('form.newIngredientPlaceholder')}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowIngredientModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleAddIngredient}
            >
              {t('ingredients.add')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        title={t('tags.newTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('form.newTagName')}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder={t('form.newTagPlaceholder')}
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              {t('form.tagColor')}
            </label>
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-lg border border-black/10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowTagModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleAddTag}
            >
              {t('tags.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RecipeFormPage;