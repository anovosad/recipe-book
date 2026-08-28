import React, { useEffect, useState } from 'react';
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
  X,
  KeyRound
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { cn } from '@/utils';
import { useTranslation, LANGUAGES, type Language } from '@/i18n';
import ChangePasswordModal from '@/components/ChangePasswordModal';

const navLinks = [
  { path: '/', label: 'nav.recipes', icon: List },
  { path: '/ingredients', label: 'nav.ingredients', icon: Leaf },
  { path: '/tags', label: 'nav.tags', icon: Tags }
] as const;

// Two languages, so a pair of buttons beats a dropdown - one click either way,
// and which one you are on is visible without opening anything.
const LanguageSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { t, language, setLanguage } = useTranslation();

  return (
    <div
      className={cn('flex items-center gap-0.5 rounded-full bg-white/70 p-0.5 ring-1 ring-inset ring-black/[0.06]', className)}
      role="group"
      aria-label={t('nav.language')}
    >
      {(Object.keys(LANGUAGES) as Language[]).map(code => (
        <button
          key={code}
          onClick={() => setLanguage(code)}
          aria-pressed={code === language}
          title={LANGUAGES[code].label}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition-colors',
            code === language
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-300 hover:text-brand-600'
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
};

const Navigation: React.FC = () => {
  // Offering a link to a form the server refuses is worse than not offering it.
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    apiService
      .getFeatures()
      .then(features => setRegistrationOpen(!!features?.registration))
      .catch(() => setRegistrationOpen(false));
    // Asked once per mount, with no `t` in the dependencies: a fresh function
    // identity each render is how a fetch loop starts.
  }, []);
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

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
    (path === '/' && location.pathname.startsWith('/recipe'));

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
                  <span>{t(label)}</span>
                </Link>
              ))}
            </div>

            {/* Desktop Auth Menu */}
            <div className="hidden items-center gap-3 lg:flex">
              <LanguageSwitch />
              {isAuthenticated ? (
                <>
                  <span className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-sm font-medium text-ink-700 ring-1 ring-inset ring-black/[0.06]">
                    <User className="h-4 w-4 text-brand-500" />
                    {user?.username}
                  </span>
                  <button
                    onClick={() => setIsPasswordModalOpen(true)}
                    className="rounded-full p-2 text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                    title={t('nav.changePassword')}
                    aria-label={t('nav.changePassword')}
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{t('nav.logout')}</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>{t('nav.login')}</span>
                  </Link>
{registrationOpen && (
                  <Link
                    to="/register"
                    className="btn-brand flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>{t('nav.register')}</span>
                  </Link>
                  )}
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(open => !open)}
              className="rounded-full p-2 text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600 lg:hidden"
              aria-label={t('nav.toggleMenu')}
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
                    <span>{t(label)}</span>
                  </Link>
                ))}

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/5 px-3 pt-3">
                  <span className="text-sm text-ink-300">{t('nav.language')}</span>
                  <LanguageSwitch />
                </div>

                <div className="mt-3 border-t border-black/5 pt-3">
                  {isAuthenticated ? (
                    <>
                      <div className="flex items-center gap-3 px-3 py-3 font-medium text-ink-700">
                        <User className="h-5 w-5 text-brand-500" />
                        <span>{user?.username}</span>
                      </div>
                      <button
                        onClick={() => { setIsMobileMenuOpen(false); setIsPasswordModalOpen(true); }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                      >
                        <KeyRound className="h-5 w-5" />
                        <span>{t('nav.changePassword')}</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <LogOut className="h-5 w-5" />
                        <span>{t('nav.logout')}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        className="flex items-center gap-3 rounded-xl px-3 py-3 font-medium text-ink-500 transition-colors hover:bg-white/70 hover:text-brand-600"
                      >
                        <LogIn className="h-5 w-5" />
                        <span>{t('nav.login')}</span>
                      </Link>
{registrationOpen && (
                      <Link
                        to="/register"
                        className="btn-brand mt-2 flex items-center gap-3 rounded-xl px-3 py-3 font-medium"
                      >
                        <UserPlus className="h-5 w-5" />
                        <span>{t('nav.register')}</span>
                      </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
};

export default Navigation;
