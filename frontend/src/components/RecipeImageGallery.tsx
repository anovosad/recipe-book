// frontend/src/components/RecipeImageGallery.tsx - Image gallery with modal
import React, { useState, useEffect } from 'react';
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

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
  }, [isModalOpen, selectedIndex, images.length]);

  const openModal = (index: number) => {
    setSelectedIndex(index);
    setIsModalOpen(true);
    setZoom(1);
    setRotation(0);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedIndex(null);
    setZoom(1);
    setRotation(0);
    document.body.style.overflow = 'auto';
  };

  const navigateImage = (direction: number) => {
    if (selectedIndex === null) return;
    const newIndex = (selectedIndex + direction + images.length) % images.length;
    setSelectedIndex(newIndex);
    setZoom(1);
    setRotation(0);
  };

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <>
      {/* Gallery Grid */}
      <div className={cn("space-y-4", className)}>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <ZoomIn className="w-5 h-5" />
          Recipe Photos ({images.length})
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative bg-gray-100 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg"
              onClick={() => openModal(index)}
            >
              <img
                src={`/uploads/${image.filename}`}
                alt={image.caption || `${recipeName} - Photo ${index + 1}`}
                className="w-full h-48 object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </div>
              
              {/* Caption */}
              {image.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <p className="text-white text-sm truncate">{image.caption}</p>
                </div>
              )}
              
              {/* Image Counter */}
              <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {index + 1} / {images.length}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && selectedIndex !== null && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeModal}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoom(prev => Math.max(prev - 0.25, 0.5));
              }}
              className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            
            <span className="bg-black/50 text-white px-3 py-1 rounded text-sm">
              {Math.round(zoom * 100)}%
            </span>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoom(prev => Math.min(prev + 0.25, 3));
              }}
              className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRotation(prev => (prev + 90) % 360);
              }}
              className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              title="Rotate (R)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            
            <button
              onClick={closeModal}
              className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Image Counter */}
          <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-2 rounded">
            {selectedIndex + 1} of {images.length}
          </div>

          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage(-1);
                }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                title="Previous image (←)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateImage(1);
                }}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition-colors"
                title="Next image (→)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Main Image */}
          <div 
            className="relative max-w-full max-h-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`/uploads/${images[selectedIndex].filename}`}
              alt={images[selectedIndex].caption || `${recipeName} - Photo ${selectedIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center'
              }}
            />
          </div>

          {/* Caption */}
          {images[selectedIndex].caption && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded max-w-md text-center">
              <p className="text-sm">{images[selectedIndex].caption}</p>
            </div>
          )}

          {/* Keyboard Shortcuts Help */}
          <div className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-3 py-2 rounded">
            <div>← → Navigate • + - Zoom • R Rotate • ESC Close</div>
          </div>
        </div>
      )}
    </>
  );
};

export default RecipeImageGallery;