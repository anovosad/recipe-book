import React, { useState, useEffect } from 'react';
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
  Star
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { Recipe, Ingredient, Tag, RecipeForm, SERVING_UNITS, MEASUREMENT_UNITS } from '@/types';
import { validateImageFile, getErrorMessage, cn } from '@/utils';
import { Card, Button, Input, Textarea, Select, LoadingSpinner, Modal, TagChip } from '@/components/ui';
import { invalidate } from '@/hooks/useOptimizedData';
import toast from 'react-hot-toast';

interface FormData extends Omit<RecipeForm, 'images'> {
  images: FileList | null;
}

const RecipeFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

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

        // Load recipe if editing
        if (isEditMode && id) {
          try {
            const recipeData = await apiService.getRecipe(Number(id));
            setRecipe(recipeData);
          } catch (error) {
            console.error('Failed to load recipe:', error);
            toast.error('Recipe not found');
            navigate('/recipes');
            return;
          }
        }

        setIsFormReady(true);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Failed to load form data');
        if (isEditMode) {
          navigate('/recipes');
        }
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [id, isEditMode, navigate]);

  // Populate form when recipe and reference data are loaded.
  //
  // `isFormReady` already means "ingredients, tags and the recipe have all
  // been fetched". The old condition also demanded that the ingredient and tag
  // lists were non-empty, so on an install with no tags defined yet the edit
  // form never populated at all - it showed empty fields for an existing
  // recipe, and saving that wrote the empty values back.
  useEffect(() => {
    if (recipe && isFormReady) {
      // Reset form with recipe data
      reset({
        title: recipe.title || '',
        description: recipe.description || '',
        instructions: recipe.instructions || '',
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

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    
    try {
      // Validate ingredients
      const validIngredients = data.ingredients.filter(ing => 
        ing.ingredient_id && ing.quantity > 0 && ing.unit
      );

      if (validIngredients.length === 0) {
        toast.error('Please add at least one ingredient');
        setIsLoading(false);
        return;
      }

      // Prepare form data (without images for the recipe API)
      const recipeData: Omit<RecipeForm, 'images'> = {
        title: data.title,
        description: data.description,
        instructions: data.instructions,
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
            toast.error('Recipe updated but some images failed to upload');
          }
        }
        
        let message = 'Recipe updated successfully!';
        if (uploadedImages > 0) {
          message += ` ${uploadedImages} image(s) uploaded.`;
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
            toast.error('Recipe created but some images failed to upload');
          }
        }
        
        let message = 'Recipe created successfully!';
        if (uploadedImages > 0) {
          message += ` ${uploadedImages} image(s) uploaded.`;
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
      toast.error('Images uploaded, but the cover could not be set');
    }
  };

  const handleSetCover = async (imageId: number) => {
    if (!recipe) return;
    try {
      const response = await apiService.setImageCover(imageId);
      if (response.success) {
        setRecipe({ ...recipe, images: response.data ?? recipe.images });
        invalidate('recipes');
        toast.success('Cover image updated');
      } else {
        toast.error(response.error || 'Could not set the cover image');
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
      toast.error('Ingredient name is required');
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
        toast.success('Ingredient added successfully');
      } else {
        toast.error(response.error || 'Failed to add ingredient');
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      toast.error('Tag name is required');
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
        toast.success('Tag added successfully');
      } else {
        toast.error(response.error || 'Failed to add tag');
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
          to={isEditMode && recipe ? `/recipe/${recipe.id}` : '/recipes'}
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {isEditMode ? 'Edit Recipe' : 'Create New Recipe'}
          </h1>
          {isEditMode && recipe && (
            <p className="text-ink-500">Editing: {recipe.title}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <h2 className="mb-5 text-xl font-semibold">Basic Information</h2>
          <div className="space-y-4">
            <Input
              label="Recipe Title"
              {...register('title', {
                required: 'Recipe title is required',
                maxLength: {
                  value: 200,
                  message: 'Title must be no more than 200 characters'
                }
              })}
              error={errors.title?.message}
              placeholder="Enter a descriptive title for your recipe"
            />

            <Textarea
              label="Description"
              {...register('description', {
                maxLength: {
                  value: 1000,
                  message: 'Description must be no more than 1000 characters'
                }
              })}
              error={errors.description?.message}
              placeholder="Brief description of your recipe (optional)"
              rows={3}
            />
          </div>
        </Card>

        {/* Recipe Details */}
        <Card>
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
            <Clock className="w-5 h-5" />
            Recipe Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Prep Time (minutes)"
              type="number"
              min="0"
              {...register('prep_time', {
                min: { value: 0, message: 'Prep time cannot be negative' },
                max: { value: 1440, message: 'Prep time cannot exceed 24 hours' },
                valueAsNumber: true
              })}
              error={errors.prep_time?.message}
              placeholder="0"
            />

            <Input
              label="Cook Time (minutes)"
              type="number"
              min="0"
              {...register('cook_time', {
                min: { value: 0, message: 'Cook time cannot be negative' },
                max: { value: 1440, message: 'Cook time cannot exceed 24 hours' },
                valueAsNumber: true
              })}
              error={errors.cook_time?.message}
              placeholder="0"
            />

            <Input
              label="Servings"
              type="number"
              min="1"
              max="100"
              {...register('servings', {
                required: 'Number of servings is required',
                min: { value: 1, message: 'Must serve at least 1' },
                max: { value: 100, message: 'Cannot exceed 100 servings' },
                valueAsNumber: true
              })}
              error={errors.servings?.message}
              placeholder="4"
            />

            <Select
              label="Serving Unit"
              {...register('serving_unit')}
              options={SERVING_UNITS.map(unit => ({
                value: unit.value,
                label: unit.label
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
              Ingredients
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowIngredientModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Add New Ingredient
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-3">
                <div className="flex-1">
                  <Select
                    label={index === 0 ? "Ingredient" : ""}
                    {...register(`ingredients.${index}.ingredient_id` as const, {
                      required: 'Please select an ingredient',
                      valueAsNumber: true
                    })}
                    options={[
                      { value: '0', label: 'Select ingredient...' },
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
                    label={index === 0 ? "Quantity" : ""}
                    type="number"
                    step="0.1"
                    min="0"
                    {...register(`ingredients.${index}.quantity` as const, {
                      required: 'Quantity is required',
                      min: { value: 0.1, message: 'Must be greater than 0' },
                      max: { value: 10000, message: 'Quantity too large' },
                      valueAsNumber: true
                    })}
                    error={errors.ingredients?.[index]?.quantity?.message}
                    placeholder="0"
                  />
                </div>

                <div className="w-32">
                  <Select
                    label={index === 0 ? "Unit" : ""}
                    {...register(`ingredients.${index}.unit` as const, {
                      required: 'Please select a unit'
                    })}
                    options={[
                      { value: '', label: 'Select unit...' },
                      ...MEASUREMENT_UNITS.reduce((acc, unit) => {
                        const category = acc.find(g => g.label === unit.category);
                        if (category) {
                          category.options = category.options || [];
                          category.options.push({ value: unit.value, label: unit.label });
                        } else {
                          acc.push({
                            label: unit.category,
                            options: [{ value: unit.value, label: unit.label }]
                          });
                        }
                        return acc;
                      }, [] as any[]).flatMap((group, groupIndex) => [
                        { value: `__separator_${groupIndex}__`, label: `--- ${group.label} ---`, disabled: true },
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
            Add Ingredient
          </Button>
        </Card>

        {/* Tags */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <TagIcon className="w-5 h-5" />
              Categories & Tags
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowTagModal(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Add New Tag
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
            Click tags to select or deselect them for your recipe.
          </p>
        </Card>

        {/* Images */}
        <Card>
          <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
            <ImageIcon className="w-5 h-5" />
            Recipe Images
          </h2>
          
          <div className="space-y-4">
            <div>
              <Input
                label="Add Images"
                type="file"
                multiple
                accept="image/*"
                {...register('images')}
                helperText="Select up to 5 images. Supported formats: JPG, PNG, GIF, WebP. Max size: 5MB per image."
              />
            </div>

            {imagePreview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-ink-500">
                  {isEditMode
                    ? 'Ready to upload. Pick one as the cover if it should replace the current one.'
                    : 'Ready to upload. Pick which one should be the cover — otherwise the first is used.'}
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
                        title={coverPreviewIndex === index ? 'This will be the cover' : 'Use as cover'}
                        className={cn(
                          'absolute left-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm transition-all',
                          coverPreviewIndex === index
                            ? 'btn-brand'
                            : 'bg-white/90 text-ink-500 opacity-0 group-hover:opacity-100 hover:text-brand-600 focus-visible:opacity-100'
                        )}
                      >
                        <Star className={cn('h-3.5 w-3.5', coverPreviewIndex === index && 'fill-current')} />
                        {coverPreviewIndex === index ? 'Cover' : 'Set cover'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEditMode && recipe?.images && recipe.images.length > 0 && (
              <div>
                <h3 className="mb-1 font-medium text-ink-900">Current Images</h3>
                <p className="mb-3 text-sm text-ink-500">
                  The cover is the one shown on the recipe list and at the top of the recipe.
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
                          Cover
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetCover(image.id)}
                          title="Use as cover"
                          className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink-500 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:text-brand-600 focus-visible:opacity-100"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Set cover
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
                            toast.success('Image deleted');
                          } catch {
                            toast.error('Failed to delete image');
                          }
                        }}
                        title="Delete image"
                        aria-label="Delete image"
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
          <h2 className="mb-5 text-xl font-semibold">Cooking Instructions</h2>
          <Textarea
            {...register('instructions', {
              required: 'Cooking instructions are required',
              maxLength: {
                value: 10000,
                message: 'Instructions must be no more than 10,000 characters'
              }
            })}
            rows={12}
            error={errors.instructions?.message}
            placeholder="Step-by-step cooking instructions..."
          />
        </Card>

        {/* Submit Buttons */}
        <Card>
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              as={Link}
              to={isEditMode && recipe ? `/recipe/${recipe.id}` : '/recipes'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading 
                ? (isEditMode ? 'Updating...' : 'Creating...') 
                : (isEditMode ? 'Update Recipe' : 'Create Recipe')
              }
            </Button>
          </div>
        </Card>
      </form>

      {/* Modals */}
      <Modal
        isOpen={showIngredientModal}
        onClose={() => setShowIngredientModal(false)}
        title="Add New Ingredient"
      >
        <div className="space-y-4">
          <Input
            label="Ingredient Name"
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
            placeholder="e.g., Olive Oil, Chicken Breast"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowIngredientModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddIngredient}
            >
              Add Ingredient
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        title="Add New Tag"
      >
        <div className="space-y-4">
          <Input
            label="Tag Name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="e.g., Dessert, Quick & Easy"
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Tag Color
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
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddTag}
            >
              Add Tag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RecipeFormPage;