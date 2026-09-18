// web/src/components/Card.jsx
export function Card({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = '',
  footer,
}) {
  return (
    <div className={`recom-card ${className}`}>
      {(title || subtitle || Icon || action) && (
        <div className="recom-card-header">
          <div className="recom-card-title-group">
            {Icon && (
              <div className="recom-card-icon-wrap">
                <Icon size={16} />
              </div>
            )}
            <div>
              {title && <h3 className="recom-card-title">{title}</h3>}
              {subtitle && <p className="recom-card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="recom-card-action">{action}</div>}
        </div>
      )}
      <div className="recom-card-body">{children}</div>
      {footer && <div className="recom-card-footer">{footer}</div>}
    </div>
  );
}
