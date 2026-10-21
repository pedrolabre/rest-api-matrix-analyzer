import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatrixFiltersBar from '../../src/components/endpoint-matrix/MatrixFiltersBar.jsx';
import { CELL_STATUS } from '../../src/types/domain-contracts.js';

describe('MatrixFiltersBar', () => {
  it('renderiza o campo de busca textual e todos os botoes de filtro por status', () => {
    render(
      <MatrixFiltersBar
        searchQuery=""
        statusFilter="ALL"
        totalResources={10}
        filteredResourcesCount={10}
      />
    );

    expect(screen.getByTestId('matrix-filters-bar')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-filter-btn-ALL')).toBeInTheDocument();
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.CONNECTED}`)).toBeInTheDocument();
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.BACKEND_ONLY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.FRONTEND_ONLY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.NOT_DECLARED}`)).toBeInTheDocument();
  });

  it('dispara onSearchChange ao digitar no campo de busca', () => {
    const handleSearchChange = vi.fn();
    render(
      <MatrixFiltersBar
        searchQuery=""
        onSearchChange={handleSearchChange}
      />
    );

    const input = screen.getByTestId('matrix-search-input');
    fireEvent.change(input, { target: { value: '/api/users' } });

    expect(handleSearchChange).toHaveBeenCalledWith('/api/users');
  });

  it('exibe botao de limpar busca quando houver texto e dispara onSearchChange com string vazia', () => {
    const handleSearchChange = vi.fn();
    render(
      <MatrixFiltersBar
        searchQuery="/api/users"
        onSearchChange={handleSearchChange}
      />
    );

    const clearBtn = screen.getByTestId('matrix-clear-search-btn');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(handleSearchChange).toHaveBeenCalledWith('');
  });

  it('dispara onStatusFilterChange ao clicar em cada seletor de status semantico', () => {
    const handleStatusFilterChange = vi.fn();
    render(
      <MatrixFiltersBar
        statusFilter="ALL"
        onStatusFilterChange={handleStatusFilterChange}
      />
    );

    fireEvent.click(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.CONNECTED}`));
    expect(handleStatusFilterChange).toHaveBeenCalledWith(CELL_STATUS.CONNECTED);

    fireEvent.click(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.BACKEND_ONLY}`));
    expect(handleStatusFilterChange).toHaveBeenCalledWith(CELL_STATUS.BACKEND_ONLY);

    fireEvent.click(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.FRONTEND_ONLY}`));
    expect(handleStatusFilterChange).toHaveBeenCalledWith(CELL_STATUS.FRONTEND_ONLY);

    fireEvent.click(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.NOT_DECLARED}`));
    expect(handleStatusFilterChange).toHaveBeenCalledWith(CELL_STATUS.NOT_DECLARED);
  });

  it('exibe contagens corretas para cada categoria nos badges', () => {
    const counts = {
      totalOperations: 25,
      connected: 12,
      backendOnly: 4,
      frontendOnly: 2,
      notDeclared: 7,
    };

    render(
      <MatrixFiltersBar
        counts={counts}
        totalResources={5}
        filteredResourcesCount={5}
      />
    );

    expect(screen.getByTestId('matrix-filter-btn-ALL')).toHaveTextContent('25');
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.CONNECTED}`)).toHaveTextContent('12');
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.BACKEND_ONLY}`)).toHaveTextContent('4');
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.FRONTEND_ONLY}`)).toHaveTextContent('2');
    expect(screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.NOT_DECLARED}`)).toHaveTextContent('7');
  });

  it('exibe contagem de recursos filtrados vs total e botao de limpar filtros quando ativo', () => {
    const handleClearFilters = vi.fn();
    render(
      <MatrixFiltersBar
        searchQuery="users"
        statusFilter={CELL_STATUS.CONNECTED}
        totalResources={15}
        filteredResourcesCount={3}
        onClearFilters={handleClearFilters}
      />
    );

    const summaryText = screen.getByText(/Exibindo/i);
    expect(summaryText).toBeInTheDocument();
    expect(summaryText).toHaveTextContent('Exibindo 3 de 15 recursos');

    const resetBtn = screen.getByTestId('matrix-reset-filters-btn');
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(handleClearFilters).toHaveBeenCalledTimes(1);
  });
});
