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

export default TagsPage;