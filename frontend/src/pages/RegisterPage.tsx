import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, User, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { RegisterForm } from '@/types';
import { useTranslation } from '@/i18n';
import { Card, Button } from '@/components/ui';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register: registerUser, isLoading } = useAuthStore();
  const { t } = useTranslation();
  
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
          <h1 className="text-2xl font-bold">{t('auth.createAccount')}</h1>
          <p className="mt-2 text-ink-500">{t('auth.registerSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Username Field */}
          <div>
            <label className="mb-2 block text-sm font-medium text-ink-700">
              {t('auth.username')} *
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('username', {
                  required: t('auth.usernameRequired'),
                  minLength: {
                    value: 3,
                    message: t('auth.usernameShort')
                  },
                  maxLength: {
                    value: 30,
                    message: t('auth.usernameLong')
                  },
                  pattern: {
                    value: /^[a-zA-Z0-9_]+$/,
                    message: t('auth.usernameChars')
                  }
                })}
                type="text"
                className="field pl-11"
                placeholder={t('auth.usernamePlaceholder')}
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
              {t('auth.email')} *
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('email', {
                  required: t('auth.emailRequired'),
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    message: t('auth.emailInvalid')
                  },
                  maxLength: {
                    value: 254,
                    message: t('auth.emailInvalid')
                  }
                })}
                type="email"
                className="field pl-11"
                placeholder={t('auth.emailPlaceholder')}
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
              {t('auth.password')} *
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                {...register('password', {
                  required: t('auth.passwordRequired'),
                  minLength: {
                    value: 6,
                    message: t('auth.passwordShort')
                  },
                  maxLength: {
                    value: 128,
                    message: t('auth.passwordShort')
                  },
                  validate: {
                    hasLetterAndNumber: (value) => {
                      const hasLetter = /[a-zA-Z]/.test(value);
                      const hasNumber = /[0-9]/.test(value);
                      if (!hasLetter || !hasNumber) {
                        return t('auth.passwordRules');
                      }
                      return true;
                    }
                  }
                })}
                type="password"
                className="field pl-11"
                placeholder={t('auth.passwordPlaceholder')}
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
            {isLoading ? t('auth.registering') : t('auth.createAccount')}
          </Button>
        </form>

        {/* Login Link */}
        <div className="mt-6 text-center">
          <p className="text-ink-500">
            {t('auth.haveAccount')}{' '}
            <Link
              to="/login"
              className="font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              {t('auth.signInInstead')}
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