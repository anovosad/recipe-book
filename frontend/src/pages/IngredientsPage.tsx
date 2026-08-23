// frontend/src/pages/IngredientsPage.tsx - More compact version
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Plus, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { invalidate } from '@/hooks/useOptimizedData';
import { Ingredient } from '@/types';
import { Button, Input, LoadingSpinner, EmptyState, Modal } from '@/components/ui';
import toast from 'react-hot-toast';

export const IngredientsPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived during render rather than mirrored into state by an effect. The
  // effect version rendered once with the previous list before the new one
  // arrived, so typing in the box flashed the old results for a frame.
  const filteredIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return ingredients;
    return ingredients.filter(ingredient =>
      ingredient.name.toLowerCase().includes(query)
    );
  }, [ingredients, searchQuery]);

  // Declared above the effect that calls it: reading a `const` from inside its
  // temporal dead zone is what react-hooks/immutability rejects.
  const loadIngredients = useCallback(async () => {
    try {
      const data = await apiService.getIngredients();
      setIngredients(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load ingredients:', error);
      toast.error('Failed to load ingredients');
      setIngredients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount: every setState in loadIngredients happens after an await,
    // so nothing here is the synchronous cascade the rule is aimed at - the
    // React Compiler heuristic just cannot see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadIngredients();
  }, [loadIngredients]);

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
        invalidate('ingredients');
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
      await loadIngredients();
      invalidate('ingredients');
      toast.success(response.message || 'Ingredient deleted successfully');
    } catch (error: any) {
      console.error('Delete ingredient error:', error);
      // A refusal arrives as a 409, so it lands here rather than in a false
      // branch above. The API already names the recipes still using it.
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
      <div className="flex min-h-[24rem] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight lg:text-4xl">
            <Leaf className="h-8 w-8 text-emerald-500" />
            Ingredients
          </h1>
          <p className="mt-2 text-ink-500">
            {filteredIngredients.length} ingredient{filteredIngredients.length !== 1 ? 's' : ''} in the pantry
          </p>
        </div>

        {isAuthenticated && (
          <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
            Add Ingredient
          </Button>
        )}
      </header>

      {/* Search */}
      <div className="surface p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            type="search"
            className="field pl-11"
            placeholder="Search ingredients…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search ingredients"
          />
        </div>
      </div>

      {filteredIngredients.length > 0 ? (
        <div className="auto-grid-tight">
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
          icon={<Leaf className="h-7 w-7" />}
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
              <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
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

interface IngredientCardProps {
  ingredient: Ingredient;
  isAuthenticated: boolean;
  onDelete: (id: number, name: string) => void;
}

const IngredientCard: React.FC<IngredientCardProps> = ({
  ingredient,
  isAuthenticated,
  onDelete
}) => (
  // Stretched link, same as the tag tiles: the anchor's pseudo-element covers
  // the card so the whole tile is clickable, and the delete button sits above
  // it on z-10 to keep its own.
  <div className="surface surface-interactive group relative flex items-center gap-3 p-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
      <Leaf className="h-4 w-4" />
    </span>

    {/* One link, not two. The row already navigates; the extra arrow next to
        it went to exactly the same place. */}
    <Link
      to={`/?ingredient=${ingredient.id}`}
      className="min-w-0 flex-1 truncate font-medium text-ink-900 transition-colors hover:text-emerald-600 after:absolute after:inset-0"
      title={`Find recipes using ${ingredient.name}`}
    >
      {ingredient.name}
    </Link>

    {isAuthenticated && (
      <button
        onClick={() => onDelete(ingredient.id, ingredient.name)}
        className="relative z-10 shrink-0 rounded-full p-1.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100"
        title="Delete ingredient"
        aria-label={`Delete ingredient ${ingredient.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  </div>
);

export default IngredientsPage;