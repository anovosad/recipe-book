import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import apiService from '@/services/api';
import { User } from '@/types';
import { getErrorMessage } from '@/utils';
import { useTranslation, translate, useLanguageStore } from '@/i18n';
import { Card, Button, Input, LoadingSpinner } from '@/components/ui';
import toast from 'react-hot-toast';

/**
 * Managing who has an account.
 *
 * Registration is closed, because the collection is shared and an account
 * carries the right to edit and delete anything in it. Somebody still has to be
 * able to add the rest of the family, and the alternative - editing an
 * environment variable - means restarting the site to add a cousin.
 *
 * Only an administrator can reach this; the API answers 403 regardless of what
 * the UI shows, so this page is a convenience rather than the enforcement.
 */
const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const { t } = useTranslation();
  const language = useLanguageStore(state => state.language);

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', is_admin: false });

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await apiService.getUsers());
    } catch (error) {
      console.error('Failed to load accounts:', error);
      // translate(language, ...) rather than t(): a fresh function identity in
      // this callback is how a fetch loop starts.
      toast.error(translate(language, 'users.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    // Every setState in loadUsers is behind an await, so this is not the
    // synchronous cascade the rule is aimed at.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await apiService.createUser(form);
      if (!response.success) throw response;
      toast.success(t('users.created', { username: form.username }));
      setForm({ username: '', email: '', password: '', is_admin: false });
      await loadUsers();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAdmin = async (target: User) => {
    try {
      const response = await apiService.setUserAdmin(target.id, !target.is_admin);
      if (!response.success) throw response;
      setUsers(response.data ?? users);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (target: User) => {
    // Naming where the recipes go, because that is the surprising part: the
    // account goes, its recipes stay and change hands.
    if (!window.confirm(t('users.deleteConfirm', { username: target.username }))) return;
    try {
      const response = await apiService.deleteUser(target.id);
      if (!response.success) throw response;
      setUsers(response.data ?? users);
      toast.success(t('users.deleted', { username: target.username }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{t('users.title')}</h1>
        <p className="mt-2 text-ink-500">{t('users.intro')}</p>
      </div>

      <Card>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-semibold">
          <UserPlus className="h-5 w-5" />
          {t('users.addTitle')}
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label={t('users.username')}
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              required
            />
            <Input
              label={t('users.email')}
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label={t('users.password')}
              type="text"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              helperText={t('users.passwordHelp')}
              required
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={e => setForm({ ...form, is_admin: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300"
            />
            <span>{t('users.makeAdmin')}</span>
          </label>

          <Button type="submit" loading={isSaving} icon={<UserPlus className="h-4 w-4" />}>
            {isSaving ? t('users.creating') : t('users.create')}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-5 text-xl font-semibold">{t('users.listTitle')}</h2>
        <ul className="divide-y divide-ink-100/60">
          {users.map(person => {
            const isSelf = person.id === currentUser?.id;
            return (
              <li key={person.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {person.username}
                    {isSelf && <span className="ml-2 text-sm text-ink-300">{t('users.you')}</span>}
                  </p>
                  <p className="truncate text-sm text-ink-500">{person.email}</p>
                </div>

                {person.is_admin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">
                    <Shield className="h-3 w-3" />
                    {t('users.admin')}
                  </span>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleAdmin(person)}
                  icon={person.is_admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                >
                  {person.is_admin ? t('users.revokeAdmin') : t('users.grantAdmin')}
                </Button>

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(person)}
                  disabled={isSelf}
                  title={isSelf ? t('users.cannotDeleteSelf') : undefined}
                  icon={<Trash2 className="h-4 w-4" />}
                />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
};

export default UsersPage;
