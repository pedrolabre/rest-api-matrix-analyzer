import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatrixCellBadge from '../../src/components/endpoint-matrix/MatrixCellBadge.jsx';
import { CELL_STATUS, createMatrixCell } from '../../src/types/domain-contracts.js';

describe('MatrixCellBadge', () => {
  it('renderiza com seguranca traco quando a celula for nula ou indefinida', () => {
    const { container } = render(<MatrixCellBadge cell={null} />);
    expect(container.textContent).toContain('—');
  });

  it('renderiza estado CONNECTED com indicador verde esmeralda e contagem de consumidores', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/users',
      method: 'GET',
      status: CELL_STATUS.CONNECTED,
      consumersCount: 3,
      routes: [{ method: 'GET', canonicalPath: '/api/users', filePath: 'routes.js', line: 10 }],
      calls: [{ method: 'GET', canonicalPath: '/api/users', filePath: 'api.js', line: 5 }],
    });

    render(<MatrixCellBadge cell={cell} />);

    const badge = screen.getByRole('button', { name: /GET \/api\/users: Conectado/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', CELL_STATUS.CONNECTED);
    expect(badge).toHaveAttribute('data-method', 'GET');
    expect(badge).toHaveAttribute('data-path', '/api/users');
    expect(badge.textContent).toContain('3');
    expect(badge.className).toContain('text-emerald-300');
  });

  it('renderiza estado BACKEND_ONLY com indicador azul celeste e contador zero', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/users/:param',
      method: 'DELETE',
      status: CELL_STATUS.BACKEND_ONLY,
      consumersCount: 0,
      routes: [{ method: 'DELETE', canonicalPath: '/api/users/:param', filePath: 'users.js', line: 40 }],
      calls: [],
    });

    render(<MatrixCellBadge cell={cell} />);

    const badge = screen.getByRole('button', { name: /DELETE \/api\/users\/:param: Apenas Backend/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', CELL_STATUS.BACKEND_ONLY);
    expect(badge.textContent).toContain('0');
    expect(badge.className).toContain('text-sky-300');
  });

  it('renderiza estado FRONTEND_ONLY com indicador ambar e contagem de chamadas sem backend', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/broken',
      method: 'POST',
      status: CELL_STATUS.FRONTEND_ONLY,
      consumersCount: 2,
      routes: [],
      calls: [
        { method: 'POST', canonicalPath: '/api/broken', filePath: 'client.js', line: 12 },
        { method: 'POST', canonicalPath: '/api/broken', filePath: 'form.jsx', line: 44 },
      ],
    });

    render(<MatrixCellBadge cell={cell} />);

    const badge = screen.getByRole('button', { name: /POST \/api\/broken: Apenas Frontend/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', CELL_STATUS.FRONTEND_ONLY);
    expect(badge.textContent).toContain('2');
    expect(badge.textContent).toContain('×');
    expect(badge.className).toContain('text-amber-300');
  });

  it('renderiza estado NOT_DECLARED com traco discreto e opacidade reduzida', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/auth/login',
      method: 'DELETE',
      status: CELL_STATUS.NOT_DECLARED,
      consumersCount: 0,
      routes: [],
      calls: [],
    });

    render(<MatrixCellBadge cell={cell} />);

    const badge = screen.getByRole('button', { name: /DELETE \/api\/auth\/login: Nao Declarado/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', CELL_STATUS.NOT_DECLARED);
    expect(badge.textContent).toContain('—');
    expect(badge.className).toContain('text-slate-600');
  });

  it('renderiza estado INCONCLUSIVE com cor purpura', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/dynamic',
      method: 'GET',
      status: CELL_STATUS.INCONCLUSIVE,
      consumersCount: 1,
      routes: [],
      calls: [],
    });

    render(<MatrixCellBadge cell={cell} />);

    const badge = screen.getByRole('button', { name: /GET \/api\/dynamic: Inconclusivo/i });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-status', CELL_STATUS.INCONCLUSIVE);
    expect(badge.textContent).toContain('?');
    expect(badge.className).toContain('text-purple-300');
  });

  it('aplica classes de destaque visual quando isSelected for verdadeiro', () => {
    const cell = createMatrixCell({
      canonicalPath: '/api/products',
      method: 'GET',
      status: CELL_STATUS.CONNECTED,
      consumersCount: 5,
      routes: [],
      calls: [],
    });

    const { rerender } = render(<MatrixCellBadge cell={cell} isSelected={false} />);
    let badge = screen.getByRole('button');
    expect(badge).toHaveAttribute('aria-pressed', 'false');
    expect(badge.className).not.toContain('ring-2 ring-emerald-400');

    rerender(<MatrixCellBadge cell={cell} isSelected={true} />);
    badge = screen.getByRole('button');
    expect(badge).toHaveAttribute('aria-pressed', 'true');
    expect(badge.className).toContain('ring-2 ring-emerald-400');
  });

  it('dispara callback onClick ao clicar na celula', () => {
    const handleClick = vi.fn();
    const cell = createMatrixCell({
      canonicalPath: '/api/orders',
      method: 'POST',
      status: CELL_STATUS.CONNECTED,
      consumersCount: 1,
      routes: [],
      calls: [],
    });

    render(<MatrixCellBadge cell={cell} onClick={handleClick} />);

    const badge = screen.getByRole('button');
    fireEvent.click(badge);

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith(cell, expect.anything());
  });

  it('dispara callback onClick via navegacao por teclado (Enter e Space)', () => {
    const handleClick = vi.fn();
    const cell = createMatrixCell({
      canonicalPath: '/api/orders',
      method: 'PUT',
      status: CELL_STATUS.BACKEND_ONLY,
      consumersCount: 0,
      routes: [],
      calls: [],
    });

    render(<MatrixCellBadge cell={cell} onClick={handleClick} />);

    const badge = screen.getByRole('button');
    fireEvent.keyDown(badge, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(badge, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);

    // Outras teclas nao devem disparar o callback
    fireEvent.keyDown(badge, { key: 'Tab' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });
});
