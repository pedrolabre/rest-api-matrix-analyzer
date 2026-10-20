import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditHistoryList from '../../src/components/project-import/AuditHistoryList.jsx';

describe('AuditHistoryList', () => {
  const sampleAudits = [
    {
      id: 1,
      projectName: 'sistema-ecommerce',
      createdAt: '2026-11-05T10:30:00.000Z',
      filesCount: 42,
      routesCount: 18,
      callsCount: 24,
    },
    {
      id: 2,
      projectName: 'api-gateway',
      createdAt: '2026-11-04T15:00:00.000Z',
      filesCount: 12,
      routesCount: 8,
      callsCount: 5,
    },
  ];

  let mockStorageService;

  beforeEach(() => {
    mockStorageService = {
      getRecentAudits: vi.fn().mockResolvedValue([...sampleAudits]),
      deleteAudit: vi.fn().mockResolvedValue(true),
    };
  });

  it('renderiza o estado de carregamento e depois a listagem de auditorias salvas', async () => {
    render(<AuditHistoryList storageService={mockStorageService} onSelectAudit={vi.fn()} />);

    expect(
      screen.getByText('Consultando banco de dados IndexedDB...')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('sistema-ecommerce')).toBeInTheDocument();
      expect(screen.getByText('api-gateway')).toBeInTheDocument();
    });

    expect(screen.getByText('2 registros')).toBeInTheDocument();
    expect(screen.getByText('18 rotas')).toBeInTheDocument();
    expect(screen.getByText('24 chamadas')).toBeInTheDocument();
    expect(screen.getByText('42 arquivos')).toBeInTheDocument();
  });

  it('exibe mensagem amigavel de estado vazio quando nao existem auditorias salvas', async () => {
    mockStorageService.getRecentAudits.mockResolvedValue([]);

    render(<AuditHistoryList storageService={mockStorageService} onSelectAudit={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText('Nenhuma auditoria registrada no armazenamento local.')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('0 registros')).toBeInTheDocument();
  });

  it('dispara onSelectAudit ao clicar no botao de carregar uma auditoria', async () => {
    const onSelectAudit = vi.fn();
    render(<AuditHistoryList storageService={mockStorageService} onSelectAudit={onSelectAudit} />);

    await waitFor(() => {
      expect(screen.getByText('sistema-ecommerce')).toBeInTheDocument();
    });

    const carregarBtns = screen.getAllByRole('button', { name: /Abrir auditoria do projeto/i });
    fireEvent.click(carregarBtns[0]);

    expect(onSelectAudit).toHaveBeenCalledWith(sampleAudits[0]);
  });

  it('exclui a auditoria chamando deleteAudit e atualiza a interface', async () => {
    render(<AuditHistoryList storageService={mockStorageService} onSelectAudit={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('sistema-ecommerce')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: 'Excluir auditoria sistema-ecommerce' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockStorageService.deleteAudit).toHaveBeenCalledWith(1);
      expect(screen.queryByText('sistema-ecommerce')).not.toBeInTheDocument();
      expect(screen.getByText('api-gateway')).toBeInTheDocument();
    });
  });

  it('exibe mensagem de erro se a consulta inicial ao storage falhar', async () => {
    mockStorageService.getRecentAudits.mockRejectedValue(new Error('IndexedDB bloqueado'));

    render(<AuditHistoryList storageService={mockStorageService} onSelectAudit={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('IndexedDB bloqueado')).toBeInTheDocument();
    });
  });

  it('recarrega auditorias quando a prop refreshTrigger mudar', async () => {
    const { rerender } = render(
      <AuditHistoryList
        storageService={mockStorageService}
        onSelectAudit={vi.fn()}
        refreshTrigger={1}
      />
    );

    await waitFor(() => {
      expect(mockStorageService.getRecentAudits).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AuditHistoryList
        storageService={mockStorageService}
        onSelectAudit={vi.fn()}
        refreshTrigger={2}
      />
    );

    await waitFor(() => {
      expect(mockStorageService.getRecentAudits).toHaveBeenCalledTimes(2);
    });
  });
});
