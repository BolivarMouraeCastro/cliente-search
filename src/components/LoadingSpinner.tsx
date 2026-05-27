'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  const sizeClass = `spinner-${size}`;

  return (
    <div className={`spinner ${sizeClass}`} role="status" aria-label="Carregando">
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
