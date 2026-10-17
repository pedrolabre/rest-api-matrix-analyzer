/**
 * Modulo de descompactacao e extracao em memoria de projetos em formato ZIP via JSZip.
 * Atua como mecanismo de ingestao universal para navegadores que nao suportam a File System
 * Access API (como Firefox e Safari) ou quando o usuario prefere importar um arquivo empacotado.
 *
 * Aplica os mesmos filtros estritos de exclusao e seguranca definidos em file-filter.js,
 * descartando pastas pesadas (ex: node_modules, dist, .git), segredos (.env) e arquivos minificados,
 * produzindo uma colecao homogenea de objetos compativel com o fluxo de ingestao.
 */

import JSZip from 'jszip';
import {
  isProcessableFile,
  shouldScanPath,
  isIgnoredDirectory,
  normalizePathSeparators,
} from './file-filter.js';

/**
 * Valida se um objeto ou nome de arquivo possui extensao ou tipo MIME compativel com ZIP.
 *
 * @param {string|File|Blob|object} fileOrName - Nome do arquivo, string de caminho ou objeto File/Blob.
 * @returns {boolean} Verdadeiro se o arquivo for identificado como pacote ZIP.
 */
export function isZipFile(fileOrName) {
  if (!fileOrName) {
    return false;
  }

  if (typeof fileOrName === 'string') {
    return /\.zip$/i.test(fileOrName.trim());
  }

  if (typeof fileOrName === 'object') {
    const name = fileOrName.name;
    if (typeof name === 'string' && /\.zip$/i.test(name.trim())) {
      return true;
    }
    const type = fileOrName.type;
    if (
      typeof type === 'string' &&
      (type === 'application/zip' ||
        type === 'application/x-zip-compressed' ||
        type === 'application/x-zip')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Identifica se todos os caminhos fornecidos compartilham um mesmo diretorio raiz de topo.
 * Utilizado para remover o prefixo redundante de pastas geradas por compressores ou GitHub
 * (ex: repo-main/src/index.js -> src/index.js), uniformizando com o comportamento da File System Access API.
 *
 * @param {Array<string>} paths - Lista de caminhos relativos de arquivos contidos no pacote.
 * @returns {string} Prefixo do diretorio raiz comum ou string vazia se nao houver raiz unica.
 */
export function getCommonRootPrefix(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return '';
  }

  const validPaths = paths
    .map((p) => normalizePathSeparators(p).replace(/^\/+/, ''))
    .filter(Boolean);

  if (validPaths.length === 0) {
    return '';
  }

  const firstSegments = validPaths[0].split('/');
  if (firstSegments.length <= 1) {
    return '';
  }

  const candidateRoot = firstSegments[0];

  for (let i = 1; i < validPaths.length; i++) {
    const segments = validPaths[i].split('/');
    if (segments.length <= 1 || segments[0] !== candidateRoot) {
      return '';
    }
  }

  return candidateRoot;
}

/**
 * Descompacta e extrai em memoria os arquivos de codigo relevantes de um arquivo ZIP.
 * Suporta entradas dos tipos File, Blob, ArrayBuffer ou Uint8Array.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array|Buffer} zipInput - Dados binarios do arquivo compactado.
 * @param {object} [options={}] - Configuracoes adicionais de extracao.
 * @param {boolean} [options.stripRoot=true] - Se verdadeiro, remove pasta raiz comum se detectada.
 * @param {Function} [options.onFileFound] - Callback disparado ao encontrar cada arquivo elegivel.
 * @param {number} [options.maxFiles] - Limite maximo de arquivos a extrair.
 * @returns {Promise<Array<{ name: string, relativePath: string, text: Function }>>} Lista de arquivos processaveis.
 */
export async function extractProjectFromZip(zipInput, options = {}) {
  if (!zipInput || (typeof zipInput !== 'object' && typeof zipInput !== 'string')) {
    throw new TypeError(
      'extractProjectFromZip: zipInput invalido. Esperava um File, Blob, ArrayBuffer ou Uint8Array.'
    );
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(zipInput);
  } catch (error) {
    throw new Error(`Falha ao descompactar arquivo ZIP: ${error?.message || error}`);
  }

  const {
    stripRoot = true,
    onFileFound,
    maxFiles,
  } = options;

  const rawEntries = [];

  zip.forEach((relativePath, zipEntry) => {
    // Descartar diretorios explicitos
    if (zipEntry.dir || zipEntry.name.endsWith('/')) {
      return;
    }

    const normalized = normalizePathSeparators(zipEntry.name).replace(/^\/+/, '');
    if (!normalized) {
      return;
    }

    // Descartar artefatos de sistema operacional como __MACOSX ou .DS_Store
    const segments = normalized.split('/');
    if (segments.some((segment) => segment === '__MACOSX')) {
      return;
    }
    const baseName = segments[segments.length - 1];
    if (baseName === '.DS_Store' || baseName === 'Thumbs.db') {
      return;
    }

    rawEntries.push({
      originalPath: normalized,
      zipEntry,
    });
  });

  // Deteccao de pasta raiz comum empacotada no ZIP
  const commonRoot = stripRoot
    ? getCommonRootPrefix(rawEntries.map((e) => e.originalPath))
    : '';

  const prefixToStrip = commonRoot ? `${commonRoot}/` : '';
  const resultFiles = [];

  for (const { originalPath, zipEntry } of rawEntries) {
    const resolvedPath = prefixToStrip && originalPath.startsWith(prefixToStrip)
      ? originalPath.slice(prefixToStrip.length)
      : originalPath;

    // Poda antecipada de subpastas ignoradas e validacao de arquivo de codigo elegivel
    if (!shouldScanPath(resolvedPath) || isIgnoredDirectory(resolvedPath)) {
      continue;
    }

    if (!isProcessableFile(resolvedPath)) {
      continue;
    }

    const segments = resolvedPath.split('/');
    const name = segments[segments.length - 1] || resolvedPath;

    const fileItem = {
      name,
      relativePath: resolvedPath,
      text: async () => zipEntry.async('string'),
    };

    resultFiles.push(fileItem);

    if (typeof onFileFound === 'function') {
      onFileFound(fileItem);
    }

    if (typeof maxFiles === 'number' && resultFiles.length >= maxFiles) {
      break;
    }
  }

  return resultFiles;
}
