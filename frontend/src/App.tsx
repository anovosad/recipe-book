import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Store imports
import { useAuthStore } from './store/authStore';
import { useLanguageStore } from './i18n';

// Component imports  
import Navigation from './components/Navigation';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';

// Lazy imports for code splitting
import {
  RecipesPage,
  RecipeDetailPage,
  RecipeFormPage,
  IngredientsPage,
  TagsPage,
  LoginPage,
  RegisterPage,
  PageLoader
} from './components/LazyComponents';
import NotFoundPage from './pages/NotFoundPage';

// /recipes was where the list lived before the home page was dropped. Keeping
// it as a redirect means bookmarks and any link someone already shared - filters
// included - still land on the list.
const RecipesRedirect: React.FC = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
};

const App: React.FC = () => {
  const { initialize, isLoading, isAuthenticated } = useAuthStore();
  const language = useLanguageStore(state => state.language);

  useEffect(() => {
    // Initialize auth on app startup
    initialize();
  }, [initialize]);

  // Keep <html lang> honest: screen readers and the browser's own translation
  // prompt both read it, and it was hardcoded to "en" in index.html.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        {/* The page ground is on <body> now, so it covers the whole viewport
            including the overscroll area rather than stopping at this div. */}
        <div className="min-h-screen">
          <Navigation />

          <main className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes. The recipe list is the front page. */}
                <Route path="/" element={<RecipesPage />} />
                <Route path="/recipes" element={<RecipesRedirect />} />
                <Route path="/recipe/:id" element={<RecipeDetailPage />} />
                <Route path="/ingredients" element={<IngredientsPage />} />
                <Route path="/tags" element={<TagsPage />} />
                
                {/* Auth routes - redirect if already authenticated */}
                <Route 
                  path="/login" 
                  element={
                    isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
                  } 
                />
                <Route 
                  path="/register" 
                  element={
                    isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
                  } 
                />
                
                {/* Protected routes */}
                <Route
                  path="/recipe/new"
                  element={
                    <PrivateRoute>
                      <RecipeFormPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/recipe/:id/edit"
                  element={
                    <PrivateRoute>
                      <RecipeFormPage />
                    </PrivateRoute>
                  }
                />
                
                {/* 404 route */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>
          
          {/* Toast notifications */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(255, 255, 255, 0.75)',
                borderRadius: '1rem',
                boxShadow: '0 4px 10px rgba(31, 38, 135, 0.06), 0 18px 40px rgba(31, 38, 135, 0.13)',
                color: '#1d2027',
                padding: '0.75rem 1rem'
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#ffffff' }
              },
              error: {
                iconTheme: { primary: '#ff6b6b', secondary: '#ffffff' }
              }
            }}
          />
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;