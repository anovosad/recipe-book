// frontend/src/components/RecipeImageGallery.tsx - Image gallery with modal
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { RecipeImage } from '@/types';
import { cn } from '@/utils';

interface RecipeImageGalleryProps {
  images: RecipeImage[];
  recipeName: string;
  className?: string;
}

export const RecipeImageGallery: React.FC<RecipeImageGalleryProps> = ({
  images,
  recipeName,
  className
}) => {
  // Which photo is shown large on the page, as opposed to selectedIndex, which
  // is the one the lightbox is currently on.
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const closeModal = useCallback(() => {
    // Leave the page showing whatever you were last looking at.
    if (selectedIndex !== null) setActiveIndex(selectedIndex);
    setIsModalOpen(false);
    setSelectedIndex(null);
    setZoom(1);
    setRotation(0);
  }, [selectedIndex]);

  const navigateImage = useCallback((direction: number) => {
    if (selectedIndex === null) return;
    const newIndex = (selectedIndex + direction + images.length) % images.length;
    setSelectedIndex(newIndex);
    setZoom(1);
    setRotation(0);
  }, [selectedIndex, images.length]);

  const openModal = (index: number) => {
    setSelectedIndex(index);
    setIsModalOpen(true);
    setZoom(1);
    setRotation(0);
  };

  // Locking body scroll from an effect rather than from openModal/closeModal:
  // the old version only restored `overflow` when the modal was closed by hand,
  // so unmounting with it open (navigating away) left <body> unscrollable.
  useEffect(() => {
    if (!isModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isModalOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return;

      switch (e.key) {
        case 'Escape':
          closeModal();
          break;
        case 'ArrowLeft':
          navigateImage(-1);
          break;
        case 'ArrowRight':
          navigateImage(1);
          break;
        case '=':
        case '+':
          setZoom(prev => Math.min(prev + 0.25, 3));
          break;
        case '-':
          setZoom(prev => Math.max(prev - 0.25, 0.5));
          break;
        case 'r':
        case 'R':
          setRotation(prev => (prev + 90) % 360);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // navigateImage is a useCallback over selectedIndex/images.length, so the
    // listener is rebound exactly when it would otherwise go stale - no
    // exhaustive-deps suppression needed any more.
  }, [isModalOpen, closeModal, navigateImage]);

  if (!images || images.length === 0) {
    return null;
  }

  // Clamped rather than reset by an effect: navigating from a recipe with four
  // photos to one with two keeps this component mounted.
  const heroIndex = Math.min(activeIndex, images.length - 1);
  const hero = images[heroIndex];

  return (
    <>
      <div className={cn('space-y-3', className)}>
        {/* The photo at full width, not a thumbnail you have to open first. */}
        <button
          type="button"
          onClick={() => openModal(heroIndex)}
          className="surface group relative block w-full cursor-zoom-in overflow-hidden p-0"
          title="Open full size"
        >
          <img
            src={`/uploads/${hero.filename}`}
            alt={hero.caption || `${recipeName} - Photo ${heroIndex + 1}`}
            className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />

          <span className="absolute right-3 top-3 rounded-full bg-black/45 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-4 w-4" />
          </span>

          {hero.caption && (
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4 text-left text-sm text-white">
              {hero.caption}
            </span>
          )}
        </button>

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-2 transition-all',
                  index === heroIndex
                    ? 'ring-brand-400'
                    : 'opacity-65 ring-transparent hover:opacity-100'
                )}
                title={image.caption || `Photo ${index + 1}`}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === heroIndex}
              >
                <img
                  src={`/uploads/${image.filename}`}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rendered into <body>. `.surface` sets backdrop-filter, and an element
          with a backdrop-filter is a containing block for its fixed-position
          descendants - so inset-0 resolved against the card this gallery sits
          in, and the "full screen" viewer was clamped to that card. */}
      {isModalOpen && selectedIndex !== null && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
          {/* Top bar. Its own row rather than an overlay, so the controls never
              sit on top of the picture. */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 text-white">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums">
              {selectedIndex + 1} / {images.length}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.5))}
                className="rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
                title="Zoom out (-)"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>

              <span className="min-w-[3.5rem] text-center text-sm tabular-nums">
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={() => setZoom(prev => Math.min(prev + 0.25, 3))}
                className="rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
                title="Zoom in (+)"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>

              <button
                onClick={() => setRotation(prev => (prev + 90) % 360)}
                className="rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
                title="Rotate (R)"
                aria-label="Rotate"
              >
                <RotateCw className="h-4 w-4" />
              </button>

              <button
                onClick={closeModal}
                className="ml-1 rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* The stage scrolls. Zoom is the CSS `zoom` property rather than a
              transform on purpose: a transform does not change layout, so a
              magnified image was simply clipped with no way to reach the rest
              of it. */}
          <div
            className="relative flex-1 overflow-auto overscroll-contain"
            onClick={closeModal}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <img
                src={`/uploads/${images[selectedIndex].filename}`}
                alt={images[selectedIndex].caption || `${recipeName} - Photo ${selectedIndex + 1}`}
                className="max-h-[calc(100dvh-9rem)] max-w-full object-contain"
                style={{ zoom, transform: `rotate(${rotation}deg)` }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={() => navigateImage(-1)}
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white transition-colors hover:bg-black/80"
                title="Previous image (left arrow)"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button
                onClick={() => navigateImage(1)}
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white transition-colors hover:bg-black/80"
                title="Next image (right arrow)"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Bottom bar */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-white">
            <p className="min-w-0 flex-1 truncate text-sm text-white/80">
              {images[selectedIndex].caption}
            </p>
            <span className="hidden text-xs whitespace-nowrap text-white/50 sm:block">
              ← → navigate · + − zoom · R rotate · Esc close
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default RecipeImageGallery;