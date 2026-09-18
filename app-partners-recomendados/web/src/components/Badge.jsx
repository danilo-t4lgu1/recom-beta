// web/src/components/Badge.jsx
import { SparklesIcon } from './Icons.jsx';

/**
 * Pílula de status ou motivo de recomendação elegante e sutil.
 * variants: 'proven' | 'fabric' | 'color' | 'success' | 'warning' | 'danger' | 'neutral'
 */
export function Badge({ variant = 'neutral', children, icon: CustomIcon, className = '' }) {
  if (variant === 'proven') {
    return (
      <span className={`badge badge-proven ${className}`}>
        <SparklesIcon size={12} className="badge-icon" />
        <span>{children || 'Look Comprovado'}</span>
      </span>
    );
  }

  if (variant === 'fabric') {
    return (
      <span className={`badge badge-fabric ${className}`}>
        {CustomIcon && <CustomIcon size={12} className="badge-icon" />}
        <span>{children || 'Cor + Tecido'}</span>
      </span>
    );
  }

  if (variant === 'color') {
    return (
      <span className={`badge badge-color ${className}`}>
        {CustomIcon && <CustomIcon size={12} className="badge-icon" />}
        <span>{children || 'Cor + Estoque'}</span>
      </span>
    );
  }

  return (
    <span className={`badge badge-${variant} ${className}`}>
      {CustomIcon && <CustomIcon size={12} className="badge-icon" />}
      <span>{children}</span>
    </span>
  );
}
