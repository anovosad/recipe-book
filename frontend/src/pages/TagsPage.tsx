import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag as TagIcon, Plus, Trash2, Search, Pencil } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { invalidate } from '@/hooks/useOptimizedData';
import { Tag } from '@/types';
import { cn } from '@/utils';
import { useTranslation, translate, currentLanguage } from '@/i18n';
import { Button, Input, LoadingSpinner, EmptyState, Modal, TagChip } from '@/components/ui';
import toast from 'react-hot-toast';

// The palette the seeded tags already use, so a new tag lands in the same
// family instead of the flat grey this page used to write for every one of
// them - it sent color: '#6b7280' on create and drew nothing at all.
const TAG_COLORS = [
  '#ff6b6b', '#ff8e53', '#fab005', '#ffd93d',
  '#69db7c', '#4ecdc4', '#a8e6cf', '#74c0fc',
  '#9775fa', '#f06292', '#ff5722', '#9aa1ae'
];

export const TagsPage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameColor, setRenameColor] = useState(TAG_COLORS[0]);

  // Derived during render rather than mirrored into state by an effect. The
  // effect version rendered once with the previous list before the new one
  // arrived, so typing in the box flashed the old results for a frame.
  const filteredTags = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tags;
    return tags.filter(tag => tag.name.toLowerCase().includes(query));
  }, [tags, searchQuery]);

  // Declared above the effect that calls it: reading a `const` from inside its
  // temporal dead zone is what react-hooks/immutability rejects.
  const loadTags = useCallback(async () => {
    try {
      const data = await apiService.getTags();
      setTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
      // translate() rather than t(): this callback must not depend on a
      // function identity, or the effect below re-fires whenever that
      // identity changes and the page fetches in a loop.
      toast.error(translate(currentLanguage(), 'tags.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount: every setState in loadTags happens after an await,
    // so nothing here is the synchronous cascade the rule is aimed at - the
    // React Compiler heuristic just cannot see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTags();
  }, [loadTags]);

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      toast.error(t('tags.nameRequired'));
      return;
    }

    const exists = tags.some(
      tag => tag.name.toLowerCase() === newTagName.trim().toLowerCase()
    );

    if (exists) {
      toast.error(t('tags.exists'));
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
        invalidate('tags');
        setNewTagName('');
        setNewTagColor(TAG_COLORS[0]);
        setShowModal(false);
        toast.success(t('tags.added'));
      } else {
        toast.error(response.error || t('tags.addFailed'));
      }
    } catch {
      toast.error(t('tags.addFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTag = async (id: number, name: string) => {
    if (!window.confirm(t('tags.deleteConfirm', { name }))) {
      return;
    }

    try {
      const response = await apiService.deleteTag(id);
      if (response.success) {
        await loadTags();
        invalidate('tags', 'recipes');
        toast.success(t('tags.deleted'));
      } else {
        toast.error(response.error || t('tags.deleteFailed'));
      }
    } catch (error: any) {
      console.error('Delete tag error:', error);
      // The API explains why a delete was refused (for example the tag is still
      // on other users' recipes); showing a fixed string would hide that.
      toast.error(error.error || t('tags.deleteFailed'));
    }
  };

  const startRename = (tag: Tag) => {
    setRenaming(tag);
    setRenameValue(tag.name);
    setRenameColor(tag.color || TAG_COLORS[0]);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!renaming || !name) return;
    if (name === renaming.name && renameColor === renaming.color) {
      setRenaming(null);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiService.updateTag(renaming.id, name, renameColor);
      if (response.success) {
        await loadTags();
        // Recipes carry the id, so anything caching recipes still shows the old
        // name and colour until it refetches.
        invalidate('tags', 'recipes');
        setRenaming(null);
        toast.success(t('tags.renamed'));
      } else {
        toast.error(response.error || t('tags.renameFailed'));
      }
    } catch (error: any) {
      toast.error(error?.error || t('tags.renameFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleAddTag();
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
            <TagIcon className="h-8 w-8 text-brand-500" />
            {t('tags.title')}
          </h1>
          <p className="mt-2 text-ink-500">{t('tags.count', { count: filteredTags.length })}</p>
        </div>

        {isAuthenticated && (
          <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
            {t('tags.add')}
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
            placeholder={t('tags.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('tags.searchPlaceholder')}
          />
        </div>
      </div>

      {filteredTags.length > 0 ? (
        <div className="auto-grid-tight">
          {filteredTags.map(tag => (
            <TagCard
              key={tag.id}
              tag={tag}
              isAuthenticated={isAuthenticated}
              onRename={startRename}
              onDelete={handleDeleteTag}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title={t('tags.emptyTitle')}
          description={
            searchQuery
              ? t('tags.emptySearch', { query: searchQuery })
              : isAuthenticated
              ? t('tags.emptyAuthed')
              : t('tags.emptyAnon')
          }
          action={
            isAuthenticated && !searchQuery ? (
              <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
                {t('tags.addFirst')}
              </Button>
            ) : null
          }
        />
      )}

      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t('tags.renameTitle')}
      >
        <div className="space-y-5">
          <Input
            label={t('form.newTagName')}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitting) handleRename(); }}
            helperText={t('tags.renameNote')}
            autoFocus
          />

          <div className="space-y-2">
            <span className="block text-sm font-medium text-ink-700">{t('form.tagColor')}</span>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setRenameColor(color)}
                  aria-label={t('tags.useColour', { colour: color })}
                  aria-pressed={color === renameColor}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform',
                    color === renameColor
                      ? 'ring-2 ring-ink-900/40 ring-offset-2 scale-110'
                      : 'hover:scale-110'
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>

          {renameValue.trim() && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              {t('form.preview')}
              <TagChip tag={{ name: renameValue.trim(), color: renameColor }} dot />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('tags.newTitle')}>
        <div className="space-y-5">
          <Input
            label={t('form.newTagName')}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder={t('tags.namePlaceholder')}
            onKeyDown={handleKeyPress}
            autoFocus
          />

          <div className="space-y-2">
            <span className="block text-sm font-medium text-ink-700">{t('form.tagColor')}</span>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewTagColor(color)}
                  aria-label={t('tags.useColour', { colour: color })}
                  aria-pressed={color === newTagColor}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform',
                    color === newTagColor
                      ? 'ring-2 ring-ink-900/40 ring-offset-2 scale-110'
                      : 'hover:scale-110'
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>

          {newTagName.trim() && (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              {t('form.preview')}
              <TagChip tag={{ name: newTagName.trim(), color: newTagColor }} dot />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleAddTag}
              size="sm"
              loading={isSubmitting}
              disabled={!newTagName.trim()}
            >
              {t('tags.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface TagCardProps {
  tag: Tag;
  isAuthenticated: boolean;
  onRename: (tag: Tag) => void;
  onDelete: (id: number, name: string) => void;
}

const TagCard: React.FC<TagCardProps> = ({ tag, isAuthenticated, onRename, onDelete }) => {
  const { t } = useTranslation();
  const viewLabel = t('tags.viewRecipes', { name: tag.name });
  const renameLabel = t('tags.renameLabel', { name: tag.name });
  const deleteLabel = t('tags.deleteLabel', { name: tag.name });

  return (
  // `relative` here plus `after:absolute after:inset-0` on the link is the
  // stretched-link pattern: the anchor's own pseudo-element covers the whole
  // card, so the entire tile is the hit target and its hover state follows.
  // The delete button is lifted above it with `relative z-10` so it keeps its
  // own click. Nothing about how any of this looks changes.
  <div
    className="surface surface-interactive group relative flex items-center gap-3 p-3"
    style={{ ['--chip' as string]: tag.color || '#9aa1ae' }}
  >
    <span className="swatch" aria-hidden="true" />

    <Link
      to={`/?tag=${tag.id}`}
      className="min-w-0 flex-1 truncate font-medium text-ink-900 transition-colors hover:text-brand-600 after:absolute after:inset-0"
      title={viewLabel}
    >
      {tag.name}
    </Link>

    {isAuthenticated && (
      <>
      <button
        onClick={() => onRename(tag)}
        className="relative z-10 shrink-0 rounded-full p-1.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-brand-50 hover:text-brand-600 focus-visible:opacity-100"
        title={renameLabel}
        aria-label={renameLabel}
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(tag.id, tag.name)}
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

export default TagsPage;
