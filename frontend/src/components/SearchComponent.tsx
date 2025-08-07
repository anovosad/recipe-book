// frontend/src/components/SearchComponent.tsx - Advanced search with filters
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  X, 
  Clock, 
  Users, 
  Tag as TagIcon,
  Utensils,
  ChevronDown
} from 'lucide-react';
import { Recipe, Tag } from '@/types';
import { Button, Input, Card } from '@/components/ui';
import { debounce, cn } from '@/utils';
import apiService from '@/services/api';

interface SearchComponentProps {
  onResults?: (results: Recipe[]) => void;
  placeholder?: string;
  className?: string;
  showFilters?: boolean;
  autoFocus?: boolean;
}

export const SearchComponent: React.FC<SearchComponentProps> = ({
  onResults,
  placeholder = "Search recipes, ingredients, or tags...",
  className,
  showFilters = true,
  autoFocus = false
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('search') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [maxPrepTime, setMaxPrepTime] = useState<number | ''>('');
  const [maxCookTime, setMaxCookTime] = useState<number | ''>('');
  const [minServings, setMinServings] = useState<number | ''>('');
  const [maxServings, setMaxServings] = useState<number | ''>('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Load tags for filters
  useEffect(() => {
    const loadTags = async () => {
      try {
        const tagsData = await apiService.getTags();
        setTags(tagsData);
      } catch (error) {
        console.error('Failed to load tags:', error);
      }
    };
    
    if (showFilters) {
      loadTags();
    }
  }, [showFilters]);

  // Initialize from URL params
  useEffect(() => {
    const tag = searchParams.get('tag');
    if (tag) {
      setSelectedTags([parseInt(tag)]);
    }
  }, [searchParams]);

  // Auto-focus input
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Debounced search function
  const debouncedSearch = debounce(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onResults?.([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.searchRecipes(searchQuery.trim());
      if (response.success) {
        onResults?.(response.results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, 300);

  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  // Handle search submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  // Perform search with all filters
  const performSearch = () => {
    const params = new URLSearchParams();
    
    if (query.trim()) {
      params.set('search', query.trim());
    }
    
    if (selectedTags.length === 1) {
      params.set('tag', selectedTags[0].toString());
    }
    
    // For now, we'll navigate to the recipes page with search params
    // In a more advanced implementation, you'd send these filters to the API
    navigate(`/recipes?${params.toString()}`);
  };

  // Clear all filters
  const clearFilters = () => {
    setQuery('');
    setSelectedTags([]);
    setMaxPrepTime('');
    setMaxCookTime('');
    setMinServings('');
    setMaxServings('');
    setSearchParams({});
    onResults?.([]);
  };

  // Toggle tag selection
  const toggleTag = (tagId: number) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const hasActiveFilters = selectedTags.length > 0 || maxPrepTime || maxCookTime || minServings || maxServings;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Search Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={handleSearchChange}
            className="pl-10 pr-20"
          />
          
          {/* Search Actions */}
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
            {query && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  onResults?.([]);
                }}
                className="p-1 h-6 w-6"
                icon={<X className="w-3 h-3" />}
              />
            )}
            
            {showFilters && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={cn(
                  "p-1 h-6 w-6",
                  (showAdvanced || hasActiveFilters) && "text-red-600"
                )}
                icon={<Filter className="w-3 h-3" />}
              />
            )}
          </div>
        </div>
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full"></div>
          </div>
        )}
      </form>

      {/* Advanced Filters */}
      {showFilters && showAdvanced && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Advanced Filters
            </h3>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                className="text-red-600 hover:text-red-700"
                icon={<X className="w-3 h-3" />}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Tags Filter */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <TagIcon className="w-4 h-4" />
                Categories
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      "px-3 py-1 text-sm rounded-full border transition-colors",
                      selectedTags.includes(tag.id)
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-gray-700 border-gray-300 hover:border-red-300 hover:text-red-600"
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time and Servings Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Max Prep Time (min)
              </label>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={maxPrepTime}
                onChange={(e) => setMaxPrepTime(e.target.value ? parseInt(e.target.value) : '')}
                min="0"
                max="1440"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Utensils className="w-4 h-4" />
                Max Cook Time (min)
              </label>
              <Input
                type="number"
                placeholder="e.g. 60"
                value={maxCookTime}
                onChange={(e) => setMaxCookTime(e.target.value ? parseInt(e.target.value) : '')}
                min="0"
                max="1440"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Min Servings
              </label>
              <Input
                type="number"
                placeholder="e.g. 2"
                value={minServings}
                onChange={(e) => setMinServings(e.target.value ? parseInt(e.target.value) : '')}
                min="1"
                max="100"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Max Servings
              </label>
              <Input
                type="number"
                placeholder="e.g. 8"
                value={maxServings}
                onChange={(e) => setMaxServings(e.target.value ? parseInt(e.target.value) : '')}
                min="1"
                max="100"
              />
            </div>
          </div>

          {/* Apply Filters Button */}
          <div className="flex justify-end">
            <Button onClick={performSearch}>
              Apply Filters
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SearchComponent;