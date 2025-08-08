import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from '@/components/Navigation';

interface LayoutProps {
  children?: React.ReactNode;
}

// Simple layout component for cases where you want to compose layouts differently
// Currently the main App.tsx handles the full layout, but this component
// can be used for nested layouts or alternative page structures
export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-pink-50">
      <Navigation />
      
      <main className="container mx-auto px-4 py-6">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default Layout;