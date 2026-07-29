import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'accent' | 'danger' | 'danger-ghost';
type Size = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: '',
  ghost: 'btn--ghost',
  accent: 'btn--accent',
  danger: 'btn--danger',
  'danger-ghost': 'btn--danger-ghost',
};

const sizeClass: Record<Size, string> = {
  xs: 'btn--xs',
  sm: 'btn--sm',
  md: '',
};

export function Button({
  variant = 'ghost',
  size = 'sm',
  block = false,
  icon = false,
  className = '',
  ...props
}: ButtonProps) {
  const classes = [
    'btn',
    variantClass[variant],
    sizeClass[size],
    block && 'btn--block',
    icon && 'btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button className={classes} {...props} />;
}
