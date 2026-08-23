import React, { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { LoginForm } from '@/types';
import { Card, Button } from '@/components/ui';
import toast from 'react-hot-toast';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isLoading } = useAuthStore();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setFocus
  } = useForm<LoginForm>({
    mode: 'onBlur'
  });

  // Focus username field on mount
  useEffect(() => {
    setFocus('username');
  }, [setFocus]);

  // Show message from URL params (e.g., from registration)
  useEffect(() => {
    const message = searchParams.get('message');
    if (message) {
      toast.success(decodeURIComponent(message));
    }
  }, [searchParams]);

  const onSubmit = async (data: LoginForm) => {
    const success = await login(data);
    if (success) {
      // Straight through. This used to sit on a 1s setTimeout "to show the
      // success message" - the toast outlives the navigation anyway, so all
      // the delay bought was a second of staring at the form.
      navigate('/recipes', { replace: true });
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center">
      <Card padding="lg" className="animate-rise w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="btn-brand mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <LogIn className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Welcome Back</h1>
          <p className="mt-2 text-ink-500">Sign in to your Recipe Book account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Username
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 3,
                    message: 'Username must be at least 3 characters'
                  },
                  maxLength: {
                    value: 30,
                    message: 'Username must be no more than 30 characters'
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: 'Username can only contain letters, numbers, and underscores'
                  }
                })}
                type="text"
                className="field pl-11"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
            {errors.username && (
              <p className="mt-1.5 flex items-center gap-1 text-sm text-rose-600">
                <AlertCircle className="w-3 h-3" />
                {errors.username.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                type="password"
                className="field pl-11"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
            {errors.password && (
              <p className="mt-1.5 flex items-center gap-1 text-sm text-rose-600">
                <AlertCircle className="w-3 h-3" />
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {/* Registration Link */}
        <div className="mt-7 text-center">
          <p className="text-ink-500">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Create one here
            </Link>
          </p>
        </div>

      </Card>
    </div>
  );
};

export default LoginPage;