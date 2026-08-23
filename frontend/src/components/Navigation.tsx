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

const navLinks = [
  { path: '/recipes', label: 'Recipes', icon: List },
  { path: '/ingredients', label: 'Ingredients', icon: Leaf },
  { path: '/tags', label: 'Tags', icon: Tags }
];

const Navigation: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Closing on navigation rather than on each link's onClick, so the menu also
  // closes when something else moves the route (a redirect, the back button).
  // Adjusted during render, the pattern React documents for resetting state
  // when an input changes - an effect here would be a cascading render.
  const route = location.pathname + location.search;
  const [lastRoute, setLastRoute] = useState(route);
  if (route !== lastRoute) {
    setLastRoute(route);
    setIsMobileMenuOpen(false);
  }

  const handleLogout = async () => {
    await logout();
  };

  // A recipe page belongs under Recipes; exact matching left the whole bar
  // unhighlighted as soon as you opened one.
  const isActivePath = (path: string): boolean =>
    location.pathname === path ||
    (path === '/recipes' && location.pathname.startsWith('/recipe'));

  const desktopLink = (path: string) =>
    cn(
      'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
      isActivePath(path)
        ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100'
        : 'text-ink-500 hover:bg-white/70 hover:text-brand-600'
    );

  const mobileLink = (path: string) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition-colors',
      isActivePath(path)
        ? 'bg-brand-50 text-brand-700'
        : 'text-ink-500 hover:bg-white/70 hover:text-brand-600'
    );

  return (
    <>
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <nav className="sticky top-0 z-50 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo. Points at "/", which is where the home page lives - the
                logo and the error screen both sent you to /recipes instead, so
                nothing in the UI ever reached it. */}
            <Link
              to="/"
              className="flex items-center gap-2.5 text-lg font-bold text-ink-900 transition-opacity hover:opacity-80"
            >
              <span className="btn-brand flex h-9 w-9 items-center justify-center rounded-xl">
                <Utensils className="h-5 w-5" />
              </span>
              <span>Recipe Book</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden items-center gap-1 lg:flex">
              {navLinks.map(({ path, label, icon: Icon }) => (
                <Link key={path} to={path} className={desktopLink(path)}>
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>

            {/* Desktop Auth Menu */}
            <div className="hidden items-center gap-3 lg:flex">
              {isAuthenticated ? (
                <>
                  <span className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium text-ink-700 ring-1 ring-inset ring-black/[0.06]">
                    <User className="h-4 w-4 text-brand-500" />
                    {user?.username}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Login</span>
                  </Link>
                  <Link
                    to="/register"
                    className="btn-brand flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Register</span>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(open => !open)}
              className="rounded-full p-2 text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600 lg:hidden"
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation Menu */}
          {isMobileMenuOpen && (
            <div id="mobile-menu" className="animate-rise border-t border-black/5 py-4 lg:hidden">
              <div className="flex flex-col gap-1">
                {navLinks.map(({ path, label, icon: Icon }) => (
                  <Link key={path} to={path} className={mobileLink(path)}>
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                  </Link>
                ))}

                <div className="mt-3 border-t border-black/5 pt-3">
                  {isAuthenticated ? (
                    <>
                      <div className="flex items-center gap-3 px-3 py-3 font-medium text-ink-700">
                        <User className="h-5 w-5 text-brand-500" />
                        <span>{user?.username}</span>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <LogOut className="h-5 w-5" />
                        <span>Logout</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                      >
                        <LogIn className="h-5 w-5" />
                        <span>Login</span>
                      </Link>
                      <Link
                        to="/register"
                        className="btn-brand mt-2 flex items-center gap-3 rounded-xl px-3 py-3 font-medium"
                      >
                        <UserPlus className="h-5 w-5" />
                        <span>Register</span>
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
