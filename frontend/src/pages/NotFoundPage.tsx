
// NotFoundPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { Card, Button } from '@/components/ui';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="text-center max-w-md">
        <div className="text-8xl font-bold text-gray-300 mb-4">404</div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Recipe Not Found
        </h1>
        
        <p className="text-gray-600 mb-8">
          Oops! The page you're looking for seems to have been eaten. 
          Maybe it was just too delicious to resist!
        </p>

        <div className="space-y-3">
          <Button
            as={Link}
            to="/recipes"
            className="w-full"
            icon={<Home className="w-4 h-4" />}
          >
            Go to Recipes
          </Button>
          
          <Button
            onClick={() => window.history.back()}
            variant="secondary"
            className="w-full"
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Go Back
          </Button>
          
          <Button
            as={Link}
            to="/recipes"
            variant="ghost"
            className="w-full"
            icon={<Search className="w-4 h-4" />}
          >
            Search Recipes
          </Button>
        </div>
      </Card>
    </div>
  );
};