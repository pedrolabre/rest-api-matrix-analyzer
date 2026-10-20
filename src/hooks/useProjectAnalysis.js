/**
 * Hook React useProjectAnalysis
 * rest-api-matrix-analyzer
 *
 * Gerencia o ciclo de vida do Web Worker de analise de projetos em segundo plano,
 * provendo estados reativos para progresso percentual, arquivo corrente, matriz REST,
 * listagem de anomalias, cancelamento atomico e tratamento robusto de erros.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { WORKER_MESSAGE_TYPES } from '../workers/project-analysis.worker.js';

const INITIAL_PROGRESS = Object.freeze({
  currentFile: '',
  processedFiles: 0,
  totalFiles: 0,
  percent: 0,
});

/**
 * Hook para execucao assincrona de auditoria estatica em Web Worker dedicado.
 *
 * @param {Object} [hookOptions={}]
 * @param {Function} [hookOptions.onComplete] Callback executado ao concluir a analise
 * @param {Function} [hookOptions.onError] Callback executado ao ocorrer erro
 * @param {Function} [hookOptions.onProgress] Callback executado a cada atualizacao de progresso
 * @param {Function} [hookOptions.createWorker] Fabrica customizada de worker (injecao/testes)
 * @returns {Object}
 */
export function useProjectAnalysis(hookOptions = {}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ ...INITIAL_PROGRESS });
  const [currentFile, setCurrentFile] = useState('');
  const [matrixResult, setMatrixResult] = useState(null);
  const [issues, setIssues] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [calls, setCalls] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const workerRef = useRef(null);
  const isMountedRef = useRef(true);
  const optionsRef = useRef(hookOptions);

  // Mantem a referencia atualizada das opcoes sem forcar re-execucoes
  useEffect(() => {
    optionsRef.current = hookOptions;
  }, [hookOptions]);

  /**
   * Instancia o Web Worker com suporte nativo a modulos ES no Vite.
   */
  const instantiateWorker = useCallback(() => {
    if (typeof optionsRef.current?.createWorker === 'function') {
      return optionsRef.current.createWorker();
    }
    return new Worker(
      new URL('../workers/project-analysis.worker.js', import.meta.url),
      { type: 'module' }
    );
  }, []);

  /**
   * Finaliza de forma limpa o Web Worker ativo e descarta sua referencia.
   */
  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      try {
        workerRef.current.postMessage({ type: WORKER_MESSAGE_TYPES.CANCEL_ANALYSIS });
      } catch {
        // Ignora caso a conexao ja esteja encerrada
      }
      try {
        workerRef.current.terminate();
      } catch {
        // Ignora
      }
      workerRef.current = null;
    }
  }, []);

  /**
   * Cancela a analise em andamento de forma atomica.
   */
  const cancelAnalysis = useCallback(() => {
    terminateWorker();
    if (isMountedRef.current) {
      setIsAnalyzing(false);
      setCurrentFile('');
    }
  }, [terminateWorker]);

  /**
   * Reinicializa todos os estados reativos para os valores originais.
   */
  const reset = useCallback(() => {
    terminateWorker();
    if (isMountedRef.current) {
      setIsAnalyzing(false);
      setProgress({ ...INITIAL_PROGRESS });
      setCurrentFile('');
      setMatrixResult(null);
      setIssues(null);
      setRoutes(null);
      setCalls(null);
      setSummary(null);
      setError(null);
    }
  }, [terminateWorker]);

  /**
   * Inicia a analise de uma lista de arquivos no Web Worker.
   */
  const startAnalysis = useCallback(
    (files, projectName = 'Untitled Project', analysisOptions = {}) => {
      terminateWorker();

      if (!Array.isArray(files)) {
        const typeError = new TypeError('startAnalysis: esperado um array de arquivos.');
        setError(typeError);
        optionsRef.current?.onError?.(typeError);
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      setProgress({
        currentFile: '',
        processedFiles: 0,
        totalFiles: files.length,
        percent: 0,
      });
      setCurrentFile('');
      setMatrixResult(null);
      setIssues(null);
      setRoutes(null);
      setCalls(null);
      setSummary(null);

      let worker;
      try {
        worker = instantiateWorker();
        workerRef.current = worker;
      } catch (workerInitErr) {
        setIsAnalyzing(false);
        setError(workerInitErr);
        optionsRef.current?.onError?.(workerInitErr);
        return;
      }

      worker.onmessage = (event) => {
        if (!isMountedRef.current) return;
        const data = event?.data;
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
          case WORKER_MESSAGE_TYPES.PROGRESS_UPDATE: {
            const nextProgress = {
              currentFile: data.currentFile || '',
              processedFiles: typeof data.processedFiles === 'number' ? data.processedFiles : 0,
              totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0,
              percent: typeof data.percent === 'number' ? data.percent : 0,
            };
            setProgress(nextProgress);
            setCurrentFile(nextProgress.currentFile);
            optionsRef.current?.onProgress?.(nextProgress);
            break;
          }

          case WORKER_MESSAGE_TYPES.ANALYSIS_COMPLETE: {
            setIsAnalyzing(false);
            setMatrixResult(data.matrixResult || null);
            setIssues(data.issues || null);
            setRoutes(data.routes || null);
            setCalls(data.calls || null);
            setSummary(data.summary || null);
            setProgress((prev) => ({ ...prev, percent: 100 }));
            optionsRef.current?.onComplete?.(data);
            terminateWorker();
            break;
          }

          case WORKER_MESSAGE_TYPES.ANALYSIS_ERROR: {
            setIsAnalyzing(false);
            const capturedError = data.error || new Error(data.message || 'Erro durante a analise no worker');
            setError(capturedError);
            optionsRef.current?.onError?.(capturedError);
            terminateWorker();
            break;
          }

          default:
            break;
        }
      };

      worker.onerror = (errEvent) => {
        if (!isMountedRef.current) return;
        setIsAnalyzing(false);
        const scriptError = new Error(errEvent?.message || 'Erro inesperado no Web Worker.');
        setError(scriptError);
        optionsRef.current?.onError?.(scriptError);
        terminateWorker();
      };

      worker.postMessage({
        type: WORKER_MESSAGE_TYPES.START_ANALYSIS,
        files,
        projectName,
        options: analysisOptions,
      });
    },
    [instantiateWorker, terminateWorker]
  );

  // Limpeza automatica caso o componente seja desmontado
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      terminateWorker();
    };
  }, [terminateWorker]);

  return {
    isAnalyzing,
    progress,
    currentFile,
    matrixResult,
    issues,
    routes,
    calls,
    summary,
    error,
    startAnalysis,
    cancelAnalysis,
    reset,
  };
}
