import React from 'react';
import { CELL_STATUS } from '../../types/domain-contracts.js';

const STATUS_CONFIGS = Object.freeze({
  [CELL_STATUS.CONNECTED]: {
    label: 'Conectado',
    symbol: '●',
    badgeClass:
      'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:border-emerald-400/80 hover:bg-emerald-900/50',
    selectedClass: 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 shadow-lg shadow-emerald-950/60',
    indicatorClass: 'bg-emerald-400 shadow-sm shadow-emerald-400/50',
    ariaStatusText: 'Conectado (em uso ativo)',
  },
  [CELL_STATUS.BACKEND_ONLY]: {
    label: 'Apenas Backend',
    symbol: '○',
    badgeClass:
      'bg-sky-950/60 text-sky-300 border-sky-500/40 hover:border-sky-400/80 hover:bg-sky-900/50',
    selectedClass: 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-950 shadow-lg shadow-sky-950/60',
    indicatorClass: 'border-2 border-sky-400 bg-transparent',
    ariaStatusText: 'Apenas Backend (sem consumidor interno)',
  },
  [CELL_STATUS.FRONTEND_ONLY]: {
    label: 'Apenas Frontend',
    symbol: '×',
    badgeClass:
      'bg-amber-950/60 text-amber-300 border-amber-500/40 hover:border-amber-400/80 hover:bg-amber-900/50',
    selectedClass: 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-lg shadow-amber-950/60',
    indicatorClass: 'text-amber-400 font-bold',
    ariaStatusText: 'Apenas Frontend (sem rota no servidor)',
  },
  [CELL_STATUS.NOT_DECLARED]: {
    label: 'Nao Declarado',
    symbol: '—',
    badgeClass:
      'bg-slate-950/40 text-slate-600 border-slate-800/40 hover:text-slate-400 hover:border-slate-700/60 hover:bg-slate-900/40',
    selectedClass: 'ring-2 ring-slate-400 ring-offset-2 ring-offset-slate-950',
    indicatorClass: '',
    ariaStatusText: 'Nao Declarado',
  },
  [CELL_STATUS.INCONCLUSIVE]: {
    label: 'Inconclusivo',
    symbol: '?',
    badgeClass:
      'bg-purple-950/60 text-purple-300 border-purple-500/40 hover:border-purple-400/80 hover:bg-purple-900/50',
    selectedClass: 'ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-950 shadow-lg shadow-purple-950/60',
    indicatorClass: 'bg-purple-400',
    ariaStatusText: 'Inconclusivo',
  },
});

/**
 * Componente visual de celula de operacao REST (recurso x verbo HTTP).
 *
 * Renderiza uma pilula semantica com cores tecnicas, icone sutil de estado
 * e contagem de consumidores, alem de responder a eventos de selecao para inspecao.
 *
 * @param {object} props
 * @param {object} props.cell Celula matricial contendo { canonicalPath, method, status, consumersCount, routes, calls }
 * @param {boolean} [props.isSelected=false] Indica se a celula esta ativa na inspecao
 * @param {Function} [props.onClick] Callback invocado ao selecionar a celula
 * @param {string} [props.className] Classes CSS adicionais
 */
export default function MatrixCellBadge({
  cell,
  isSelected = false,
  onClick,
  className = '',
}) {
  if (!cell) {
    return (
      <div className="flex items-center justify-center p-2 text-slate-700 select-none">
        —
      </div>
    );
  }

  const { canonicalPath = '', method = '', status = CELL_STATUS.NOT_DECLARED, consumersCount = 0 } = cell;
  const config = STATUS_CONFIGS[status] || STATUS_CONFIGS[CELL_STATUS.NOT_DECLARED];

  const handleClick = (e) => {
    if (typeof onClick === 'function') {
      onClick(cell, e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  const isNotDeclared = status === CELL_STATUS.NOT_DECLARED;

  const ariaLabel = isNotDeclared
    ? `${method} ${canonicalPath}: ${config.ariaStatusText}`
    : `${method} ${canonicalPath}: ${config.ariaStatusText}, ${consumersCount} consumidor(es)`;

  const tooltipTitle = isNotDeclared
    ? `${method} ${canonicalPath} - Operacao nao declarada`
    : `${method} ${canonicalPath}\nStatus: ${config.label}\nConsumidores: ${consumersCount} chamada(s)\nRotas backend: ${cell.routes?.length || 0}`;

  return (
    <button
      type="button"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      title={tooltipTitle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={`matrix-cell-${method}-${canonicalPath}`}
      data-status={status}
      data-method={method}
      data-path={canonicalPath}
      className={`group relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-mono transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-950 focus:ring-slate-400 select-none w-full min-w-[70px] ${
        config.badgeClass
      } ${isSelected ? config.selectedClass : ''} ${className}`}
    >
      {isNotDeclared ? (
        <span className="text-slate-600 font-bold tracking-widest leading-none select-none">
          —
        </span>
      ) : (
        <>
          <span
            className="flex items-center justify-center w-2 h-2 shrink-0 select-none"
            aria-hidden="true"
          >
            {status === CELL_STATUS.CONNECTED && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80" />
            )}
            {status === CELL_STATUS.BACKEND_ONLY && (
              <span className="w-1.5 h-1.5 rounded-full border border-sky-400 bg-transparent" />
            )}
            {status === CELL_STATUS.FRONTEND_ONLY && (
              <span className="text-[11px] font-bold leading-none text-amber-400">
                ×
              </span>
            )}
            {status === CELL_STATUS.INCONCLUSIVE && (
              <span className="text-[10px] font-bold leading-none text-purple-400">
                ?
              </span>
            )}
          </span>

          <span className="font-semibold tabular-nums leading-none">
            {consumersCount}
          </span>
        </>
      )}
    </button>
  );
}
