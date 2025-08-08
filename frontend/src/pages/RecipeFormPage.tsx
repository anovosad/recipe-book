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
  Users,
  ChefHat
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { Recipe, Ingredient, Tag, RecipeForm, SERVING_UNITS, MEASUREMENT_UNITS } from '@/types';
import { validateImageFile, getErrorMessage } from '@/utils';
import { Card, Button, Input, Textarea, Select, LoadingSpinner, Modal } from '@/components/ui';
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

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'ingredients'
  });

  const watchedImages = watch('images');
  const currentFormValues = watch(); // Debug: watch all form values

  // Debug: Log current form values when they change
  useEffect(() => {
    if (isEditMode && recipe) {
      console.log('Current form values:', currentFormValues);
    }
  }, [currentFormValues, isEditMode, recipe]);

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
        
        const [ingredientsData, tagsData, recipeData] = await Promise.all([
          apiService.getIngredients(),
          apiService.getTags(),
          isEditMode && id ? apiService.getRecipe(Number(id)) : Promise.resolve(null)
        ]);

        setIngredients(ingredientsData);
        setTags(tagsData);

        if (recipeData) {
          setRecipe(recipeData);
        }
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

  const populateForm = React.useCallback((recipeData: Recipe) => {
    console.log('Populating form with recipe data:', recipeData);
    console.log('Available ingredients:', ingredients.length);
    console.log('Available tags:', tags.length);

    // Set basic fields using setValue (more reliable for individual fields)
    setValue('title', recipeData.title || '');
    setValue('description', recipeData.description || '');
    setValue('instructions', recipeData.instructions || '');
    setValue('prep_time', recipeData.prep_time || 0);
    setValue('cook_time', recipeData.cook_time || 0);
    setValue('servings', recipeData.servings || 4);
    setValue('serving_unit', recipeData.serving_unit || 'people');

    // Handle ingredients using replace method for field array
    if (recipeData.ingredients && recipeData.ingredients.length > 0) {
      const ingredientsData = recipeData.ingredients.map(ing => ({
        ingredient_id: ing.ingredient_id || 0,
        quantity: ing.quantity || 0,
        unit: ing.unit || ''
      }));
      console.log('Setting ingredients:', ingredientsData);
      replace(ingredientsData);
    } else {
      // Ensure at least one ingredient field
      replace([{ ingredient_id: 0, quantity: 0, unit: '' }]);
    }

    // Handle tags - set both form value and UI state
    if (recipeData.tags && recipeData.tags.length > 0) {
      const tagIds = recipeData.tags.map(tag => tag.id);
      setValue('tags', tagIds);
      setSelectedTags(new Set(tagIds));
      console.log('Setting tags:', tagIds);
    } else {
      setValue('tags', []);
      setSelectedTags(new Set());
    }

    console.log('Form population complete');
  }, [setValue, replace, ingredients.length, tags.length]);


  // Separate effect to populate form once all dependencies are loaded
  useEffect(() => {
    if (recipe && !isLoadingData) {
      console.log('All data loaded, populating form...');
      console.log('Recipe to populate:', recipe);
      // Small delay to ensure form is ready
      setTimeout(() => {
        populateForm(recipe);
      }, 50);
    }
  }, [recipe, isLoadingData, populateForm]);

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
      
      // Cleanup
      return () => {
        previews.forEach(url => URL.revokeObjectURL(url));
      };
    } else {
      setImagePreview([]);
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
          } catch (error) {
            console.warn('Failed to upload images:', error);
            toast.warning('Recipe updated but some images failed to upload');
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
        
        if (!createResponse.success || !createResponse.data?.recipe_id) {
          throw new Error(createResponse.error || 'Failed to create recipe');
        }
        
        recipeId = createResponse.data.recipe_id;
        
        // Upload images if provided
        if (data.images && data.images.length > 0) {
          try {
            const imageResponse = await apiService.uploadRecipeImages(recipeId, Array.from(data.images));
            uploadedImages = imageResponse.data?.images?.length || 0;
          } catch (error) {
            console.warn('Failed to upload images:', error);
            toast.warning('Recipe created but some images failed to upload');
          }
        }
        
        let message = 'Recipe created successfully!';
        if (uploadedImages > 0) {
          message += ` ${uploadedImages} image(s) uploaded.`;
        }
        toast.success(message);
      }

      navigate(`/recipe/${recipeId}`);
    } catch (error: any) {
      console.error('Recipe form error:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoadingData) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? 'Edit Recipe' : 'Create New Recipe'}
          </h1>
          {isEditMode && recipe && (
            <p className="text-gray-600">Editing: {recipe.title}</p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Basic Information</h2>
          {/* Debug info */}
          {process.env.NODE_ENV === 'development' && isEditMode && (
            <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
              <div>Title: {watch('title')}</div>
              <div>Description: {watch('description')}</div>
              <div>Instructions: {watch('instructions') ? `${watch('instructions').substring(0, 50)}...` : 'empty'}</div>
            </div>
          )}
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
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
                  {/* Debug info */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-gray-500 mt-1">
                      Value: {watch(`ingredients.${index}.ingredient_id`)}
                    </div>
                  )}
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
                      }, [] as any[]).flatMap(group => [
                        { value: '', label: `--- ${group.label} ---`, disabled: true },
                        ...group.options
                      ])
                    ]}
                    error={errors.ingredients?.[index]?.unit?.message}
                  />
                  {/* Debug info */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-gray-500 mt-1">
                      Unit: {watch(`ingredients.${index}.unit`)}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  icon={<Minus className="w-4 h-4" />}
                >
                </Button>
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
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
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
              <button
                key={tag.id}
                type="button"
                onClick={() => handleTagToggle(tag.id)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  selectedTags.has(tag.id)
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-red-300 hover:text-red-600'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
          
          <p className="text-sm text-gray-500 mt-2">
            Click tags to select/deselect them for your recipe.
          </p>
        </Card>

        {/* Images */}
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {imagePreview.map((preview, index) => (
                  <div key={index} className="relative">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg shadow-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {isEditMode && recipe?.images && recipe.images.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Current Images</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {recipe.images.map(image => (
                    <div key={image.id} className="relative group">
                      <img
                        src={`/uploads/${image.filename}`}
                        alt={image.caption || recipe.title}
                        className="w-full h-32 object-cover rounded-lg shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiService.deleteImage(image.id);
                            // Refresh recipe data
                            const updatedRecipe = await apiService.getRecipe(recipe.id);
                            setRecipe(updatedRecipe);
                            toast.success('Image deleted');
                          } catch (error) {
                            toast.error('Failed to delete image');
                          }
                        }}
                        className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Cooking Instructions</h2>
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
            onKeyDown={handleKeyPress}
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
            onKeyDown={handleKeyPress}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tag Color
            </label>
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
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