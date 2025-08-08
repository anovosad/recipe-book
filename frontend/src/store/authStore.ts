import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import toast from 'react-hot-toast';
import { LoginForm, RegisterForm, AuthState } from '@/types';
import apiService from '@/services/api';

interface AuthStore extends AuthState {
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      initialize: async () => {
        // Check localStorage first for faster startup
        const persistedState = localStorage.getItem('recipe-book-auth');
        if (persistedState) {
          try {
            const { state } = JSON.parse(persistedState);
            if (state?.user && state?.isAuthenticated) {
              set({ 
                user: state.user, 
                isAuthenticated: true, 
                isLoading: false 
              });
              
              // Verify in background
              setTimeout(async () => {
                try {
                  await apiService.checkAuth();
                } catch (error) {
                  set({ user: null, isAuthenticated: false });
                }
              }, 100);
              
              return;
            }
          } catch (error) {
            console.warn('Failed to parse persisted auth state');
          }
        }

        // If no valid persisted state, check with server
        set({ isLoading: true });
        try {
          const user = await apiService.checkAuth();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      login: async (credentials: LoginForm): Promise<boolean> => {
        set({ isLoading: true });
        try {
          const response = await apiService.login(credentials);
          
          if (response.success && response.data?.user) {
            set({ 
              user: response.data.user, 
              isAuthenticated: true, 
              isLoading: false 
            });
            
            toast.success(response.message || 'Login successful!');
            return true;
          } else {
            set({ isLoading: false });
            toast.error(response.error || 'Login failed');
            return false;
          }
        } catch (error: any) {
          set({ isLoading: false });
          const errorMessage = error.error || 'Login failed. Please try again.';
          toast.error(errorMessage);
          return false;
        }
      },

      register: async (userData: RegisterForm): Promise<boolean> => {
        set({ isLoading: true });
        try {
          const response = await apiService.register(userData);
          
          if (response.success) {
            set({ isLoading: false });
            toast.success(response.message || 'Registration successful!');
            return true;
          } else {
            set({ isLoading: false });
            toast.error(response.error || 'Registration failed');
            return false;
          }
        } catch (error: any) {
          set({ isLoading: false });
          const errorMessage = error.error || 'Registration failed. Please try again.';
          toast.error(errorMessage);
          return false;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await apiService.logout();
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
          toast.success('Logged out successfully');
        } catch (error) {
          // Even if API call fails, clear local state
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          });
          toast.success('Logged out successfully');
        }
      },

      checkAuth: async () => {
        try {
          const user = await apiService.checkAuth();
          set({ user, isAuthenticated: true });
        } catch (error) {
          set({ user: null, isAuthenticated: false });
        }
      }
    }),
    {
      name: 'recipe-book-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated 
      })
    }
  )
);