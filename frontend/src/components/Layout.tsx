// frontend/src/components/Layout.tsx - Main layout wrapper
import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import { Toaster } from 'react-hot-toast';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-pink-50">
      <Navigation />
      
      <main className="container mx-auto px-4 py-6">
        {children || <Outlet />}
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
  );
};

export default Layout;