import React from 'react';

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'critico'
  | 'attenzione'
  | 'adeguato'
  | 'eccellente'
  | 'nd';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  muted: 'bg-muted text-muted-foreground',
  critico: 'judgment-critico',
  attenzione: 'judgment-attenzione',
  adeguato: 'judgment-adeguato',
  eccellente: 'judgment-eccellente',
  nd: 'judgment-nd',
};

const SIZE_CLASSES = {
  sm: 'text-2xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
};

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md font-600 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
