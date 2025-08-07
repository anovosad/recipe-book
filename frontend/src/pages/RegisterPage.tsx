import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, User, Mail, Lock, Alert } from 'lucide-react';
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
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-600 mt-2">Join Recipe Book to save and share your favorite recipes</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Choose a username"
                autoComplete="username"
              />
            </div>
            {errors.username && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <Alert className="w-3 h-3" />
                {errors.username.message}
              </p>
            )}
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <Alert className="w-3 h-3" />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="Create a password"
                autoComplete="new-password"
              />
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                <Alert className="w-3 h-3" />
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
          <p className="text-gray-600">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-red-600 hover:text-red-500 transition-colors"
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