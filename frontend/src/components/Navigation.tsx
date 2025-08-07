import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Utensils, 
  List, 
  Leaf, 
  Tags, 
  User, 
  LogIn, 
  UserPlus, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils';

const Navigation: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setIsMobileMenuOpen(false);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const isActivePath = (path: string): boolean => {
    return location.pathname === path;
  };

  const navLinks = [
    { path: '/recipes', label: 'Recipes', icon: List },
    { path: '/ingredients', label: 'Ingredients', icon: Leaf },
    { path: '/tags', label: 'Tags', icon: Tags }
  ];

  return (
    <>
      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <nav className="bg-white/95 backdrop-blur-lg border-b border-white/20 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link
                to="/recipes"
                className="flex items-center space-x-2 text-xl font-bold text-red-600 hover:text-red-700 transition-colors"
                onClick={closeMobileMenu}
              >
                <Utensils className="w-6 h-6" />
                <span>Recipe Book</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              {navLinks.map(({ path, label, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={cn(
                    "flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActivePath(path)
                      ? "bg-red-100 text-red-700"
                      : "text-gray-600 hover:text-red-600 hover:bg-red-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            {/* Desktop Auth Menu */}
            <div className="hidden lg:flex items-center space-x-4">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center space-x-2 text-gray-700">
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">{user?.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link
                    to="/login"
                    className="flex items-center space-x-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Login</span>
                  </Link>
                  <Link
                    to="/register"
                    className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Register</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-gray-600 hover:text-red-600 transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-200">
              <div className="flex flex-col space-y-2">
                {navLinks.map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={cn(
                      "flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors",
                      isActivePath(path)
                        ? "bg-red-100 text-red-700"
                        : "text-gray-600 hover:text-red-600 hover:bg-red-50"
                    )}
                    onClick={closeMobileMenu}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{label}</span>
                  </Link>
                ))}

                <div className="pt-4 border-t border-gray-200 mt-4">
                  {isAuthenticated ? (
                    <>
                      <div className="flex items-center space-x-3 px-3 py-3 text-gray-700">
                        <User className="w-5 h-5" />
                        <span className="font-medium">{user?.username}</span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="flex items-center space-x-3 px-3 py-3 w-full text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">Logout</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        className="flex items-center space-x-3 px-3 py-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        onClick={closeMobileMenu}
                      >
                        <LogIn className="w-5 h-5" />
                        <span className="font-medium">Login</span>
                      </Link>
                      <Link
                        to="/register"
                        className="flex items-center space-x-3 px-3 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors mt-2"
                        onClick={closeMobileMenu}
                      >
                        <UserPlus className="w-5 h-5" />
                        <span className="font-medium">Register</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navigation;