import React from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, Heart, Users, BookOpen, Sparkles, ArrowRight } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

const features = [
  {
    icon: ChefHat,
    tint: 'bg-brand-50 text-brand-500',
    title: 'Create & Share',
    body: 'Add your own recipes with photos, ingredients and step-by-step instructions.'
  },
  {
    icon: Heart,
    tint: 'bg-amber-50 text-amber-500',
    title: 'Organise & Tag',
    body: 'Sort everything with colour-coded tags and find it again with one search.'
  },
  {
    icon: Sparkles,
    tint: 'bg-teal-50 text-teal-500',
    title: 'Cook & Scale',
    body: 'Change the serving count and every quantity is recalculated for you.'
  }
];

export const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="mx-auto max-w-5xl space-y-16 lg:space-y-24">
      {/* Hero */}
      <section className="animate-rise pt-6 text-center lg:pt-16">
        <span className="chip mb-6" style={{ ['--chip' as string]: '#ff6b6b' }}>
          <span className="chip-dot" aria-hidden="true" />
          Your personal cookbook
        </span>

        <h1 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance lg:text-6xl">
          Every recipe worth keeping,{' '}
          <span className="bg-linear-to-br from-brand-500 to-ember-500 bg-clip-text text-transparent">
            in one place
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-500 text-pretty">
          Save what you cook, scale it to any number of servings, and find it again in
          seconds. No clutter, no ten paragraphs before the ingredients.
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button as={Link} to="/recipes" size="lg" className="group" icon={<BookOpen className="h-5 w-5" />}>
            Browse Recipes
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Button>

          {isAuthenticated ? (
            <Button as={Link} to="/recipe/new" variant="secondary" size="lg" icon={<ChefHat className="h-5 w-5" />}>
              Create a Recipe
            </Button>
          ) : (
            <Button as={Link} to="/register" variant="secondary" size="lg" icon={<Users className="h-5 w-5" />}>
              Create an Account
            </Button>
          )}
        </div>
      </section>

      {/* Features. The old page followed these with a second block of four
          buttons pointing at the same pages the nav bar already lists. */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map(({ icon: Icon, tint, title, body }) => (
          <Card key={title} interactive className="text-center">
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${tint}`}>
              <Icon className="h-6 w-6" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">{title}</h2>
            <p className="leading-relaxed text-ink-500">{body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
};

export default HomePage;
