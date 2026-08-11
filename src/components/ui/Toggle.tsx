'use client';
import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  size = 'md',
}: ToggleProps) {
  const trackSize = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
  const thumbSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const thumbTranslate = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <label
      className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={`${trackSize} rounded-full transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-border'}`}
        />
        <div
          className={`
            absolute top-0.5 left-0.5 ${thumbSize} rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${checked ? thumbTranslate : 'translate-x-0'}
          `}
        />
      </div>
      {label && <span className="text-sm font-500 text-foreground">{label}</span>}
    </label>
  );
}
