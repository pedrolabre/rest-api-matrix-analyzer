/**
 * Modulo de leitura e varredura de diretorios locais via File System Access API.
 * Responsavel por permitir a selecao de diretorios no navegador, varrer a arvore
 * recursivamente e ceder entradas de arquivos elegiveis para analise sintatica,
 * aplicando poda antecipada em subdiretorios irrelevantes (como node_modules).
 */

import {
  isProcessableFile,
  shouldScanPath,
  isIgnoredDirectory,
  normalizePathSeparators,
} from './file-filter.js';

/**
 * Identifica se a File System Access API (showDirectoryPicker) e suportada
 * no contexto de execucao (navegador ou mock de testes).
 *
 * @param {object} [targetWindow] - Objeto global de contexto (padrao: window ou globalThis).
 * @returns {boolean} Verdadeiro caso showDirectoryPicker esteja disponivel.
 */
export function isFileSystemAccessSupported(
  targetWindow = typeof window !== 'undefined' ? window : globalThis
) {
  return Boolean(
    targetWindow && typeof targetWindow.showDirectoryPicker === 'function'
  );
}

/**
 * Abre o seletor nativo de diretorios do navegador para escolha do projeto.
 * Trata o cancelamento voluntario do usuario (AbortError), retornando null
 * para evitar o lancamento de erros nao tratados na interface.
 *
 * @param {object} [options={}] - Opcoes passadas para showDirectoryPicker (ex: id, mode).
 * @param {object} [targetWindow] - Objeto global de contexto.
 * @returns {Promise<FileSystemDirectoryHandle|null>} Handle do diretorio selecionado ou null se cancelado.
 */
export async function pickDirectory(
  options = {},
  targetWindow = typeof window !== 'undefined' ? window : globalThis
) {
  if (!isFileSystemAccessSupported(targetWindow)) {
    throw new Error('File System Access API nao e suportada neste ambiente.');
  }

  try {
    const dirHandle = await targetWindow.showDirectoryPicker(options);
    return dirHandle;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

/**
 * Gerador assincrono que percorre recursivamente a arvore de um FileSystemDirectoryHandle.
 * Aplica poda prematura em subdiretorios para impedir traversals desnecessarios
 * em pastas ignoradas (ex: node_modules, dist, .git) e cede apenas arquivos
 * com extensoes e formatos aceitos pelo motor de analise sintatica.
 *
 * @param {FileSystemDirectoryHandle} dirHandle - Handle de diretorio a ser varrido.
 * @param {string} [basePath=''] - Prefixo de caminho relativo acumulado durante a recursao.
 * @yields {{ name: string, relativePath: string, handle: FileSystemFileHandle, getFile: Function, text: Function }}
 */
export async function* traverseDirectory(dirHandle, basePath = '') {
  if (!dirHandle || typeof dirHandle !== 'object' || typeof dirHandle.values !== 'function') {
    throw new TypeError(
      'traverseDirectory: dirHandle invalido. Esperava um FileSystemDirectoryHandle com o metodo values().'
    );
  }

  const normalizedBase = normalizePathSeparators(basePath);

  for await (const entry of dirHandle.values()) {
    if (!entry || typeof entry !== 'object' || !entry.name) {
      continue;
    }

    const entryName = entry.name;
    const currentPath = normalizedBase ? `${normalizedBase}/${entryName}` : entryName;

    if (entry.kind === 'directory') {
      // Poda antecipada: se o diretorio for categoricamente ignorado, nao percorre seus filhos
      if (!shouldScanPath(currentPath) || isIgnoredDirectory(entryName)) {
        continue;
      }
      yield* traverseDirectory(entry, currentPath);
    } else if (entry.kind === 'file') {
      // Filtragem de arquivos elegiveis para analise sintatica AST
      if (isProcessableFile(currentPath)) {
        yield {
          name: entryName,
          relativePath: currentPath,
          handle: entry,
          getFile: () => entry.getFile(),
          text: async () => {
            const file = await entry.getFile();
            return file.text();
          },
        };
      }
    }
  }
}

/**
 * Funcao de alto nivel que orquestra a leitura de um diretorio local.
 * Pode receber um handle previamente obtido ou invocar o seletor nativo
 * caso nenhum handle seja fornecido. Coleta os arquivos processaveis em um array.
 *
 * @param {FileSystemDirectoryHandle|object} [dirHandleOrOptions] - Handle do diretorio ou opcoes.
 * @param {object} [maybeOptions] - Opcoes quando o primeiro parametro for um handle.
 * @returns {Promise<Array<object>|null>} Lista de arquivos encontrados ou null se o seletor foi cancelado.
 */
export async function readLocalDirectory(dirHandleOrOptions = null, maybeOptions = {}) {
  let dirHandle = null;
  let options = {};

  if (dirHandleOrOptions && typeof dirHandleOrOptions.values === 'function') {
    dirHandle = dirHandleOrOptions;
    options = maybeOptions || {};
  } else if (dirHandleOrOptions && typeof dirHandleOrOptions === 'object') {
    options = dirHandleOrOptions;
  }

  if (!dirHandle) {
    dirHandle = await pickDirectory(options.pickerOptions, options.targetWindow);
    if (!dirHandle) {
      return null;
    }
  }

  const files = [];
  const basePath = typeof options.basePath === 'string' ? options.basePath : '';

  for await (const fileEntry of traverseDirectory(dirHandle, basePath)) {
    files.push(fileEntry);
    if (typeof options.onFileFound === 'function') {
      options.onFileFound(fileEntry);
    }
    if (typeof options.maxFiles === 'number' && files.length >= options.maxFiles) {
      break;
    }
  }

  return files;
}
