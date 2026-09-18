// web/src/components/Pagination.jsx
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';

export function Pagination({ page, totalPages, onPageChange, totalItems, limit }) {
  if (totalPages <= 1) return null;

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);

  return (
    <div className="recom-pagination">
      <div className="pagination-info text-muted font-mono">
        Mostrando {startItem}–{endItem} de {totalItems} itens
      </div>
      <div className="pagination-controls">
        <button
          type="button"
          className="recom-btn-icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeftIcon size={14} />
        </button>
        <span className="pagination-current font-mono">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="recom-btn-icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          title="Próxima página"
          aria-label="Próxima página"
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}
