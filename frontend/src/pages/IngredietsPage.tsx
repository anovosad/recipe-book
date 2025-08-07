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



