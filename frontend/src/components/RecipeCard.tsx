// frontend/src/components/RecipeCard.tsx - Enhanced recipe card with images and actions
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Clock, 
  Users, 
  Calendar,
  Edit,
  Trash2,
  ChefHat,
  Heart,
} from 'lucide-react';
import { Recipe } from '@/types';
import { formatTime, formatDate, cn } from '@/utils';
import { Button } from '@/components/ui';

interface RecipeCardProps {
  recipe: Recipe;
  isOwner?: boolean;
  showActions?: boolean;
  size?: 'compact' | 'normal' | 'large';
  onEdit?: (recipe: Recipe) => void;
  onDelete?: (recipe: Recipe) => void;
  onFavorite?: (recipe: Recipe) => void;
  isFavorited?: boolean;
  className?: string;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({
  recipe,
  isOwner = false,
  showActions = true,
  size = 'normal',
  onEdit,
  onDelete,
  onFavorite,
  isFavorited = false,
  className
}) => {
  const sizeClasses = {
    compact: 'p-4',
    normal: 'p-6',
    large: 'p-8'
  };

  const imageClasses = {
    compact: 'h-32',
    normal: 'h-48',
    large: 'h-64'
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit?.(recipe);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${recipe.title}"?`)) {
      onDelete?.(recipe);
    }
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFavorite?.(recipe);
  };

  return (
    <div className={cn(
      "bg-white/95 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group",
      sizeClasses[size],
      className
    )}>
      {/* Recipe Image */}
      {recipe.images && recipe.images.length > 0 && (
        <div className={cn(
          "relative rounded-lg overflow-hidden mb-4",
          imageClasses[size]
        )}>
          <Link to={`/recipe/${recipe.id}`}>
            <img
              src={`/uploads/${recipe.images[0].filename}`}
              alt={recipe.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </Link>
          
          {/* Image Overlay with Action Buttons */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute top-2 right-2 flex gap-1">
              {onFavorite && (
                <button
                  onClick={handleFavorite}
                  className={cn(
                    "p-2 rounded-full backdrop-blur-md transition-colors",
                    isFavorited 
                      ? "bg-red-500 text-white" 
                      : "bg-white/20 text-white hover:bg-white/30"
                  )}
                >
                  <Heart className={cn("w-4 h-4", isFavorited && "fill-current")} />
                </button>
              )}
            </div>
          </div>
          
          {/* Image Count Badge */}
          {recipe.images.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
              +{recipe.images.length - 1} more
            </div>
          )}
        </div>
      )}

      {/* Recipe Header */}
      <div className="mb-3">
        <Link 
          to={`/recipe/${recipe.id}`}
          className="block group/title"
        >
          <h3 className={cn(
            "font-bold text-gray-900 group-hover/title:text-red-600 transition-colors line-clamp-2",
            size === 'compact' ? 'text-lg' : size === 'large' ? 'text-2xl' : 'text-xl'
          )}>
            {recipe.title}
          </h3>
        </Link>
        
        {recipe.description && (
          <p className={cn(
            "text-gray-600 mt-2 line-clamp-2",
            size === 'compact' ? 'text-sm' : 'text-base'
          )}>
            {recipe.description}
          </p>
        )}
      </div>

      {/* Recipe Meta */}
      <div className={cn(
        "flex items-center gap-4 mb-4 text-gray-500",
        size === 'compact' ? 'text-xs' : 'text-sm'
      )}>
        {recipe.prep_time > 0 && (
          <div className="flex items-center gap-1" title="Prep time">
            <Clock className="w-4 h-4" />
            <span>{formatTime(recipe.prep_time)}</span>
          </div>
        )}
        
        {recipe.cook_time > 0 && (
          <div className="flex items-center gap-1" title="Cook time">
            <ChefHat className="w-4 h-4" />
            <span>{formatTime(recipe.cook_time)}</span>
          </div>
        )}
        
        {recipe.servings > 0 && (
          <div className="flex items-center gap-1" title="Servings">
            <Users className="w-4 h-4" />
            <span>{recipe.servings} {recipe.serving_unit}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, size === 'compact' ? 2 : 4).map(tag => (
              <Link
                key={tag.id}
                to={`/recipes?tag=${tag.id}`}
                className={cn(
                  "inline-flex items-center px-2 py-1 rounded-full bg-red-100 text-red-800 hover:bg-red-200 transition-colors",
                  size === 'compact' ? 'text-xs' : 'text-sm'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {tag.name}
              </Link>
            ))}
            {recipe.tags.length > (size === 'compact' ? 2 : 4) && (
              <span className={cn(
                "inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600",
                size === 'compact' ? 'text-xs' : 'text-sm'
              )}>
                +{recipe.tags.length - (size === 'compact' ? 2 : 4)} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
        <div className={cn(
          "text-gray-500 flex items-center gap-1",
          size === 'compact' ? 'text-xs' : 'text-sm'
        )}>
          <Calendar className="w-3 h-3" />
          <span>{formatDate(recipe.created_at)}</span>
          <span>•</span>
          <span>by {recipe.author_name}</span>
        </div>

        {/* Action Buttons - ALWAYS VISIBLE for owners */}
        {showActions && isOwner && (onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEdit}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                icon={<Edit className="w-4 h-4" />}
              />
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                icon={<Trash2 className="w-4 h-4" />}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeCard;