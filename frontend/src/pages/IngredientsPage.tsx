// frontend/src/pages/IngredientsPage.tsx - More compact version
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Plus, Trash2, Search, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { invalidate } from '@/hooks/useOptimizedData';
import { Ingredient } from '@/types';
import { useTranslation, translate, currentLanguage } from '@/i18n';
import { Button, Input, LoadingSpinner, EmptyState, Modal } from '@/components/ui';
import toast from 'react-hot-toast';

export const IngredientsPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renaming, setRenaming] = useState<Ingredient | null>(null);
  const [renameValue, setRenameValue] = useState('');

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
      // translate() rather than t(): this callback must not depend on a
      // function identity, or the effect below re-fires whenever that
      // identity changes and the page fetches in a loop.
      toast.error(translate(currentLanguage(), 'ingredients.loadFailed'));
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
      toast.error(t('ingredients.nameRequired'));
      return;
    }

    // Check for duplicates
    const exists = ingredients.some(
      ing => ing.name.toLowerCase() === newIngredientName.trim().toLowerCase()
    );
    
    if (exists) {
      toast.error(t('ingredients.exists'));
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
        toast.success(t('ingredients.added'));
      } else {
        toast.error(response.error || t('ingredients.addFailed'));
      }
    } catch (error: any) {
      console.error('Add ingredient error:', error);
      toast.error(error.error || t('ingredients.addFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteIngredient = async (id: number, name: string) => {
    if (!window.confirm(t('ingredients.deleteConfirm', { name }))) {
      return;
    }

    try {
      await apiService.deleteIngredient(id);
      await loadIngredients();
      invalidate('ingredients');
      toast.success(t('ingredients.deleted'));
    } catch (error: any) {
      console.error('Delete ingredient error:', error);
      // A refusal arrives as a 409, so it lands here rather than in a false
      // branch above. The API already names the recipes still using it.
      toast.error(error.error || t('ingredients.deleteFailed'));
    }
  };

  const startRename = (ingredient: Ingredient) => {
    setRenaming(ingredient);
    setRenameValue(ingredient.name);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!renaming || !name) return;
    if (name === renaming.name) {
      setRenaming(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiService.updateIngredient(renaming.id, name);
      if (response.success) {
        await loadIngredients();
        // Recipes hold the id, not the name, so the lists that cache recipes
        // are showing the old word until they refetch.
        invalidate('ingredients', 'recipes');
        setRenaming(null);
        toast.success(t('ingredients.renamed'));
      } else {
        toast.error(response.error || t('ingredients.renameFailed'));
      }
    } catch (error: any) {
      toast.error(error?.error || t('ingredients.renameFailed'));
    } finally {
      setIsSubmitting(false);
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
            {t('ingredients.title')}
          </h1>
          <p className="mt-2 text-ink-500">{t('ingredients.count', { count: filteredIngredients.length })}</p>
        </div>

        {isAuthenticated && (
          <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
            {t('ingredients.add')}
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
            placeholder={t('ingredients.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('ingredients.searchPlaceholder')}
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
              onRename={startRename}
              onDelete={handleDeleteIngredient}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Leaf className="h-7 w-7" />}
          title={t('ingredients.emptyTitle')}
          description={
            searchQuery
              ? t('ingredients.emptySearch', { query: searchQuery })
              : isAuthenticated
              ? t('ingredients.emptyAuthed')
              : t('ingredients.emptyAnon')
          }
          action={
            isAuthenticated && !searchQuery ? (
              <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
                {t('ingredients.addFirst')}
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('ingredients.renameTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('form.newIngredientName')}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitting) handleRename(); }}
            helperText={t('ingredients.renameNote')}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRenaming(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRename}
              size="sm"
              loading={isSubmitting}
              disabled={!renameValue.trim()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Ingredient Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('ingredients.newTitle')}
      >
        <div className="space-y-4">
          <Input
            label={t('form.newIngredientName')}
            value={newIngredientName}
            onChange={(e) => setNewIngredientName(e.target.value)}
            placeholder={t('ingredients.namePlaceholder')}
            onKeyDown={handleKeyPress}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddIngredient}
              size="sm"
              loading={isSubmitting}
              disabled={!newIngredientName.trim()}
            >
              {t('ingredients.add')}
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
  onRename: (ingredient: Ingredient) => void;
  onDelete: (id: number, name: string) => void;
}

const IngredientCard: React.FC<IngredientCardProps> = ({
  ingredient,
  isAuthenticated,
  onRename,
  onDelete
}) => {
  const { t } = useTranslation();
  const findLabel = t('ingredients.findRecipes', { name: ingredient.name });
  const renameLabel = t('ingredients.renameLabel', { name: ingredient.name });
  const deleteLabel = t('ingredients.deleteLabel', { name: ingredient.name });

  return (
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
      title={findLabel}
    >
      {ingredient.name}
    </Link>

    {isAuthenticated && (
      <>
      <button
        onClick={() => onRename(ingredient)}
        className="relative z-10 shrink-0 rounded-full p-1.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-brand-50 hover:text-brand-600 focus-visible:opacity-100"
        title={renameLabel}
        aria-label={renameLabel}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(ingredient.id, ingredient.name)}
        className="relative z-10 shrink-0 rounded-full p-1.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100"
        title={deleteLabel}
        aria-label={deleteLabel}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      </>
      )}
    </div>
  );
};

export default IngredientsPage;