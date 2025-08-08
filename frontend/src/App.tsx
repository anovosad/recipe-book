import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Store imports
import { useAuthStore } from './store/authStore';

// Component imports  
import Navigation from './components/Navigation';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';
import HomePage from './pages/HomePage'; // Keep HomePage as non-lazy since it's the landing page

// Lazy imports
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

const App: React.FC = () => {
  const { initialize, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Initialize auth in background - don't block rendering
    initialize();
  }, [initialize]);

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
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-pink-50">
          <Navigation />
          
          <main className="container mx-auto px-4 py-6">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/recipe/:id" element={<RecipeDetailPage />} />
                <Route path="/ingredients" element={<IngredientsPage />} />
                <Route path="/tags" element={<TagsPage />} />
                
                {/* Auth routes - redirect if already authenticated */}
                <Route 
                  path="/login" 
                  element={
                    isAuthenticated ? <Navigate to="/recipes" replace /> : <LoginPage />
                  } 
                />
                <Route 
                  path="/register" 
                  element={
                    isAuthenticated ? <Navigate to="/recipes" replace /> : <RegisterPage />
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
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '10px',
                boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
                color: '#333'
              },
              success: {
                style: {
                  borderLeft: '4px solid #10b981'
                },
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#ffffff'
                }
              },
              error: {
                style: {
                  borderLeft: '4px solid #ef4444'
                },
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#ffffff'
                }
              },
              loading: {
                style: {
                  borderLeft: '4px solid #3b82f6'
                }
              }
            }}
          />
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;