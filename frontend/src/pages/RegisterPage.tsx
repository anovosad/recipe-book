import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, User, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { RegisterForm } from '@/types';
import { Card, Button } from '@/components/ui';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register: registerUser, isLoading } = useAuthStore();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setFocus,
    watch
  } = useForm<RegisterForm>({
    mode: 'onBlur'
  });

  const password = watch('password');

  // Focus username field on mount
  useEffect(() => {
    setFocus('username');
  }, [setFocus]);

  const onSubmit = async (data: RegisterForm) => {
    const success = await registerUser(data);
    if (success) {
      // Redirect to login with success message
      navigate('/login?message=Registration successful! Please log in.', { replace: true });
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center">
      <Card padding="lg" className="animate-rise w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="btn-brand mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <UserPlus className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Create Account</h1>
          <p className="mt-2 text-ink-500">Join Recipe Book to save and share your favorite recipes</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Username *
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
                placeholder="Choose a username"
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

          {/* Email Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    message: 'Please enter a valid email address'
                  },
                  maxLength: {
                    value: 254,
                    message: 'Email address is too long'
                  }
                })}
                type="email"
                className="field pl-11"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <p className="mt-1.5 flex items-center gap-1 text-sm text-rose-600">
                <AlertCircle className="w-3 h-3" />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              Password *
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  },
                  maxLength: {
                    value: 128,
                    message: 'Password is too long'
                  },
                  validate: {
                    hasLetterAndNumber: (value) => {
                      const hasLetter = /[a-zA-Z]/.test(value);
                      const hasNumber = /[0-9]/.test(value);
                      if (!hasLetter || !hasNumber) {
                        return 'Password must contain at least one letter and one number';
                      }
                      return true;
                    }
                  }
                })}
                type="password"
                className="field pl-11"
                placeholder="Create a password"
                autoComplete="new-password"
              />
            </div>
            {errors.password && (
              <p className="mt-1.5 flex items-center gap-1 text-sm text-rose-600">
                <AlertCircle className="w-3 h-3" />
                {errors.password.message}
              </p>
            )}
            
            {/* Password Strength Indicator */}
            {password && password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-gray-600">Password strength:</div>
                <div className="flex gap-1">
                  <div className={`h-1 rounded flex-1 ${password.length >= 6 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <div className={`h-1 rounded flex-1 ${password.length >= 8 ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <div className={`h-1 rounded flex-1 ${/[A-Z]/.test(password) && /[0-9]/.test(password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                  <div className={`h-1 rounded flex-1 ${/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            loading={isLoading}
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>
        </form>

        {/* Login Link */}
        <div className="mt-6 text-center">
          <p className="text-ink-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              Sign in here
            </Link>
          </p>
        </div>

        {/* Terms */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            By creating an account, you agree to keep your recipes delicious and safe for sharing.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;