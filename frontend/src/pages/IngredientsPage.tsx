// frontend/src/pages/IngredientsPage.tsx - More compact version
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Plus, Trash2, Search, ExternalLink } from 'lucide-react';
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
      setIngredients(Array.isArray(data) ? data : []);
      setFilteredIngredients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      toast.error('Failed to load ingredients');
      setIngredients([]);
      setFilteredIngredients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddIngredient = async () => {
    if (!newIngredientName.trim()) {
      toast.error('Ingredient name is required');
      return;
    }

    // Check for duplicates
    const exists = ingredients.some(
      ing => ing.name.toLowerCase() === newIngredientName.trim().toLowerCase()
    );
    
    if (exists) {
      toast.error('This ingredient already exists');
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
      console.error('Add ingredient error:', error);
      toast.error(error.error || 'Failed to add ingredient');
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
        const message = `Cannot delete "${name}" because it is used in recipes.`;
        toast.error(message);
      } else {
        toast.error(response.error || 'Failed to delete ingredient');
      }
    } catch (error: any) {
      console.error('Delete ingredient error:', error);
      toast.error(error.error || 'Failed to delete ingredient');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleAddIngredient();
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Leaf className="w-6 h-6 text-green-600" />
            Ingredients
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {filteredIngredients.length} ingredient{filteredIngredients.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {isAuthenticated && (
          <Button
            onClick={() => setShowModal(true)}
            size="sm"
            icon={<Plus className="w-3 h-3" />}
          >
            Add Ingredient
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search ingredients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </Card>

      {/* Ingredients Grid - More Compact */}
      {filteredIngredients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filteredIngredients.map(ingredient => (
            <IngredientCard
              key={ingredient.id}
              ingredient={ingredient}
              isAuthenticated={isAuthenticated}
              onDelete={handleDeleteIngredient}
            />
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
                size="sm"
                icon={<Plus className="w-3 h-3" />}
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
            onKeyDown={handleKeyPress}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddIngredient}
              size="sm"
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

// Compact Ingredient Card Component
interface IngredientCardProps {
  ingredient: Ingredient;
  isAuthenticated: boolean;
  onDelete: (id: number, name: string) => void;
}

const IngredientCard: React.FC<IngredientCardProps> = ({ 
  ingredient, 
  isAuthenticated, 
  onDelete 
}) => {
  return (
    <div className="group bg-white border border-gray-200 rounded-lg p-2 hover:shadow-md transition-all duration-200 hover:border-green-300">
      <div className="flex items-center justify-between gap-1">
        <Link
          to={`/recipes?search=${encodeURIComponent(ingredient.name)}`}
          className="flex-1 text-sm text-gray-900 hover:text-green-600 font-medium transition-colors truncate"
          title={`Find recipes using ${ingredient.name}`}
        >
          {ingredient.name}
        </Link>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            to={`/recipes?search=${encodeURIComponent(ingredient.name)}`}
            className="p-1 text-green-600 hover:text-green-700 transition-colors"
            title={`Find recipes using ${ingredient.name}`}
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
          
          {isAuthenticated && (
            <button
              onClick={() => onDelete(ingredient.id, ingredient.name)}
              className="p-1 text-red-600 hover:text-red-700 transition-colors"
              title="Delete ingredient"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IngredientsPage;