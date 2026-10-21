import React from 'react';
import { Search, X, RotateCcw, Filter } from 'lucide-react';
import { CELL_STATUS } from '../../types/domain-contracts.js';

const FILTER_ITEMS = [
  {
    id: 'ALL',
    label: 'Todos',
    statusKey: null,
    colorClasses: {
      active: 'bg-slate-800 text-white border-slate-600 shadow-sm',
      inactive: 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/50',
      badge: 'bg-slate-700/60 text-slate-200',
    },
  },
  {
    id: CELL_STATUS.CONNECTED,
    label: 'Conectados',
    statusKey: 'connected',
    colorClasses: {
      active: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950/50',
      inactive: 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-emerald-300 hover:border-emerald-500/30',
      badge: 'bg-emerald-900/60 text-emerald-300',
    },
  },
  {
    id: CELL_STATUS.BACKEND_ONLY,
    label: 'Apenas Backend',
    statusKey: 'backendOnly',
    colorClasses: {
      active: 'bg-sky-950/80 text-sky-300 border-sky-500/60 shadow-sm shadow-sky-950/50',
      inactive: 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-sky-300 hover:border-sky-500/30',
      badge: 'bg-sky-900/60 text-sky-300',
    },
  },
  {
    id: CELL_STATUS.FRONTEND_ONLY,
    label: 'Apenas Frontend',
    statusKey: 'frontendOnly',
    colorClasses: {
      active: 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-950/50',
      inactive: 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-amber-300 hover:border-amber-500/30',
      badge: 'bg-amber-900/60 text-amber-300',
    },
  },
  {
    id: CELL_STATUS.NOT_DECLARED,
    label: 'Nao Declarados',
    statusKey: 'notDeclared',
    colorClasses: {
      active: 'bg-slate-800 text-slate-200 border-slate-600 shadow-sm',
      inactive: 'bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700/40',
      badge: 'bg-slate-800 text-slate-400',
    },
  },
];

/**
 * Barra de busca e filtros para a grade matricial REST.
 *
 * Provê busca textual em tempo real por caminho ou recurso canônico
 * e seletores de status semântico com contadores dinâmicos.
 *
 * @param {object} props
 * @param {string} props.searchQuery Termo de busca digitado
 * @param {Function} props.onSearchChange Callback ao alterar o termo de busca
 * @param {string} props.statusFilter Filtro de status ativo ('ALL' ou chave de CELL_STATUS)
 * @param {Function} props.onStatusFilterChange Callback ao alterar o filtro de status
 * @param {object} [props.counts] Objeto com contagens por categoria
 * @param {number} [props.totalResources=0] Quantidade total de recursos da matriz
 * @param {number} [props.filteredResourcesCount=0] Quantidade de recursos visíveis após filtros
 * @param {Function} [props.onClearFilters] Callback para redefinir busca e filtros para o padrão
 * @param {string} [props.className] Classes adicionais de estilização
 */
export default function MatrixFiltersBar({
  searchQuery = '',
  onSearchChange,
  statusFilter = 'ALL',
  onStatusFilterChange,
  counts = {},
  totalResources = 0,
  filteredResourcesCount = 0,
  onClearFilters,
  className = '',
}) {
  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'ALL';

  const handleSearchInput = (e) => {
    if (typeof onSearchChange === 'function') {
      onSearchChange(e.target.value);
    }
  };

  const handleClearSearch = () => {
    if (typeof onSearchChange === 'function') {
      onSearchChange('');
    }
  };

  const handleStatusClick = (filterId) => {
    if (typeof onStatusFilterChange === 'function') {
      onStatusFilterChange(filterId);
    }
  };

  const getCountForFilter = (item) => {
    if (item.id === 'ALL') {
      return counts.totalOperations ?? counts.total ?? totalResources;
    }
    if (item.statusKey && counts[item.statusKey] !== undefined) {
      return counts[item.statusKey];
    }
    if (counts[item.id] !== undefined) {
      return counts[item.id];
    }
    return 0;
  };

  return (
    <div
      className={`flex flex-col gap-3 p-4 bg-slate-900/80 border border-slate-800/80 rounded-xl backdrop-blur-md ${className}`}
      data-testid="matrix-filters-bar"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Campo de Busca Textual */}
        <div className="relative flex-1 min-w-[280px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInput}
            placeholder="Buscar por rota ou recurso (ex: /api/users, :param)..."
            aria-label="Buscar recurso por caminho ou expressao"
            data-testid="matrix-search-input"
            className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
          />
          {searchQuery.trim().length > 0 && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Limpar termo de busca"
              data-testid="matrix-clear-search-btn"
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Resumo e Acao de Reset */}
        <div className="flex items-center gap-3 self-end lg:self-auto shrink-0 text-xs">
          <span className="text-slate-400 font-mono">
            Exibindo{' '}
            <strong className="text-slate-200 font-semibold tabular-nums">
              {filteredResourcesCount}
            </strong>{' '}
            de{' '}
            <strong className="text-slate-400 font-semibold tabular-nums">
              {totalResources}
            </strong>{' '}
            recursos
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              data-testid="matrix-reset-filters-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700/70 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-colors text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Botoes de Selecao por Status Semantico */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
        <span className="text-xs text-slate-500 font-medium mr-1 shrink-0 flex items-center gap-1">
          <Filter className="w-3 h-3" />
          Filtrar:
        </span>
        {FILTER_ITEMS.map((item) => {
          const isActive = statusFilter === item.id;
          const count = getCountForFilter(item);
          const color = item.colorClasses;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleStatusClick(item.id)}
              aria-pressed={isActive}
              data-testid={`matrix-filter-btn-${item.id}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all shrink-0 select-none ${
                isActive ? color.active : color.inactive
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full tabular-nums font-semibold ${color.badge}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
