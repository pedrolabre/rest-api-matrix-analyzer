import React, { useState, useMemo } from 'react';
import { Layers, SearchX } from 'lucide-react';
import { SUPPORTED_HTTP_METHODS, CELL_STATUS } from '../../types/domain-contracts.js';
import MatrixCellBadge from './MatrixCellBadge.jsx';
import MatrixFiltersBar from './MatrixFiltersBar.jsx';

const HTTP_METHOD_COLORS = Object.freeze({
  GET: 'text-sky-400 border-sky-500/20 bg-sky-950/20',
  POST: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20',
  PUT: 'text-amber-400 border-amber-500/20 bg-amber-950/20',
  PATCH: 'text-purple-400 border-purple-500/20 bg-purple-950/20',
  DELETE: 'text-rose-400 border-rose-500/20 bg-rose-950/20',
});

/**
 * Tabela matricial bidimensional de cobertura REST (Recursos vs Metodos HTTP).
 *
 * Renderiza uma grade de alta densidade em Tailwind Dark OLED, cabecalho fixo,
 * ordenacao alfabetica de rotas canonicas, filtros em tempo real e interacao com celulas.
 *
 * @param {object} props
 * @param {object} [props.matrixResult] Objeto retornado pelo matcher de rotas
 * @param {object|null} [props.selectedCell] Celula atualmente selecionada para inspecao
 * @param {Function} [props.onSelectCell] Callback acionado ao clicar em uma celula
 * @param {string} [props.searchQuery] Termo de busca (modo controlado)
 * @param {Function} [props.onSearchChange] Callback ao alterar termo de busca
 * @param {string} [props.statusFilter] Filtro de status semantico (modo controlado)
 * @param {Function} [props.onStatusFilterChange] Callback ao alterar filtro de status
 * @param {string} [props.className] Classes adicionais de estilizacao
 */
export default function EndpointMatrixTable({
  matrixResult,
  selectedCell = null,
  onSelectCell,
  searchQuery: controlledSearchQuery,
  onSearchChange: controlledOnSearchChange,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange: controlledOnStatusFilterChange,
  className = '',
}) {
  // Gerenciamento flexivel para modo controlado ou estado interno
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState('ALL');

  const searchQuery = controlledSearchQuery !== undefined ? controlledSearchQuery : internalSearchQuery;
  const statusFilter = controlledStatusFilter !== undefined ? controlledStatusFilter : internalStatusFilter;

  const handleSearchChange = (query) => {
    if (typeof controlledOnSearchChange === 'function') {
      controlledOnSearchChange(query);
    } else {
      setInternalSearchQuery(query);
    }
  };

  const handleStatusFilterChange = (status) => {
    if (typeof controlledOnStatusFilterChange === 'function') {
      controlledOnStatusFilterChange(status);
    } else {
      setInternalStatusFilter(status);
    }
  };

  const handleClearFilters = () => {
    handleSearchChange('');
    handleStatusFilterChange('ALL');
  };

  const allResources = useMemo(() => {
    if (!matrixResult || !Array.isArray(matrixResult.resources)) {
      return [];
    }
    return [...matrixResult.resources].sort((a, b) => a.localeCompare(b));
  }, [matrixResult]);

  const matrix = matrixResult?.matrix || {};
  const summary = matrixResult?.summary || {};

  // Filtra recursos por texto e por status semantico
  const filteredResources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return allResources.filter((resource) => {
      // Filtro textual por rota/caminho
      if (query.length > 0 && !resource.toLowerCase().includes(query)) {
        return false;
      }

      // Filtro por status semantico (ao menos uma celula no recurso com o status selecionado)
      if (statusFilter !== 'ALL') {
        const resourceMethods = matrix[resource] || {};
        const hasMatchingMethod = SUPPORTED_HTTP_METHODS.some((method) => {
          const cell = resourceMethods[method];
          return cell && cell.status === statusFilter;
        });
        if (!hasMatchingMethod) {
          return false;
        }
      }

      return true;
    });
  }, [allResources, matrix, searchQuery, statusFilter]);

  return (
    <div
      className={`flex flex-col gap-4 w-full ${className}`}
      data-testid="endpoint-matrix-table-container"
    >
      {/* Barra de Busca e Filtros */}
      <MatrixFiltersBar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        counts={summary}
        totalResources={allResources.length}
        filteredResourcesCount={filteredResources.length}
        onClearFilters={handleClearFilters}
      />

      {/* Grade Matricial Responsiva */}
      <div className="w-full overflow-hidden border border-slate-800 rounded-xl bg-slate-950/70 backdrop-blur-md shadow-2xl">
        <div className="overflow-x-auto max-h-[640px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
          <table
            className="w-full text-left border-collapse"
            data-testid="endpoint-matrix-table"
          >
            {/* Cabecalho Fixo */}
            <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
              <tr>
                <th
                  scope="col"
                  className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-400 min-w-[280px]"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Recurso / Rota Canonica</span>
                  </div>
                </th>
                {SUPPORTED_HTTP_METHODS.map((method) => (
                  <th
                    key={method}
                    scope="col"
                    className="py-3 px-2 text-center text-xs font-mono font-bold tracking-wider text-slate-300 min-w-[96px] w-[110px]"
                  >
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold ${
                        HTTP_METHOD_COLORS[method] || 'text-slate-300'
                      }`}
                    >
                      {method}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Linhas de Recursos */}
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {filteredResources.length > 0 ? (
                filteredResources.map((resource) => {
                  const isRowActive =
                    selectedCell && selectedCell.canonicalPath === resource;

                  return (
                    <tr
                      key={resource}
                      data-testid={`matrix-row-${resource}`}
                      className={`transition-colors duration-100 ${
                        isRowActive
                          ? 'bg-slate-800/40 border-l-2 border-emerald-500'
                          : 'hover:bg-slate-900/40'
                      }`}
                    >
                      {/* Nome do Recurso / Caminho Canonico */}
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-200 break-all select-all">
                        <span className="font-semibold text-slate-100">
                          {resource}
                        </span>
                      </td>

                      {/* Celulas dos 5 Metodos HTTP */}
                      {SUPPORTED_HTTP_METHODS.map((method) => {
                        const cell = matrix[resource]?.[method];
                        const isCellSelected =
                          selectedCell &&
                          selectedCell.canonicalPath === resource &&
                          selectedCell.method === method;

                        return (
                          <td
                            key={method}
                            className="py-2 px-2 text-center align-middle"
                          >
                            <MatrixCellBadge
                              cell={cell}
                              isSelected={isCellSelected}
                              onClick={onSelectCell}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                /* Estado Vazio */
                <tr>
                  <td
                    colSpan={SUPPORTED_HTTP_METHODS.length + 1}
                    className="py-16 px-4 text-center text-slate-400"
                  >
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-500">
                        <SearchX className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-medium text-slate-300">
                        Nenhum endpoint encontrado com os criterios selecionados.
                      </p>
                      <p className="text-xs text-slate-500 max-w-md">
                        Tente ajustar o termo de busca ou alternar o filtro de status semantico para visualizar outros recursos da API.
                      </p>
                      {(searchQuery.trim().length > 0 || statusFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          data-testid="matrix-empty-reset-btn"
                          className="mt-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-200 hover:text-white hover:bg-slate-700 transition-colors font-medium"
                        >
                          Limpar Filtros e Restaurar Grade
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
