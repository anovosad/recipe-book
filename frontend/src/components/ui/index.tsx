import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils';
import { Tag } from '@/types';
import { translate, currentLanguage } from '@/i18n';

// Loading Spinner Component
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <Loader2
      className={cn('animate-spin text-brand-500', sizeClasses[size], className)}
    />
  );
};

// Button Component - Fixed for polymorphic usage and optional children
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode; // Made optional
  as?: React.ElementType;

  // Props for Link component compatibility
  to?: string;
  replace?: boolean;

  // Props for anchor element compatibility
  href?: string;
  target?: string;
  rel?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  as: Component = 'button',
  to,
  replace,
  href,
  target,
  rel,
  ...props
}) => {
  // focus-visible, not focus: a plain `focus:ring` also fires on a mouse click,
  // so every button just pressed kept a ring until something else took focus.
  const baseClasses = 'inline-flex items-center justify-center rounded-full font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ' +
    'focus-visible:ring-offset-2 disabled:opacity-55 disabled:cursor-not-allowed disabled:shadow-none';

  const variantClasses = {
    // The coral-to-orange gradient the app used before the rewrite flattened
    // every action into the same solid red.
    primary: 'btn-brand',
    secondary: 'bg-white/80 text-ink-700 ring-1 ring-inset ring-black/[0.08] hover:bg-white hover:text-brand-600 hover:ring-brand-200',
    danger: 'bg-rose-50/80 text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 hover:text-rose-700',
    ghost: 'text-ink-500 hover:text-brand-600 hover:bg-brand-50/80'
  };

  // An icon with no label is a round button, not a pill with a hole in it.
  const iconOnly = !children && !!icon;

  const sizeClasses = iconOnly
    ? { sm: 'p-1.5', md: 'p-2', lg: 'p-2.5' }
    : {
        sm: 'min-h-9 px-3.5 py-1.5 text-sm gap-1.5',
        md: 'min-h-11 px-5 py-2.5 text-sm gap-2',
        lg: 'min-h-12 px-7 py-3 text-base gap-2.5'
      };

  // Prepare props for the component - include Link and anchor props
  const componentProps: any = { ...props };

  if (to !== undefined) componentProps.to = to;
  if (replace !== undefined) componentProps.replace = replace;
  if (href !== undefined) componentProps.href = href;
  if (target !== undefined) componentProps.target = target;
  if (rel !== undefined) componentProps.rel = rel;

  return (
    <Component
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...componentProps}
    >
      {loading ? (
        <LoadingSpinner size="sm" className={variant === 'primary' ? 'text-white' : undefined} />
      ) : icon ? (
        icon
      ) : null}
      {children}
    </Component>
  );
};

// Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className
}) => {
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Restore what was there rather than hard-coding 'unset'. The old cleanup
    // ran on every close - including closes of a modal that was never open -
    // and would unlock the page underneath anything else holding the scroll.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  // Not the hook: this is the only string Modal owns, and reading the language
  // directly keeps it out of the render path of every dialog in the app.
  const closeLabel = translate(currentLanguage(), 'common.close');

  if (!isOpen) return null;

  // Into <body>, not wherever the caller happens to sit. An ancestor with a
  // backdrop-filter - `.surface`, or the nav bar's backdrop-blur - is a
  // containing block for fixed-position descendants, so inset-0 would resolve
  // against that element and the dialog would be trapped inside it.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'surface animate-rise relative w-full max-w-md max-h-[90vh] overflow-y-auto shadow-lift',
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label={closeLabel}
              className="-mr-1 rounded-full p-1.5 text-ink-500 transition-colors hover:bg-black/5 hover:text-ink-900"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className={cn('px-6 pb-6', !title && 'pt-6')}>{children}</div>
      </div>
    </div>,
    document.body
  );
};

// Alert Component
interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  className
}) => {
  const icons = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle
  };

  const colors = {
    info: 'bg-sky-50/80 ring-sky-200 text-sky-900',
    success: 'bg-emerald-50/80 ring-emerald-200 text-emerald-900',
    warning: 'bg-amber-50/80 ring-amber-200 text-amber-900',
    error: 'bg-rose-50/80 ring-rose-200 text-rose-900'
  };

  const iconColors = {
    info: 'text-sky-500',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    error: 'text-rose-500'
  };

  const Icon = icons[type];

  return (
    <div className={cn('rounded-2xl p-4 ring-1 ring-inset', colors[type], className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', iconColors[type])} />
        <div className="min-w-0">
          {title && <h4 className="font-semibold mb-1">{title}</h4>}
          <div className="text-sm leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
};

// Shared label + error + helper scaffolding, so the three controls below stay
// in step instead of each repeating the same markup with small differences.
const FieldShell: React.FC<{
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}> = ({ label, required, error, helperText, children }) => (
  <div className="space-y-1.5">
    {label && (
      <label className="block text-sm font-medium text-ink-700">
        {label}
        {required && <span className="text-brand-500 ml-1">*</span>}
      </label>
    )}
    {children}
    {error && <p className="text-sm text-rose-600">{error}</p>}
    {helperText && !error && <p className="text-sm text-ink-500">{helperText}</p>}
  </div>
);

// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  className,
  ...props
}, ref) => (
  <FieldShell label={label} required={props.required} error={error} helperText={helperText}>
    <input
      ref={ref}
      aria-invalid={error ? true : undefined}
      className={cn('field', error && 'field-invalid', className)}
      {...props}
    />
  </FieldShell>
));

Input.displayName = 'Input';

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  className,
  ...props
}, ref) => (
  <FieldShell label={label} required={props.required} error={error} helperText={helperText}>
    <textarea
      ref={ref}
      aria-invalid={error ? true : undefined}
      className={cn('field leading-relaxed', error && 'field-invalid', className)}
      {...props}
    />
  </FieldShell>
));

Textarea.displayName = 'Textarea';

// Select Component
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  options,
  className,
  ...props
}, ref) => (
  <FieldShell label={label} required={props.required} error={error} helperText={helperText}>
    <select
      ref={ref}
      aria-invalid={error ? true : undefined}
      className={cn('field appearance-none pr-9 bg-no-repeat', error && 'field-invalid', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.65rem center',
        backgroundSize: '1.1rem'
      }}
      {...props}
    >
      {options.map(option => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  </FieldShell>
));

Select.displayName = 'Select';

// Card Component
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Adds the hover lift. For cards that are themselves a link or a target. */
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  interactive = false
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8'
  };

  return (
    <div className={cn('surface', interactive && 'surface-interactive', paddingClasses[padding], className)}>
      {children}
    </div>
  );
};

// Tag chip. Every tag carries a colour the API has always returned and the UI
// never drew - the pages hard-coded grey and one of them even overwrote the
// stored colour with grey on create.
interface TagChipProps {
  tag: Pick<Tag, 'name' | 'color'>;
  selected?: boolean;
  dot?: boolean;
  as?: React.ElementType;
  to?: string;
  className?: string;
  [key: string]: any;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  selected = false,
  dot = false,
  as: Component = 'span',
  className,
  style,
  ...props
}) => (
  <Component
    className={cn('chip', selected && 'chip-selected', className)}
    // The one value the whole chip is derived from; the stylesheet mixes it
    // into a ground and a label dark enough to stay readable either way.
    style={{ ['--chip' as string]: tag.color || '#9aa1ae', ...style }}
    {...props}
  >
    {dot && !selected && <span className="chip-dot" aria-hidden="true" />}
    {tag.name}
  </Component>
);

// Empty State Component
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className
}) => {
  return (
    <div className={cn('surface flex flex-col items-center px-6 py-16 text-center', className)}>
      {icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-ink-900 mb-2">{title}</h3>
      {description && (
        <p className="text-ink-500 mb-6 max-w-md leading-relaxed">{description}</p>
      )}
      {action}
    </div>
  );
};
