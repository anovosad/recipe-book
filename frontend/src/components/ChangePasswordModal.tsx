import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import apiService from '@/services/api';
import { Modal, Input, Button, Alert } from '@/components/ui';
import { useTranslation } from '@/i18n';
import toast from 'react-hot-toast';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY = { current_password: '', new_password: '', confirm_password: '' };

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const close = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };

  // Only the checks the server cannot make for us. Everything about what
  // counts as an acceptable password is answered by utils.ValidatePassword on
  // the backend, and its message is what gets shown - so the two can never
  // drift into disagreeing about the rules.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.new_password !== form.confirm_password) {
      setError(t('auth.passwordsDiffer'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiService.changePassword(form.current_password, form.new_password);
      if (response.success) {
        toast.success(t('auth.changePassword'));
        close();
      } else {
        setError(response.error || t('auth.changePasswordFailed'));
      }
    } catch (err: any) {
      setError(err?.error || t('auth.changePasswordFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    form.current_password.length > 0 &&
    form.new_password.length > 0 &&
    form.confirm_password.length > 0 &&
    !isSubmitting;

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('auth.changePassword')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('auth.currentPassword')}
          type="password"
          value={form.current_password}
          onChange={set('current_password')}
          autoComplete="current-password"
          autoFocus
          required
        />

        <Input
          label={t('auth.newPassword')}
          type="password"
          value={form.new_password}
          onChange={set('new_password')}
          autoComplete="new-password"
          helperText={t('auth.passwordRules')}
          required
        />

        <Input
          label={t('auth.repeatNewPassword')}
          type="password"
          value={form.confirm_password}
          onChange={set('confirm_password')}
          autoComplete="new-password"
          required
        />

        {error && <Alert type="error">{error}</Alert>}

        <p className="flex items-start gap-2 text-sm text-ink-500">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          {t('auth.changePasswordNote')}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting} disabled={!canSubmit}>
            {t('auth.changePassword')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;
