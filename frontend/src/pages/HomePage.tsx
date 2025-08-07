
// HomePage.tsx
import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Utensils, ChefHat, Heart, Users, BookOpen, Star } from 'lucide-react';
import { Card, Button } from '@/components/ui';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to recipes page immediately
    navigate('/recipes', { replace: true });
  }, [navigate]);

  // This component won't actually render since we redirect,
  // but keeping it for completeness
  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center py-12">
        <div className="mb-6">
          <Utensils className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-4">
            Recipe Book
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Discover, save, and share your favorite recipes. Create your culinary collection and never lose a great recipe again.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            as={Link}
            to="/recipes"
            size="lg"
            icon={<BookOpen className="w-5 h-5" />}
          >
            Browse Recipes
          </Button>
          <Button
            as={Link}
            to="/register"
            variant="secondary"
            size="lg"
            icon={<Users className="w-5 h-5" />}
          >
            Join Community
          </Button>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="text-center">
          <ChefHat className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Create & Share
          </h3>
          <p className="text-gray-600">
            Add your own recipes with photos, ingredients, and step-by-step instructions.
          </p>
        </Card>

        <Card className="text-center">
          <Heart className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Organize & Tag
          </h3>
          <p className="text-gray-600">
            Use tags and categories to organize your recipes and find them easily.
          </p>
        </Card>

        <Card className="text-center">
          <Star className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Discover & Cook
          </h3>
          <p className="text-gray-600">
            Search through recipes, scale ingredients, and cook with confidence.
          </p>
        </Card>
      </div>
    </div>
  );
};