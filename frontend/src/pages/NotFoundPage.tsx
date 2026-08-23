
// NotFoundPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Card, Button } from '@/components/ui';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card padding="lg" className="max-w-md text-center">
        <div className="mb-2 bg-linear-to-br from-brand-400 to-ember-500 bg-clip-text text-7xl font-bold text-transparent">
          404
        </div>

        <h1 className="mb-2 text-2xl font-bold">
          Recipe Not Found
        </h1>

        <p className="mb-8 text-ink-500">
          Oops! The page you're looking for seems to have been eaten. 
          Maybe it was just too delicious to resist!
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button as={Link} to="/" icon={<Home className="h-4 w-4" />}>
            Go to Recipes
          </Button>

          <Button
            onClick={() => window.history.back()}
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default NotFoundPage;