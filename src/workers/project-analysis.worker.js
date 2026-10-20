/**
 * Web Worker para Analise de Projetos em Segundo Plano
 * rest-api-matrix-analyzer
 *
 * Executa o processamento assincrono de arquivos fora da thread principal de UI:
 * parsing AST com Babel, extracao de rotas Express, extracao de chamadas HTTP,
 * projecao da matriz REST e deteccao de anomalias com descarte imediato da AST.
 */

import { isProcessableFile } from '../parsers/file-filter.js';
import { parseSourceToAst } from '../parsers/ast-parser.js';
import { extractExpressRoutes } from '../analyzers/express-route-analyzer.js';
import { extractClientCalls } from '../analyzers/client-call-analyzer.js';
import { matchRoutesAndCalls } from '../analyzers/route-matcher.js';
import { detectProjectIssues } from '../analyzers/issue-detector.js';

export const WORKER_MESSAGE_TYPES = Object.freeze({
  START_ANALYSIS: 'START_ANALYSIS',
  PROGRESS_UPDATE: 'PROGRESS_UPDATE',
  ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
  ANALYSIS_ERROR: 'ANALYSIS_ERROR',
  CANCEL_ANALYSIS: 'CANCEL_ANALYSIS',
});

export const DEFAULT_BATCH_SIZE = 10;

/**
 * Cede execucao ao event loop permitindo o consumo de mensagens de cancelamento.
 *
 * @param {number} [delayMs=0]
 * @returns {Promise<void>}
 */
export function yieldTick(delayMs = 0) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Resolve o conteudo textual de um item de arquivo em formato compativel.
 *
 * @param {Object} fileItem
 * @returns {Promise<string>}
 */
export async function resolveFileContent(fileItem) {
  if (!fileItem) return '';
  if (typeof fileItem.content === 'string') return fileItem.content;
  if (typeof fileItem.text === 'string') return fileItem.text;
  if (typeof fileItem.text === 'function') {
    try {
      return await fileItem.text();
    } catch {
      return '';
    }
  }
  if (fileItem.file && typeof fileItem.file.text === 'function') {
    try {
      return await fileItem.file.text();
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Executa a analise de um conjunto de arquivos em lotes sequenciais com descarte de AST.
 *
 * @param {Array<Object>} files Lista de arquivos a analisar
 * @param {Object} [options={}] Opcoes adicionais e callbacks de progresso
 * @returns {Promise<Object>} Resultado consolidado da analise
 */
export async function runProjectAnalysis(files, options = {}) {
  const {
    projectName = 'Untitled Project',
    auditId = null,
    batchSize = DEFAULT_BATCH_SIZE,
    onProgress = null,
    cancellationToken = null,
    yieldInterval = 0,
  } = options;

  const isCancelled = () => Boolean(cancellationToken?.isCancelled);

  if (!Array.isArray(files)) {
    throw new TypeError('runProjectAnalysis: esperado um array de arquivos.');
  }

  const startTime = performance.now();
  const processableFiles = [];

  for (const fileItem of files) {
    const filePath = fileItem?.path || fileItem?.relativePath || fileItem?.name || '';
    if (isProcessableFile(filePath)) {
      processableFiles.push(fileItem);
    }
  }

  const totalFiles = processableFiles.length;
  let processedCount = 0;
  const allRoutes = [];
  const allCalls = [];

  // Emissao inicial de progresso
  if (typeof onProgress === 'function') {
    onProgress({
      currentFile: totalFiles > 0 ? (processableFiles[0]?.path || processableFiles[0]?.relativePath || processableFiles[0]?.name || '') : '',
      processedFiles: 0,
      totalFiles,
      percent: totalFiles === 0 ? 100 : 0,
    });
  }

  // Processamento em lotes sequenciais (chunks de tamanho configuravel, padrao 10)
  for (let i = 0; i < totalFiles; i += batchSize) {
    if (isCancelled()) {
      return {
        cancelled: true,
        routes: [],
        calls: [],
        matrixResult: null,
        issues: [],
        summary: null,
        totalDurationMs: 0,
      };
    }

    const chunk = processableFiles.slice(i, i + batchSize);

    for (const fileItem of chunk) {
      if (isCancelled()) {
        return {
          cancelled: true,
          routes: [],
          calls: [],
          matrixResult: null,
          issues: [],
          summary: null,
          totalDurationMs: 0,
        };
      }

      const filePath = fileItem?.path || fileItem?.relativePath || fileItem?.name || '';
      const content = await resolveFileContent(fileItem);

      const parseResult = parseSourceToAst(content, filePath);

      if (parseResult.ok && parseResult.ast) {
        const fileRoutes = extractExpressRoutes(parseResult.ast, filePath);
        const fileCalls = extractClientCalls(parseResult.ast, filePath);

        allRoutes.push(...fileRoutes);
        allCalls.push(...fileCalls);
      }

      // Descarte imediato da arvore AST para nao acumular memoria RAM
      parseResult.ast = null;

      processedCount += 1;
      const percent = totalFiles > 0 ? Math.round((processedCount / totalFiles) * 100) : 100;

      if (typeof onProgress === 'function') {
        onProgress({
          currentFile: filePath,
          processedFiles: processedCount,
          totalFiles,
          percent,
        });
      }
    }

    // Libera a fila do event loop para recepcionar mensagens de cancelamento no worker
    if (i + batchSize < totalFiles) {
      await yieldTick(yieldInterval);
    }
  }

  if (isCancelled()) {
    return {
      cancelled: true,
      routes: [],
      calls: [],
      matrixResult: null,
      issues: [],
      summary: null,
      totalDurationMs: 0,
    };
  }

  // Cruzamento relacional com o Route Matcher
  const matrixResult = matchRoutesAndCalls(allRoutes, allCalls, {
    auditId,
    projectName,
  });

  // Deteccao deterministica de anomalias com o Issue Detector
  const issues = detectProjectIssues(matrixResult, allRoutes, allCalls, {
    auditId,
  });

  const totalDurationMs = Math.round(performance.now() - startTime);

  const summary = {
    projectName,
    totalInputFiles: files.length,
    totalFiles,
    processedFiles: processedCount,
    routesCount: allRoutes.length,
    callsCount: allCalls.length,
    matrixSummary: matrixResult.summary,
    issueSummary: issues.summary,
    totalIssues: issues.length,
    totalDurationMs,
  };

  return {
    cancelled: false,
    routes: allRoutes,
    calls: allCalls,
    matrixResult,
    issues,
    summary,
    totalDurationMs,
  };
}

let activeCancellation = null;

/**
 * Trata as mensagens recebidas pelo Web Worker.
 *
 * @param {MessageEvent|Object} event
 * @param {Worker|Object} [target=self]
 */
export async function handleWorkerMessage(event, target = self) {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;

  const { type } = data;

  if (type === WORKER_MESSAGE_TYPES.CANCEL_ANALYSIS) {
    if (activeCancellation) {
      activeCancellation.isCancelled = true;
    }
    return;
  }

  if (type === WORKER_MESSAGE_TYPES.START_ANALYSIS) {
    const { files = [], projectName = 'Untitled Project', options = {} } = data;
    const cancellationToken = { isCancelled: false };
    activeCancellation = cancellationToken;

    try {
      const result = await runProjectAnalysis(files, {
        projectName,
        ...options,
        cancellationToken,
        onProgress: (progress) => {
          if (cancellationToken.isCancelled) return;
          target.postMessage({
            type: WORKER_MESSAGE_TYPES.PROGRESS_UPDATE,
            ...progress,
          });
        },
      });

      if (cancellationToken.isCancelled || result.cancelled) {
        return;
      }

      target.postMessage({
        type: WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE,
        routes: result.routes,
        calls: result.calls,
        matrixResult: result.matrixResult,
        issues: result.issues,
        summary: result.summary,
        totalDurationMs: result.totalDurationMs,
      });
    } catch (err) {
      if (cancellationToken.isCancelled) {
        return;
      }
      target.postMessage({
        type: WORKER_MESSAGE_TYPES.ANALYSIS_ERROR,
        message: err?.message || 'Erro durante a analise do projeto.',
        error: {
          name: err?.name || 'Error',
          message: err?.message || String(err),
          stack: err?.stack || null,
        },
      });
    } finally {
      if (activeCancellation === cancellationToken) {
        activeCancellation = null;
      }
    }
  }
}

// Inicializacao automatica quando executado no contexto dedicado do Web Worker
const isDedicatedWorker =
  typeof self !== 'undefined' &&
  typeof self.postMessage === 'function' &&
  (typeof window === 'undefined' || typeof WorkerGlobalScope !== 'undefined');

if (isDedicatedWorker && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event) => handleWorkerMessage(event, self));
}
