import React from 'react';
import { Link } from 'react-router-dom';
import { Utensils, ChefHat, Heart, Users, BookOpen, Star, ArrowRight } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      {/* Hero Section */}
      <div className="text-center py-12">
        <div className="mb-8">
          <Utensils className="w-20 h-20 text-red-600 mx-auto mb-6" />
          <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 mb-4">
            Recipe Book
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Discover, save, and share your favorite recipes. Create your culinary collection and never lose a great recipe again.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            as={Link}
            to="/recipes"
            size="lg"
            className="group"
            icon={<BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />}
          >
            Browse Recipes
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
          
          {!isAuthenticated && (
            <Button
              as={Link}
              to="/register"
              variant="secondary"
              size="lg"
              icon={<Users className="w-5 h-5" />}
            >
              Join Community
            </Button>
          )}
          
          {isAuthenticated && (
            <Button
              as={Link}
              to="/recipe/new"
              variant="secondary"
              size="lg"
              icon={<ChefHat className="w-5 h-5" />}
            >
              Create Recipe
            </Button>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="text-center group hover:shadow-xl transition-all duration-300">
          <ChefHat className="w-12 h-12 text-red-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Create & Share
          </h3>
          <p className="text-gray-600">
            Add your own recipes with photos, ingredients, and step-by-step instructions. Share your culinary creations with the world.
          </p>
        </Card>

        <Card className="text-center group hover:shadow-xl transition-all duration-300">
          <Heart className="w-12 h-12 text-red-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Organize & Tag
          </h3>
          <p className="text-gray-600">
            Use tags and categories to organize your recipes. Find exactly what you're looking for with powerful search.
          </p>
        </Card>

        <Card className="text-center group hover:shadow-xl transition-all duration-300">
          <Star className="w-12 h-12 text-red-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Discover & Cook
          </h3>
          <p className="text-gray-600">
            Explore recipes from other cooks, scale ingredients automatically, and cook with confidence.
          </p>
        </Card>
      </div>

      {/* Quick Start Section */}
      <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Get Started</h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Whether you're a seasoned chef or just starting out, Recipe Book makes it easy to manage your culinary journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            as={Link}
            to="/recipes"
            variant="ghost"
            className="h-auto p-4 flex-col"
          >
            <BookOpen className="w-8 h-8 text-red-600 mb-2" />
            <span className="font-medium">Browse Recipes</span>
            <span className="text-sm text-gray-500 mt-1">Explore the collection</span>
          </Button>

          <Button
            as={Link}
            to="/ingredients"
            variant="ghost"
            className="h-auto p-4 flex-col"
          >
            <Utensils className="w-8 h-8 text-green-600 mb-2" />
            <span className="font-medium">Ingredients</span>
            <span className="text-sm text-gray-500 mt-1">Manage your pantry</span>
          </Button>

          <Button
            as={Link}
            to="/tags"
            variant="ghost"
            className="h-auto p-4 flex-col"
          >
            <Star className="w-8 h-8 text-blue-600 mb-2" />
            <span className="font-medium">Categories</span>
            <span className="text-sm text-gray-500 mt-1">Organize by type</span>
          </Button>

          {isAuthenticated ? (
            <Button
              as={Link}
              to="/recipe/new"
              variant="ghost"
              className="h-auto p-4 flex-col"
            >
              <ChefHat className="w-8 h-8 text-purple-600 mb-2" />
              <span className="font-medium">Create Recipe</span>
              <span className="text-sm text-gray-500 mt-1">Add your own</span>
            </Button>
          ) : (
            <Button
              as={Link}
              to="/register"
              variant="ghost"
              className="h-auto p-4 flex-col"
            >
              <Users className="w-8 h-8 text-purple-600 mb-2" />
              <span className="font-medium">Join Us</span>
              <span className="text-sm text-gray-500 mt-1">Start creating</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;