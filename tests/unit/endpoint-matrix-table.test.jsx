import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import EndpointMatrixTable from '../../src/components/endpoint-matrix/EndpointMatrixTable.jsx';
import { matchRoutesAndCalls } from '../../src/analyzers/route-matcher.js';
import { CELL_STATUS } from '../../src/types/domain-contracts.js';

describe('EndpointMatrixTable', () => {
  const sampleRoutes = [
    { method: 'GET', rawPath: '/api/users', filePath: 'routes/users.js', line: 10 },
    { method: 'POST', rawPath: '/api/users', filePath: 'routes/users.js', line: 20 },
    { method: 'DELETE', rawPath: '/api/users/:id', filePath: 'routes/users.js', line: 30 },
    { method: 'GET', rawPath: '/api/auth/login', filePath: 'routes/auth.js', line: 5 },
  ];

  const sampleCalls = [
    { method: 'GET', rawUrl: '/api/users', filePath: 'src/api/user.js', line: 15 },
    { method: 'POST', rawUrl: '/api/users', filePath: 'src/api/user.js', line: 25 },
    { method: 'GET', rawUrl: '/api/profile', filePath: 'src/pages/Profile.jsx', line: 12 },
  ];

  const sampleMatrixResult = matchRoutesAndCalls(sampleRoutes, sampleCalls);

  it('renderiza cabecalho fixo com recurso e as colunas dos 5 verbos REST', () => {
    render(<EndpointMatrixTable matrixResult={sampleMatrixResult} />);

    expect(screen.getByTestId('endpoint-matrix-table')).toBeInTheDocument();
    expect(screen.getByText(/Recurso \/ Rota Canonica/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /GET/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /POST/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /PUT/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /PATCH/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /DELETE/i })).toBeInTheDocument();
  });

  it('renderiza os recursos ordenados alfabeticamente', () => {
    render(<EndpointMatrixTable matrixResult={sampleMatrixResult} />);

    // Recursos esperados: /api/auth/login, /api/profile, /api/users, /api/users/:param
    const rows = screen.getAllByTestId(/^matrix-row-/);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute('data-testid', 'matrix-row-/api/auth/login');
    expect(rows[1]).toHaveAttribute('data-testid', 'matrix-row-/api/profile');
    expect(rows[2]).toHaveAttribute('data-testid', 'matrix-row-/api/users');
    expect(rows[3]).toHaveAttribute('data-testid', 'matrix-row-/api/users/:param');
  });

  it('permite filtrar recursos textualmente pela barra de busca interna', () => {
    render(<EndpointMatrixTable matrixResult={sampleMatrixResult} />);

    const searchInput = screen.getByTestId('matrix-search-input');
    fireEvent.change(searchInput, { target: { value: 'users' } });

    const rows = screen.getAllByTestId(/^matrix-row-/);
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId('matrix-row-/api/users')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-row-/api/users/:param')).toBeInTheDocument();
    expect(screen.queryByTestId('matrix-row-/api/auth/login')).not.toBeInTheDocument();
  });

  it('permite filtrar recursos por status semantico', () => {
    render(<EndpointMatrixTable matrixResult={sampleMatrixResult} />);

    // Filtra apenas celulas FRONTEND_ONLY (/api/profile tem GET FRONTEND_ONLY)
    const frontendFilterBtn = screen.getByTestId(`matrix-filter-btn-${CELL_STATUS.FRONTEND_ONLY}`);
    fireEvent.click(frontendFilterBtn);

    const rows = screen.getAllByTestId(/^matrix-row-/);
    expect(rows).toHaveLength(1);
    expect(screen.getByTestId('matrix-row-/api/profile')).toBeInTheDocument();
  });

  it('dispara onSelectCell ao clicar em uma celula de operacao', () => {
    const handleSelectCell = vi.fn();
    render(
      <EndpointMatrixTable
        matrixResult={sampleMatrixResult}
        onSelectCell={handleSelectCell}
      />
    );

    const getCellBadge = screen.getByTestId('matrix-cell-GET-/api/users');
    fireEvent.click(getCellBadge);

    expect(handleSelectCell).toHaveBeenCalledTimes(1);
    const selectedArg = handleSelectCell.mock.calls[0][0];
    expect(selectedArg.canonicalPath).toBe('/api/users');
    expect(selectedArg.method).toBe('GET');
    expect(selectedArg.status).toBe(CELL_STATUS.CONNECTED);
    expect(selectedArg.consumersCount).toBe(1);
  });

  it('destaca a celula e a linha ativa quando selectedCell for fornecido', () => {
    const targetCell = sampleMatrixResult.matrix['/api/users']['GET'];

    render(
      <EndpointMatrixTable
        matrixResult={sampleMatrixResult}
        selectedCell={targetCell}
      />
    );

    const row = screen.getByTestId('matrix-row-/api/users');
    expect(row.className).toContain('border-l-2 border-emerald-500');

    const badge = screen.getByTestId('matrix-cell-GET-/api/users');
    expect(badge).toHaveAttribute('aria-pressed', 'true');
    expect(badge.className).toContain('ring-2 ring-emerald-400');
  });

  it('opera em modo controlado com searchQuery e statusFilter externos', () => {
    const handleSearchChange = vi.fn();
    const handleStatusFilterChange = vi.fn();

    render(
      <EndpointMatrixTable
        matrixResult={sampleMatrixResult}
        searchQuery="auth"
        onSearchChange={handleSearchChange}
        statusFilter="ALL"
        onStatusFilterChange={handleStatusFilterChange}
      />
    );

    const rows = screen.getAllByTestId(/^matrix-row-/);
    expect(rows).toHaveLength(1);
    expect(screen.getByTestId('matrix-row-/api/auth/login')).toBeInTheDocument();

    const searchInput = screen.getByTestId('matrix-search-input');
    fireEvent.change(searchInput, { target: { value: 'profile' } });
    expect(handleSearchChange).toHaveBeenCalledWith('profile');
  });

  it('renderiza estado vazio com mensagem e botao para limpar filtros quando nada for encontrado', () => {
    render(<EndpointMatrixTable matrixResult={sampleMatrixResult} />);

    const searchInput = screen.getByTestId('matrix-search-input');
    fireEvent.change(searchInput, { target: { value: 'inexistente' } });

    expect(screen.getByText(/Nenhum endpoint encontrado com os criterios selecionados/i)).toBeInTheDocument();

    const resetBtn = screen.getByTestId('matrix-empty-reset-btn');
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);

    const rows = screen.getAllByTestId(/^matrix-row-/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('trata defensivamente matrixResult nulo ou vazio', () => {
    const { container } = render(<EndpointMatrixTable matrixResult={null} />);
    expect(container).toBeInTheDocument();
    expect(screen.getByText(/Nenhum endpoint encontrado com os criterios selecionados/i)).toBeInTheDocument();
  });
});
