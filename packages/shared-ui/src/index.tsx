
import type { ButtonHTMLAttributes } from 'react';
export function Button({
  className = '',
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}
