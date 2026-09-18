// web/src/components/Skeleton.jsx
export function Skeleton({ width = '100%', height = '1rem', className = '', style = {} }) {
  return (
    <div
      className={`recom-skeleton ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="recom-card">
      <div className="recom-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton width="40%" height="0.85rem" />
        <Skeleton width="70%" height="1.75rem" />
        <Skeleton width="90%" height="0.8rem" />
      </div>
    </div>
  );
}
