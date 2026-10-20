import React, { useState, useRef, useCallback } from 'react';
import { FolderOpen, UploadCloud, AlertCircle, X, Loader2, FileArchive } from 'lucide-react';
import { readLocalDirectory, isFileSystemAccessSupported, pickDirectory } from '../../parsers/directory-reader.js';
import { extractProjectFromZip, isZipFile } from '../../parsers/zip-extractor.js';

/**
 * Card de importacao de projetos com selecao de pasta nativa e dropzone de arquivos ZIP.
 *
 * @param {object} props
 * @param {Function} props.onFilesSelected Callback acionado com a lista de arquivos e o nome do projeto
 * @param {boolean} [props.isAnalyzing=false] Booleano indicando analise em andamento
 * @param {object} [props.progress] Objeto com metricas de progresso da analise
 * @param {Function} [props.onCancel] Callback para cancelamento da analise em andamento
 * @param {Error|string} [props.error] Erro externo emitido pelo analisador
 * @param {string} [props.className] Classes CSS adicionais
 */
export default function ProjectImportCard({
  onFilesSelected,
  isAnalyzing = false,
  progress = { percent: 0, currentFile: '', processedFiles: 0, totalFiles: 0 },
  onCancel,
  error = null,
  className = '',
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [localError, setLocalError] = useState(null);
  const fileInputRef = useRef(null);

  const supportsFileSystem = isFileSystemAccessSupported();

  const handleClearError = useCallback(() => {
    setLocalError(null);
  }, []);

  const handleDirectoryPick = useCallback(async () => {
    setLocalError(null);
    try {
      const dirHandle = await pickDirectory();
      if (!dirHandle) {
        return;
      }

      setIsReadingFiles(true);
      const projectName = dirHandle.name || 'Projeto Local';
      const files = await readLocalDirectory(dirHandle);

      if (!files || files.length === 0) {
        setLocalError('Nenhum arquivo JavaScript/Node.js (.js, .jsx) elegivel encontrado no diretorio.');
        return;
      }

      if (typeof onFilesSelected === 'function') {
        onFilesSelected(files, projectName);
      }
    } catch (err) {
      setLocalError(err?.message || 'Falha ao acessar o diretorio selecionado.');
    } finally {
      setIsReadingFiles(false);
    }
  }, [onFilesSelected]);

  const processZipFile = useCallback(
    async (file) => {
      if (!isZipFile(file)) {
        setLocalError('O arquivo selecionado deve ser um pacote .zip valido.');
        return;
      }

      setLocalError(null);
      setIsReadingFiles(true);
      try {
        const projectName = file.name ? file.name.replace(/\.zip$/i, '') : 'Projeto Compactado';
        const files = await extractProjectFromZip(file);

        if (!files || files.length === 0) {
          setLocalError('Nenhum arquivo JavaScript/Node.js (.js, .jsx) elegivel encontrado no arquivo .zip.');
          return;
        }

        if (typeof onFilesSelected === 'function') {
          onFilesSelected(files, projectName);
        }
      } catch (err) {
        setLocalError(err?.message || 'Falha ao descompactar e extrair o arquivo .zip.');
      } finally {
        setIsReadingFiles(false);
      }
    },
    [onFilesSelected]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        processZipFile(files[0]);
      }
    },
    [processZipFile]
  );

  const handleFileInputChange = useCallback(
    (e) => {
      const files = e.target?.files;
      if (files && files.length > 0) {
        processZipFile(files[0]);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processZipFile]
  );

  const handleTriggerFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const displayedError = error
    ? (typeof error === 'string' ? error : error.message || 'Ocorreu um erro durante a operacao.')
    : localError;

  const isBusy = isAnalyzing || isReadingFiles;
  const percentNumber = typeof progress?.percent === 'number' ? Math.round(progress.percent) : 0;

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur p-6 flex flex-col gap-5 ${className}`}
      data-testid="project-import-card"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-emerald-400" />
          Importar Projeto para Auditoria
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Selecione a pasta do seu projeto Node.js/Express e React ou envie um arquivo compactado .zip.
          O processamento e 100% executado no seu navegador.
        </p>
      </div>

      {displayedError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 flex items-start justify-between gap-3 text-xs text-red-300"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{displayedError}</span>
          </div>
          <button
            type="button"
            onClick={handleClearError}
            aria-label="Fechar alerta de erro"
            className="text-red-400 hover:text-red-200 transition-colors p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isBusy ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
              <span className="text-xs font-medium text-slate-200">
                {isReadingFiles
                  ? 'Lendo e extraindo arquivos do projeto...'
                  : 'Analisando codigo-fonte em background...'}
              </span>
            </div>
            {isAnalyzing && typeof onCancel === 'function' && (
              <button
                type="button"
                onClick={onCancel}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              role="progressbar"
              aria-valuenow={percentNumber}
              aria-valuemin={0}
              aria-valuemax={100}
              className="bg-emerald-500 h-2 transition-all duration-200 ease-out rounded-full"
              style={{ width: `${percentNumber}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <span className="truncate max-w-md" title={progress?.currentFile || ''}>
              {progress?.currentFile ? `Arquivo: ${progress.currentFile}` : 'Inicializando extratores AST...'}
            </span>
            <span className="flex-shrink-0 text-slate-300">
              {progress?.processedFiles ?? 0} de {progress?.totalFiles ?? 0} ({percentNumber}%)
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {supportsFileSystem ? (
              <button
                type="button"
                onClick={handleDirectoryPick}
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-slate-950" />
                <span>Selecionar Pasta do Projeto</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Selecao de pasta nativa nao suportada neste navegador. Utilize o envio de arquivo .zip.</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleTriggerFileInput}
              className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 font-medium text-xs border border-slate-700 transition-colors cursor-pointer"
            >
              <FileArchive className="w-4 h-4 text-slate-400" />
              <span>Escolher Arquivo .ZIP</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={handleFileInputChange}
            data-testid="zip-file-input"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center gap-2.5 transition-colors ${
              isDragging
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
            }`}
          >
            <div className="p-2.5 rounded-full bg-slate-800/80 text-slate-400">
              <UploadCloud className="w-5 h-5 text-slate-300" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-slate-300 font-medium">
                Arraste e solte o arquivo <span className="font-mono text-emerald-400">.zip</span> do projeto aqui
              </p>
              <p className="text-xs text-slate-500">
                Pastas como node_modules, dist e arquivos .env sao ignorados automaticamente
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
