/**
 * Suite de Testes Unitarios - Web Worker e useProjectAnalysis
 * rest-api-matrix-analyzer
 *
 * Valida o Web Worker de analise em segundo plano e o hook React useProjectAnalysis,
 * cobrindo resolucao de arquivos, processamento em lotes, descarte de AST,
 * mensagens do protocolo, cancelamento atomico, ciclo de vida e tratamento de erros.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  WORKER_MESSAGE_TYPES,
  DEFAULT_BATCH_SIZE,
  resolveFileContent,
  yieldTick,
  runProjectAnalysis,
  handleWorkerMessage,
} from '../../src/workers/project-analysis.worker.js';
import { useProjectAnalysis } from '../../src/hooks/useProjectAnalysis.js';

describe('project-analysis.worker.js (Logica do Worker)', () => {
  it('exporta todos os tipos de mensagem previstos no protocolo', () => {
    expect(WORKER_MESSAGE_TYPES).toEqual({
      START_ANALYSIS: 'START_ANALYSIS',
      PROGRESS_UPDATE: 'PROGRESS_UPDATE',
      ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
      ANALYSIS_ERROR: 'ANALYSIS_ERROR',
      CANCEL_ANALYSIS: 'CANCEL_ANALYSIS',
    });
    expect(DEFAULT_BATCH_SIZE).toBe(10);
  });

  describe('resolveFileContent', () => {
    it('retorna string vazia para entradas nulas ou indefinidas', async () => {
      expect(await resolveFileContent(null)).toBe('');
      expect(await resolveFileContent(undefined)).toBe('');
      expect(await resolveFileContent({})).toBe('');
    });

    it('extrai conteudo a partir da propriedade content', async () => {
      const result = await resolveFileContent({ content: 'const a = 1;' });
      expect(result).toBe('const a = 1;');
    });

    it('extrai conteudo a partir da propriedade text quando string', async () => {
      const result = await resolveFileContent({ text: 'const b = 2;' });
      expect(result).toBe('const b = 2;');
    });

    it('extrai conteudo a partir do metodo text() assincrono', async () => {
      const result = await resolveFileContent({
        text: async () => 'const c = 3;',
      });
      expect(result).toBe('const c = 3;');
    });

    it('extrai conteudo a partir de objeto file com metodo text()', async () => {
      const result = await resolveFileContent({
        file: {
          text: async () => 'const d = 4;',
        },
      });
      expect(result).toBe('const d = 4;');
    });

    it('retorna string vazia se o metodo text() lancar excecao', async () => {
      const result = await resolveFileContent({
        text: async () => {
          throw new Error('Falha de I/O simulada');
        },
      });
      expect(result).toBe('');
    });
  });

  describe('yieldTick', () => {
    it('resolve uma Promise apos o intervalo especificado', async () => {
      const start = performance.now();
      await yieldTick(10);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(5);
    });
  });

  describe('runProjectAnalysis', () => {
    it('lanca TypeError se files nao for um array', async () => {
      await expect(runProjectAnalysis(null)).rejects.toThrow(TypeError);
      await expect(runProjectAnalysis('invalido')).rejects.toThrow(/esperado um array de arquivos/i);
    });

    it('processa lista vazia de arquivos retornando matriz vazia e sumario valido', async () => {
      const progressUpdates = [];
      const result = await runProjectAnalysis([], {
        projectName: 'Projeto Vazio',
        onProgress: (p) => progressUpdates.push(p),
      });

      expect(result.cancelled).toBe(false);
      expect(result.routes).toEqual([]);
      expect(result.calls).toEqual([]);
      expect(result.matrixResult.resources).toEqual([]);
      expect(result.issues).toEqual([]);
      expect(result.summary.projectName).toBe('Projeto Vazio');
      expect(result.summary.totalFiles).toBe(0);
      expect(result.summary.processedFiles).toBe(0);
      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
      expect(progressUpdates[0].percent).toBe(100);
    });

    it('ignora arquivos irrelevantes, minificados e sensiveis', async () => {
      const files = [
        { path: 'node_modules/express/index.js', content: 'app.get("/hidden", h);' },
        { path: 'dist/bundle.min.js', content: 'app.get("/min", h);' },
        { path: '.env', content: 'SECRET=123' },
        { path: 'image.png', content: 'binary' },
        {
          path: 'src/server.js',
          content: 'const express = require("express"); const app = express(); app.get("/api/users", handler);',
        },
      ];

      const result = await runProjectAnalysis(files, { projectName: 'Filtro Test' });

      expect(result.summary.totalInputFiles).toBe(5);
      expect(result.summary.totalFiles).toBe(1);
      expect(result.routes.length).toBe(1);
      expect(result.routes[0].canonicalPath).toBe('/api/users');
    });

    it('executa analise completa integrando Express routes, Fetch e Axios com batches', async () => {
      const files = [
        {
          path: 'server/routes.js',
          content: `
            app.get('/api/users', listUsers);
            app.post('/api/users', createUser);
            app.delete('/api/users/:id', deleteUser);
          `,
        },
        {
          path: 'client/services/api.js',
          content: `
            fetch('/api/users');
            axios.get('/api/users');
          `,
        },
        {
          path: 'client/pages/UsersPage.jsx',
          content: `
            export function UsersPage() {
              axios.delete('/api/users/' + userId);
              fetch('/api/unknown-endpoint');
            }
          `,
        },
      ];

      const progressList = [];
      const result = await runProjectAnalysis(files, {
        projectName: 'Fullstack App',
        batchSize: 2,
        onProgress: (p) => progressList.push(p),
      });

      expect(result.cancelled).toBe(false);
      expect(result.routes.length).toBe(3);
      expect(result.calls.length).toBe(4);
      expect(result.matrixResult.resources).toContain('/api/users');
      expect(result.matrixResult.resources).toContain('/api/users/:param');
      expect(result.matrixResult.resources).toContain('/api/unknown-endpoint');

      // Verifica presenca de anomalias (broken call para /api/unknown-endpoint e unorganized em UsersPage.jsx)
      expect(result.issues.length).toBeGreaterThan(0);
      const broken = result.issues.find((i) => i.type === 'BROKEN_CALL');
      expect(broken).toBeDefined();
      expect(broken.canonicalPath).toBe('/api/unknown-endpoint');

      // Verifica progresso
      expect(progressList.length).toBeGreaterThanOrEqual(3);
      const lastProgress = progressList[progressList.length - 1];
      expect(lastProgress.percent).toBe(100);
      expect(lastProgress.processedFiles).toBe(3);
    });

    it('interrompe processamento de forma limpa quando cancellationToken for ativado', async () => {
      const cancellationToken = { isCancelled: false };
      const files = [
        { path: 'a.js', content: 'app.get("/a", h);' },
        { path: 'b.js', content: 'app.get("/b", h);' },
        { path: 'c.js', content: 'app.get("/c", h);' },
      ];

      const result = await runProjectAnalysis(files, {
        batchSize: 1,
        cancellationToken,
        onProgress: (p) => {
          if (p.processedFiles === 1) {
            cancellationToken.isCancelled = true;
          }
        },
      });

      expect(result.cancelled).toBe(true);
      expect(result.matrixResult).toBeNull();
    });
  });

  describe('handleWorkerMessage', () => {
    it('responde a START_ANALYSIS com PROGRESS_UPDATE e ANALYSIS_COMPLETE', async () => {
      const postedMessages = [];
      const mockTarget = {
        postMessage: (msg) => postedMessages.push(msg),
      };

      await handleWorkerMessage(
        {
          data: {
            type: WORKER_MESSAGE_TYPES.START_ANALYSIS,
            projectName: 'Worker Unit Test',
            files: [
              { path: 'server.js', content: 'app.get("/api/status", handler);' },
            ],
          },
        },
        mockTarget
      );

      const progressUpdates = postedMessages.filter((m) => m.type === WORKER_MESSAGE_TYPES.PROGRESS_UPDATE);
      const completeMessage = postedMessages.find((m) => m.type === WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE);

      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
      expect(completeMessage).toBeDefined();
      expect(completeMessage.summary.projectName).toBe('Worker Unit Test');
      expect(completeMessage.routes.length).toBe(1);
    });

    it('emite ANALYSIS_ERROR caso ocorra erro inesperado na analise', async () => {
      const postedMessages = [];
      const mockTarget = {
        postMessage: (msg) => postedMessages.push(msg),
      };

      await handleWorkerMessage(
        {
          data: {
            type: WORKER_MESSAGE_TYPES.START_ANALYSIS,
            files: 'invalido_nao_array',
          },
        },
        mockTarget
      );

      const errorMessage = postedMessages.find((m) => m.type === WORKER_MESSAGE_TYPES.ANALYSIS_ERROR);
      expect(errorMessage).toBeDefined();
      expect(errorMessage.message).toMatch(/esperado um array/i);
    });

    it('cancela a analise em andamento ao receber CANCEL_ANALYSIS', async () => {
      const postedMessages = [];
      const mockTarget = {
        postMessage: (msg) => postedMessages.push(msg),
      };

      // Inicia com yieldInterval permitindo intervencao
      const promise = handleWorkerMessage(
        {
          data: {
            type: WORKER_MESSAGE_TYPES.START_ANALYSIS,
            files: [
              { path: 'a.js', content: 'app.get("/a", h);' },
              { path: 'b.js', content: 'app.get("/b", h);' },
            ],
            options: {
              batchSize: 1,
              yieldInterval: 20,
            },
          },
        },
        mockTarget
      );

      // Envia cancelamento logo em seguida
      setTimeout(() => {
        handleWorkerMessage(
          { data: { type: WORKER_MESSAGE_TYPES.CANCEL_ANALYSIS } },
          mockTarget
        );
      }, 5);

      await promise;

      const completeMessage = postedMessages.find((m) => m.type === WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE);
      expect(completeMessage).toBeUndefined();
    });

    it('ignora mensagens com dados nulos ou tipos desconhecidos', async () => {
      const postedMessages = [];
      const mockTarget = {
        postMessage: (msg) => postedMessages.push(msg),
      };

      await handleWorkerMessage(null, mockTarget);
      await handleWorkerMessage({ data: null }, mockTarget);
      await handleWorkerMessage({ data: { type: 'UNKNOWN_TYPE' } }, mockTarget);

      expect(postedMessages.length).toBe(0);
    });
  });
});

describe('useProjectAnalysis (Hook React)', () => {
  let createdWorkers = [];

  class MockWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      this.postedMessages = [];
      createdWorkers.push(this);
    }

    postMessage(data) {
      this.postedMessages.push(data);
    }

    terminate() {
      this.terminated = true;
    }

    // Metodo auxiliar de teste para simular mensagens vindas do worker
    simulateMessage(data) {
      if (typeof this.onmessage === 'function' && !this.terminated) {
        this.onmessage({ data });
      }
    }

    // Metodo auxiliar para simular erro nativo de script no worker
    simulateError(errorEvent) {
      if (typeof this.onerror === 'function' && !this.terminated) {
        this.onerror(errorEvent);
      }
    }
  }

  beforeEach(() => {
    createdWorkers = [];
  });

  afterEach(() => {
    createdWorkers = [];
    vi.restoreAllMocks();
  });

  it('inicializa com os estados padrao', () => {
    const { result } = renderHook(() => useProjectAnalysis());

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.progress).toEqual({
      currentFile: '',
      processedFiles: 0,
      totalFiles: 0,
      percent: 0,
    });
    expect(result.current.currentFile).toBe('');
    expect(result.current.matrixResult).toBeNull();
    expect(result.current.issues).toBeNull();
    expect(result.current.routes).toBeNull();
    expect(result.current.calls).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.startAnalysis).toBe('function');
    expect(typeof result.current.cancelAnalysis).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('lanca TypeError e chama onError se startAnalysis receber argumento que nao seja array', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useProjectAnalysis({ onError }));

    act(() => {
      result.current.startAnalysis('nao_e_array');
    });

    expect(result.current.error).toBeInstanceOf(TypeError);
    expect(result.current.isAnalyzing).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it('gerencia ciclo completo de analise atualizando progresso e completando', () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    const { result } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
        onProgress,
        onComplete,
      })
    );

    const files = [
      { path: 'server.js', content: 'app.get("/users", h);' },
      { path: 'client.js', content: 'fetch("/users");' },
    ];

    act(() => {
      result.current.startAnalysis(files, 'App Test');
    });

    expect(result.current.isAnalyzing).toBe(true);
    expect(createdWorkers.length).toBe(1);
    const worker = createdWorkers[0];
    expect(worker.postedMessages[0]).toEqual({
      type: WORKER_MESSAGE_TYPES.START_ANALYSIS,
      files,
      projectName: 'App Test',
      options: {},
    });

    // Simula atualizacao de progresso
    act(() => {
      worker.simulateMessage({
        type: WORKER_MESSAGE_TYPES.PROGRESS_UPDATE,
        currentFile: 'server.js',
        processedFiles: 1,
        totalFiles: 2,
        percent: 50,
      });
    });

    expect(result.current.currentFile).toBe('server.js');
    expect(result.current.progress).toEqual({
      currentFile: 'server.js',
      processedFiles: 1,
      totalFiles: 2,
      percent: 50,
    });
    expect(onProgress).toHaveBeenCalledWith({
      currentFile: 'server.js',
      processedFiles: 1,
      totalFiles: 2,
      percent: 50,
    });

    // Simula conclusao da analise
    const mockCompleteData = {
      type: WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE,
      routes: [{ method: 'GET', canonicalPath: '/users' }],
      calls: [{ method: 'GET', canonicalPath: '/users' }],
      matrixResult: { resources: ['/users'] },
      issues: [],
      summary: { totalFiles: 2, routesCount: 1, callsCount: 1 },
      totalDurationMs: 42,
    };

    act(() => {
      worker.simulateMessage(mockCompleteData);
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.routes).toEqual(mockCompleteData.routes);
    expect(result.current.calls).toEqual(mockCompleteData.calls);
    expect(result.current.matrixResult).toEqual(mockCompleteData.matrixResult);
    expect(result.current.issues).toEqual([]);
    expect(result.current.summary).toEqual(mockCompleteData.summary);
    expect(result.current.progress.percent).toBe(100);
    expect(onComplete).toHaveBeenCalledWith(mockCompleteData);
    expect(worker.terminated).toBe(true);
  });

  it('trata mensagem ANALYSIS_ERROR do worker notificando callback e atualizando estado', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
        onError,
      })
    );

    act(() => {
      result.current.startAnalysis([{ path: 'test.js' }]);
    });

    const worker = createdWorkers[0];

    act(() => {
      worker.simulateMessage({
        type: WORKER_MESSAGE_TYPES.ANALYSIS_ERROR,
        message: 'Falha sintatica critica',
        error: { name: 'SyntaxError', message: 'Falha sintatica critica' },
      });
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toEqual({ name: 'SyntaxError', message: 'Falha sintatica critica' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Falha sintatica critica' }));
    expect(worker.terminated).toBe(true);
  });

  it('trata erro nativo onerror do worker', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
        onError,
      })
    );

    act(() => {
      result.current.startAnalysis([{ path: 'test.js' }]);
    });

    const worker = createdWorkers[0];

    act(() => {
      worker.simulateError({ message: 'Worker script crash' });
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error.message).toBe('Worker script crash');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(worker.terminated).toBe(true);
  });

  it('cancela analise atomica via cancelAnalysis', () => {
    const { result } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
      })
    );

    act(() => {
      result.current.startAnalysis([{ path: 'test.js' }]);
    });

    const worker = createdWorkers[0];
    expect(result.current.isAnalyzing).toBe(true);

    act(() => {
      result.current.cancelAnalysis();
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.currentFile).toBe('');
    expect(worker.postedMessages).toContainEqual({
      type: WORKER_MESSAGE_TYPES.CANCEL_ANALYSIS,
    });
    expect(worker.terminated).toBe(true);
  });

  it('reinicializa todos os estados reativos via reset()', () => {
    const { result } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
      })
    );

    act(() => {
      result.current.startAnalysis([{ path: 'test.js' }]);
    });

    const worker = createdWorkers[0];

    act(() => {
      worker.simulateMessage({
        type: WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE,
        routes: [{ id: 1 }],
        calls: [{ id: 2 }],
        matrixResult: { res: 1 },
        issues: [{ id: 3 }],
        summary: { sum: 1 },
      });
    });

    expect(result.current.routes).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.progress).toEqual({
      currentFile: '',
      processedFiles: 0,
      totalFiles: 0,
      percent: 0,
    });
    expect(result.current.currentFile).toBe('');
    expect(result.current.matrixResult).toBeNull();
    expect(result.current.issues).toBeNull();
    expect(result.current.routes).toBeNull();
    expect(result.current.calls).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('finaliza o worker quando o hook e desmontado', () => {
    const { result, unmount } = renderHook(() =>
      useProjectAnalysis({
        createWorker: () => new MockWorker(),
      })
    );

    act(() => {
      result.current.startAnalysis([{ path: 'test.js' }]);
    });

    const worker = createdWorkers[0];
    expect(worker.terminated).toBe(false);

    unmount();

    expect(worker.terminated).toBe(true);
  });

  it('utiliza instanciacao nativa via globalThis.Worker se createWorker nao for especificado', () => {
    const originalWorker = globalThis.Worker;
    globalThis.Worker = MockWorker;

    try {
      const { result } = renderHook(() => useProjectAnalysis());

      act(() => {
        result.current.startAnalysis([{ path: 'index.js' }]);
      });

      expect(createdWorkers.length).toBe(1);
      const worker = createdWorkers[0];
      expect(worker.options).toEqual({ type: 'module' });
      expect(worker.url.toString()).toContain('project-analysis.worker.js');
    } finally {
      globalThis.Worker = originalWorker;
    }
  });
});
