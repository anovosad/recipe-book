import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag as TagIcon, Plus, Trash2, Search } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { invalidate } from '@/hooks/useOptimizedData';
import { Tag } from '@/types';
import { cn } from '@/utils';
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
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      toast.error('Failed to load tags');
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
      toast.error('Tag name is required');
      return;
    }

    const exists = tags.some(
      tag => tag.name.toLowerCase() === newTagName.trim().toLowerCase()
    );

    if (exists) {
      toast.error('This tag already exists');
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
        toast.success(response.message || 'Tag added successfully');
      } else {
        toast.error(response.error || 'Failed to add tag');
      }
    } catch {
      toast.error('Failed to add tag');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTag = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will remove it from your recipes.`)) {
      return;
    }

    try {
      const response = await apiService.deleteTag(id);
      if (response.success) {
        await loadTags();
        invalidate('tags', 'recipes');
        toast.success(response.message || 'Tag deleted successfully');
      } else {
        toast.error(response.error || 'Failed to delete tag');
      }
    } catch (error: any) {
      console.error('Delete tag error:', error);
      // The API explains why a delete was refused (for example the tag is still
      // on other users' recipes); showing a fixed string would hide that.
      toast.error(error.error || 'Failed to delete tag');
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
            Tags
          </h1>
          <p className="mt-2 text-ink-500">
            {filteredTags.length} tag{filteredTags.length !== 1 ? 's' : ''} for sorting the collection
          </p>
        </div>

        {isAuthenticated && (
          <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
            Add Tag
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
            placeholder="Search tags…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search tags"
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
              onDelete={handleDeleteTag}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<TagIcon className="h-7 w-7" />}
          title="No tags found"
          description={
            searchQuery
              ? `No tags match "${searchQuery}". Try a different search term.`
              : isAuthenticated
              ? 'Add some tags to organize your recipes!'
              : 'Please log in to manage tags.'
          }
          action={
            isAuthenticated && !searchQuery ? (
              <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
                Add Your First Tag
              </Button>
            ) : null
          }
        />
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Tag">
        <div className="space-y-5">
          <Input
            label="Tag Name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="e.g., Dessert, Quick & Easy, Vegetarian"
            onKeyDown={handleKeyPress}
            autoFocus
          />

          <div className="space-y-2">
            <span className="block text-sm font-medium text-ink-700">Colour</span>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewTagColor(color)}
                  aria-label={`Use colour ${color}`}
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
              Preview
              <TagChip tag={{ name: newTagName.trim(), color: newTagColor }} dot />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddTag}
              size="sm"
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

interface TagCardProps {
  tag: Tag;
  isAuthenticated: boolean;
  onDelete: (id: number, name: string) => void;
}

const TagCard: React.FC<TagCardProps> = ({ tag, isAuthenticated, onDelete }) => (
  <div
    className="surface surface-interactive group flex items-center gap-3 p-3"
    style={{ ['--chip' as string]: tag.color || '#9aa1ae' }}
  >
    <span className="swatch" aria-hidden="true" />

    <Link
      to={`/recipes?tag=${tag.id}`}
      className="min-w-0 flex-1 truncate font-medium text-ink-900 transition-colors hover:text-brand-600"
      title={`View all ${tag.name} recipes`}
    >
      {tag.name}
    </Link>

    {isAuthenticated && (
      <button
        onClick={() => onDelete(tag.id, tag.name)}
        className="shrink-0 rounded-full p-1.5 text-ink-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100"
        title="Delete tag"
        aria-label={`Delete tag ${tag.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  </div>
);

export default TagsPage;
