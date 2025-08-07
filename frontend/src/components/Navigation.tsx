// IngredientsPage.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Plus, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { Ingredient } from '@/types';
import { Card, Button, Input, LoadingSpinner, EmptyState, Modal } from '@/components/ui';
import toast from 'react-hot-toast';

export const IngredientsPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [filteredIngredients, setFilteredIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = ingredients.filter(ingredient =>
        ingredient.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredIngredients(filtered);
    } else {
      setFilteredIngredients(ingredients);
    }
  }, [ingredients, searchQuery]);

  const loadIngredients = async () => {
    try {
      const data = await apiService.getIngredients();
      setIngredients(data);
      setFilteredIngredients(data);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      toast.error('Failed to load ingredients');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddIngredient = async () => {
    if (!newIngredientName.trim()) {
      toast.error('Ingredient name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiService.createIngredient({ name: newIngredientName.trim() });
      if (response.success) {
        await loadIngredients();
        setNewIngredientName('');
        setShowModal(false);
        toast.success(response.message || 'Ingredient added successfully');
      } else {
        toast.error(response.error || 'Failed to add ingredient');
      }
    } catch (error: any) {
      toast.error('Failed to add ingredient');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteIngredient = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      const response = await apiService.deleteIngredient(id);
      if (response.success) {
        await loadIngredients();
        toast.success(response.message || 'Ingredient deleted successfully');
      } else if (response.usedInRecipes) {
        toast.error(`Cannot delete "${name}" because it is used in recipes.`);
      } else {
        toast.error(response.error || 'Failed to delete ingredient');
      }
    } catch (error: any) {
      toast.error('Failed to delete ingredient');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Leaf className="w-8 h-8 text-green-600" />
            Ingredients
          </h1>
          <p className="text-gray-600 mt-1">
            {filteredIngredients.length} ingredient{filteredIngredients.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {isAuthenticated && (
          <Button
            onClick={() => setShowModal(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Ingredient
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search ingredients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Ingredients Grid */}
      {filteredIngredients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredIngredients.map(ingredient => (
            <Card key={ingredient.id} className="group hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <Link
                  to={`/recipes?search=${encodeURIComponent(ingredient.name)}`}
                  className="flex-1 text-gray-900 hover:text-green-600 font-medium transition-colors"
                  title={`Find recipes using ${ingredient.name}`}
                >
                  {ingredient.name}
                </Link>
                {isAuthenticated && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteIngredient(ingredient.id, ingredient.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700"
                    icon={<Trash2 className="w-4 h-4" />}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Leaf className="w-12 h-12" />}
          title="No ingredients found"
          description={
            searchQuery
              ? `No ingredients match "${searchQuery}". Try a different search term.`
              : isAuthenticated
              ? "Add some ingredients to get started!"
              : "Please log in to manage ingredients."
          }
          action={
            isAuthenticated && !searchQuery ? (
              <Button
                onClick={() => setShowModal(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                Add Your First Ingredient
              </Button>
            ) : null
          }
        />
      )}

      {/* Add Ingredient Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add New Ingredient"
      >
        <div className="space-y-4">
          <Input
            label="Ingredient Name"
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
            placeholder="e.g., Olive Oil, Chicken Breast, Basil"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) {
                handleAddIngredient();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddIngredient}
              loading={isSubmitting}
              disabled={!newIngredientName.trim()}
            >
              Add Ingredient
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// TagsPage.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Tag as TagIcon, Plus, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { Tag } from '@/types';
import { Card, Button, Input, LoadingSpinner, EmptyState, Modal } from '@/components/ui';
import toast from 'react-hot-toast';

export const TagsPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#ff6b6b');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = tags.filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredTags(filtered);
    } else {
      setFilteredTags(tags);
    }
  }, [tags, searchQuery]);

  const loadTags = async () => {
    try {
      const data = await apiService.getTags();
      setTags(data);
      setFilteredTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
      toast.error('Failed to load tags');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      toast.error('Tag name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiService.createTag({
        name: newTagName.trim(),
        color: newTagColor
      });
      
      if (response.success) {
        await loadTags();
        setNewTagName('');
        setNewTagColor('#ff6b6b');
        setShowModal(false);
        toast.success(response.message || 'Tag added successfully');
      } else {
        toast.error(response.error || 'Failed to add tag');
      }
    } catch (error: any) {
      toast.error('Failed to add tag');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTag = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will remove it from all recipes.`)) {
      return;
    }

    try {
      const response = await apiService.deleteTag(id);
      if (response.success) {
        await loadTags();
        toast.success(response.message || 'Tag deleted successfully');
      } else {
        toast.error(response.error || 'Failed to delete tag');
      }
    } catch (error: any) {
      toast.error('Failed to delete tag');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <TagIcon className="w-8 h-8 text-blue-600" />
            Tags
          </h1>
          <p className="text-gray-600 mt-1">
            {filteredTags.length} tag{filteredTags.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {isAuthenticated && (
          <Button
            onClick={() => setShowModal(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Tag
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Tags Grid */}
      {filteredTags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTags.map(tag => (
            <Card key={tag.id} className="group hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <Link
                  to={`/recipes?tag=${tag.id}`}
                  className="flex-1 flex items-center gap-2 text-gray-900 hover:text-blue-600 transition-colors"
                  title={`View all ${tag.name} recipes`}
                >
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium">{tag.name}</span>
                </Link>
                {isAuthenticated && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteTag(tag.id, tag.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700"
                    icon={<Trash2 className="w-4 h-4" />}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagIcon className="w-12 h-12" />}
          title="No tags found"
          description={
            searchQuery
              ? `No tags match "${searchQuery}". Try a different search term.`
              : isAuthenticated
              ? "Add some tags to organize your recipes!"
              : "Please log in to manage tags."
          }
          action={
            isAuthenticated && !searchQuery ? (
              <Button
                onClick={() => setShowModal(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                Add Your First Tag
              </Button>
            ) : null
          }
        />
      )}

      {/* Add Tag Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add New Tag"
      >
        <div className="space-y-4">
          <Input
            label="Tag Name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="e.g., Dessert, Quick & Easy, Vegetarian"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tag Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <span className="text-sm text-gray-600">
                Choose a color for this tag
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddTag}
              loading={isSubmitting}
              disabled={!newTagName.trim()}
            >
              Add Tag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// HomePage.tsx
import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Utensils, ChefHat, Heart, Users, BookOpen, Star } from 'lucide-react';
import { Card, Button } from '@/components/ui';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to recipes page immediately
    navigate('/recipes', { replace: true });
  }, [navigate]);

  // This component won't actually render since we redirect,
  // but keeping it for completeness
  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center py-12">
        <div className="mb-6">
          <Utensils className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-4">
            Recipe Book
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Discover, save, and share your favorite recipes. Create your culinary collection and never lose a great recipe again.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            as={Link}
            to="/recipes"
            size="lg"
            icon={<BookOpen className="w-5 h-5" />}
          >
            Browse Recipes
          </Button>
          <Button
            as={Link}
            to="/register"
            variant="secondary"
            size="lg"
            icon={<Users className="w-5 h-5" />}
          >
            Join Community
          </Button>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="text-center">
          <ChefHat className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Create & Share
          </h3>
          <p className="text-gray-600">
            Add your own recipes with photos, ingredients, and step-by-step instructions.
          </p>
        </Card>

        <Card className="text-center">
          <Heart className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Organize & Tag
          </h3>
          <p className="text-gray-600">
            Use tags and categories to organize your recipes and find them easily.
          </p>
        </Card>

        <Card className="text-center">
          <Star className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Discover & Cook
          </h3>
          <p className="text-gray-600">
            Search through recipes, scale ingredients, and cook with confidence.
          </p>
        </Card>
      </div>
    </div>
  );
};

// NotFoundPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { Card, Button } from '@/components/ui';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="text-center max-w-md">
        <div className="text-8xl font-bold text-gray-300 mb-4">404</div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Recipe Not Found
        </h1>
        
        <p className="text-gray-600 mb-8">
          Oops! The page you're looking for seems to have been eaten. 
          Maybe it was just too delicious to resist!
        </p>

        <div className="space-y-3">
          <Button
            as={Link}
            to="/recipes"
            className="w-full"
            icon={<Home className="w-4 h-4" />}
          >
            Go to Recipes
          </Button>
          
          <Button
            onClick={() => window.history.back()}
            variant="secondary"
            className="w-full"
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Go Back
          </Button>
          
          <Button
            as={Link}
            to="/recipes"
            variant="ghost"
            className="w-full"
            icon={<Search className="w-4 h-4" />}
          >
            Search Recipes
          </Button>
        </div>
      </Card>
    </div>
  );
};