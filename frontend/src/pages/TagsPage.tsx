// TagsPage.tsx - Compact version without colors
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Tag as TagIcon, Plus, Trash2, Search, ExternalLink } from 'lucide-react';
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

    // Check for duplicates
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
        color: '#6b7280' // Default gray color to maintain backend compatibility
      });
      
      if (response.success) {
        await loadTags();
        setNewTagName('');
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleAddTag();
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
            <TagIcon className="w-6 h-6 text-blue-600" />
            Tags
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {filteredTags.length} tag{filteredTags.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {isAuthenticated && (
          <Button
            onClick={() => setShowModal(true)}
            size="sm"
            icon={<Plus className="w-3 h-3" />}
          >
            Add Tag
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </Card>

      {/* Tags Grid - More Compact */}
      {filteredTags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
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
                size="sm"
                icon={<Plus className="w-3 h-3" />}
              >
                Add Your First Tag
              </Button>
            ) : null
          }
        />
      )}

      {/* Add Tag Modal - Simplified without color picker */}
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
            onKeyDown={handleKeyPress}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowModal(false)}
            >
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

// Compact Tag Card Component without colors
interface TagCardProps {
  tag: Tag;
  isAuthenticated: boolean;
  onDelete: (id: number, name: string) => void;
}

const TagCard: React.FC<TagCardProps> = ({ tag, isAuthenticated, onDelete }) => {
  return (
    <div className="group bg-white border border-gray-200 rounded-lg p-2 hover:shadow-md transition-all duration-200 hover:border-blue-300">
      <div className="flex items-center justify-between gap-1">
        <Link
          to={`/recipes?tag=${tag.id}`}
          className="flex-1 text-sm text-gray-900 hover:text-blue-600 font-medium transition-colors truncate"
          title={`View all ${tag.name} recipes`}
        >
          {tag.name}
        </Link>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            to={`/recipes?tag=${tag.id}`}
            className="p-1 text-blue-600 hover:text-blue-700 transition-colors"
            title={`View all ${tag.name} recipes`}
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
          
          {isAuthenticated && (
            <button
              onClick={() => onDelete(tag.id, tag.name)}
              className="p-1 text-red-600 hover:text-red-700 transition-colors"
              title="Delete tag"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagsPage;