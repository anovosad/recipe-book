import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, Edit, Trash2, ChefHat, Flame } from 'lucide-react';
import { Recipe } from '@/types';
import { cn } from '@/utils';
import { useTranslation, useFormatters } from '@/i18n';
import { Button, TagChip } from '@/components/ui';

interface RecipeCardProps {
  recipe: Recipe;
  // Whether to offer the edit and delete controls. Not "is this yours": the
  // collection is shared and anyone signed in may change any of it, so this is
  // simply whether somebody is signed in.
  canEdit?: boolean;
  onEdit?: (recipe: Recipe) => void;
  onDelete?: (recipe: Recipe) => void;
  className?: string;
}

const MAX_TAGS = 3;

export const RecipeCard: React.FC<RecipeCardProps> = React.memo(({
  recipe,
  canEdit = false,
  onEdit,
  onDelete,
  className
}) => {
  const { t } = useTranslation();
  const { formatDuration, formatServings } = useFormatters();
  const cover = recipe.images?.[0];
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  const shownTags = recipe.tags?.slice(0, MAX_TAGS) ?? [];
  const hiddenTagCount = (recipe.tags?.length ?? 0) - shownTags.length;

  return (
    // h-full plus a column layout, so every card in a row is the same height
    // and the footers line up. The old card left the footer's `mt-auto` with no
    // flex parent to push against, so it did nothing.
    <article className={cn('surface surface-interactive group flex h-full flex-col overflow-hidden', className)}>
      <Link
        to={`/recipe/${recipe.id}`}
        className="relative block aspect-[16/10] overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
      >
        {cover ? (
          <img
            src={`/uploads/${cover.filename}`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          // A recipe with no photo still gets a coloured panel, so a mixed grid
          // does not fall apart into cards of two different shapes.
          <div className="flex h-full w-full items-center justify-center bg-linear-135 from-brand-100 via-brand-50 to-amber-50">
            <ChefHat className="h-10 w-10 text-brand-300" />
          </div>
        )}

        {recipe.images && recipe.images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink-900/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {t('recipes.morePhotos', { count: recipe.images.length - 1 })}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-lg leading-snug font-semibold">
            <Link
              to={`/recipe/${recipe.id}`}
              className="line-clamp-2 text-ink-900 transition-colors hover:text-brand-600"
            >
              {recipe.title}
            </Link>
          </h3>
          {recipe.description && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-500">
              {recipe.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
          {totalTime > 0 && (
            <span className="flex items-center gap-1.5" title={t('recipe.prepPlusCook')}>
              <Clock className="h-4 w-4 text-brand-400" />
              {formatDuration(totalTime)}
            </span>
          )}
          {recipe.cook_time > 0 && (
            <span className="flex items-center gap-1.5" title={t('recipe.cookTime')}>
              <Flame className="h-4 w-4 text-ember-500" />
              {formatDuration(recipe.cook_time)}
            </span>
          )}
          {recipe.servings > 0 && (
            <span className="flex items-center gap-1.5" title={t('recipe.servings')}>
              <Users className="h-4 w-4 text-brand-400" />
              {formatServings(recipe.servings, recipe.serving_unit)}
            </span>
          )}
        </div>

        {shownTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {shownTags.map(tag => (
              <TagChip key={tag.id} tag={tag} as={Link} to={`/?tag=${tag.id}`} dot />
            ))}
            {hiddenTagCount > 0 && (
              <span className="chip">{t('recipes.morePhotos', { count: hiddenTagCount })}</span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-black/5 pt-3.5 text-xs text-ink-300">
          <span className="truncate">{t('common.by', { author: recipe.author_name })}</span>

          {canEdit && (onEdit || onDelete) && (
            <div className="flex shrink-0 items-center gap-1">
              {onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEdit(recipe)}
                  aria-label={`${t('common.edit')} ${recipe.title}`}
                  icon={<Edit className="h-4 w-4" />}
                />
              )}
              {onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(recipe)}
                  aria-label={`${t('common.delete')} ${recipe.title}`}
                  className="hover:bg-rose-50 hover:text-rose-600"
                  icon={<Trash2 className="h-4 w-4" />}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
});

RecipeCard.displayName = 'RecipeCard';

export default RecipeCard;
