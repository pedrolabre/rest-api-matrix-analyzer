import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '../../src/pages/HomePage.jsx';
import * as zipExtractor from '../../src/parsers/zip-extractor.js';

describe('HomePage', () => {
  let mockHook;
  let mockStorageService;

  beforeEach(() => {
    mockHook = {
      isAnalyzing: false,
      progress: { percent: 0, currentFile: '', processedFiles: 0, totalFiles: 0 },
      startAnalysis: vi.fn(),
      cancelAnalysis: vi.fn(),
      reset: vi.fn(),
      error: null,
      matrixResult: null,
      issues: null,
      routes: null,
      calls: null,
      summary: null,
    };

    mockStorageService = {
      getRecentAudits: vi.fn().mockResolvedValue([
        {
          id: 10,
          projectName: 'crm-backend',
          createdAt: '2026-11-05T08:00:00.000Z',
          filesCount: 15,
          routesCount: 6,
          callsCount: 9,
        },
      ]),
      getAuditById: vi.fn().mockResolvedValue({
        id: 10,
        projectName: 'crm-backend',
        routes: [{ canonicalPath: '/api/clients', method: 'GET' }],
        calls: [{ canonicalPath: '/api/clients', method: 'GET' }],
      }),
      saveAuditResult: vi.fn().mockResolvedValue(11),
      deleteAudit: vi.fn().mockResolvedValue(true),
    };
  });

  it('renderiza cabecalho, pilares estrategicos e componentes de importacao e historico', async () => {
    render(
      <HomePage
        analysisHook={mockHook}
        storageService={mockStorageService}
      />
    );

    expect(screen.getByText('rest-api-matrix-analyzer')).toBeInTheDocument();
    expect(
      screen.getByText('Mapeie a comunicacao entre Frontend e Backend em segundos')
    ).toBeInTheDocument();

    expect(screen.getByText('Local-First e Zero-Cloud')).toBeInTheDocument();
    expect(screen.getByText('AST Real com Babel')).toBeInTheDocument();
    expect(screen.getByText('Matriz Visual de Cobertura')).toBeInTheDocument();
    expect(screen.getByText('Auditoria de Anomalias')).toBeInTheDocument();

    expect(screen.getByTestId('project-import-card')).toBeInTheDocument();
    expect(screen.getByTestId('audit-history-list')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('crm-backend')).toBeInTheDocument();
    });
  });

  it('dispara startAnalysis no hook ao selecionar arquivos no ProjectImportCard', async () => {
    render(
      <HomePage
        analysisHook={mockHook}
        storageService={mockStorageService}
      />
    );

    vi.spyOn(zipExtractor, 'isZipFile').mockReturnValue(true);
    vi.spyOn(zipExtractor, 'extractProjectFromZip').mockResolvedValue([
      { relativePath: 'src/app.js' },
    ]);

    const zipInput = screen.getByTestId('zip-file-input');
    const mockFile = new File(['dados'], 'app.zip', { type: 'application/zip' });

    fireEvent.change(zipInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(mockHook.startAnalysis).toHaveBeenCalledWith(
        [{ relativePath: 'src/app.js' }],
        'app'
      );
    });
  });

  it('carrega auditoria do historico ao clicar no botao de carregar e aciona onLoadAudit', async () => {
    const onLoadAudit = vi.fn();
    render(
      <HomePage
        analysisHook={mockHook}
        storageService={mockStorageService}
        onLoadAudit={onLoadAudit}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('crm-backend')).toBeInTheDocument();
    });

    const carregarBtn = screen.getByRole('button', { name: /Abrir auditoria do projeto crm-backend/i });
    fireEvent.click(carregarBtn);

    await waitFor(() => {
      expect(mockStorageService.getAuditById).toHaveBeenCalledWith(10);
      expect(onLoadAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          projectName: 'crm-backend',
        })
      );
    });
  });

  it('exibe estado de analise ativa quando hook.isAnalyzing for true e permite cancelar', async () => {
    mockHook.isAnalyzing = true;
    mockHook.progress = {
      percent: 50,
      currentFile: 'src/routes/api.js',
      processedFiles: 5,
      totalFiles: 10,
    };

    render(
      <HomePage
        analysisHook={mockHook}
        storageService={mockStorageService}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('crm-backend')).toBeInTheDocument();
    });

    expect(screen.getByText('Analisando codigo-fonte em background...')).toBeInTheDocument();
    expect(screen.getByText('Arquivo: src/routes/api.js')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelBtn);
    expect(mockHook.cancelAnalysis).toHaveBeenCalled();
  });
});
