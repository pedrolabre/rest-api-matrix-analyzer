/**
 * Modulo de filtragem e exclusao segura de arquivos e diretorios.
 * Estabelece regras estritas para selecionar exclusivamente arquivos de codigo-fonte
 * relevantes para analise sintatica, descartando pastas pesadas, arquivos minificados
 * e arquivos com variaveis confidenciais ou credenciais.
 */

/**
 * Extensoes de arquivo compativeis com parsing AST JavaScript/ECMAScript.
 */
export const ALLOWED_EXTENSIONS = Object.freeze(['.js', '.jsx', '.mjs', '.cjs']);

/**
 * Nomes de diretorios categoricamente ignorados no traversal e na ingestao.
 */
export const IGNORED_DIR_NAMES = Object.freeze([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.git',
  '.svn',
  '.hg',
  'coverage',
  '.nyc_output',
  '.cache',
  '.turbo',
]);

/**
 * Nomes de arquivos de manifesto de lock categoricamente ignorados.
 */
export const LOCKFILE_NAMES = Object.freeze([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

/**
 * Padroes de arquivos minificados ou empacotados que devem ser descartados.
 */
const MINIFIED_PATTERNS = Object.freeze([
  /\.(min|bundle)\.(js|jsx|mjs|cjs)$/i,
  /^bundle\.(js|jsx|mjs|cjs)$/i,
]);

/**
 * Normaliza os separadores de caminho de arquivo para barras retas (/),
 * eliminando duplicacoes de barras e espacos em branco nas extremidades.
 *
 * @param {string} pathString - Caminho de arquivo ou diretorio a ser normalizado.
 * @returns {string} Caminho com barras retas unificadas.
 */
export function normalizePathSeparators(pathString) {
  if (typeof pathString !== 'string') {
    return '';
  }

  const trimmed = pathString.trim();
  if (trimmed.length === 0) {
    return '';
  }

  // Converte barras invertidas do Windows para barras retas
  const withForwardSlashes = trimmed.replace(/\\+/g, '/');

  // Substitui multiplas barras consecutivas por uma unica barra,
  // preservando a barra inicial caso o caminho seja absoluto Unix (/foo/bar).
  const isAbsoluteUnix = withForwardSlashes.startsWith('/');
  const segments = withForwardSlashes.split('/').filter(Boolean);
  const normalized = segments.join('/');

  return isAbsoluteUnix ? `/${normalized}` : normalized;
}

/**
 * Extrai o nome base do arquivo ou segmento final a partir de um caminho.
 *
 * @param {string} filePath - Caminho completo ou relativo.
 * @returns {string} Nome do arquivo ou segmento final.
 */
function extractBaseName(filePath) {
  const normalized = normalizePathSeparators(filePath);
  if (!normalized) {
    return '';
  }
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Avalia se um nome de diretorio ou caminho relativo pertence a lista
 * de pastas categoricamente ignoradas pelo motor de analise.
 * A verificacao e insensivel a maiusculas e minusculas.
 *
 * @param {string} dirNameOrPath - Nome do diretorio ou caminho relativo completo.
 * @returns {boolean} Verdadeiro caso o diretorio deva ser descartado.
 */
export function isIgnoredDirectory(dirNameOrPath) {
  if (typeof dirNameOrPath !== 'string') {
    return false;
  }

  const normalized = normalizePathSeparators(dirNameOrPath);
  if (!normalized) {
    return false;
  }

  const segments = normalized.split('/').map((s) => s.toLowerCase());
  const ignoredSet = new Set(IGNORED_DIR_NAMES.map((name) => name.toLowerCase()));

  return segments.some((segment) => ignoredSet.has(segment));
}

/**
 * Verifica se um arquivo corresponde a padroes de segredos ou variaveis de ambiente
 * confidenciais (.env, .env.local, .env.production), permitindo apenas modelos publicos (.env.example).
 *
 * @param {string} fileNameOrPath - Nome ou caminho do arquivo.
 * @returns {boolean} Verdadeiro se o arquivo for sensivel e nao puder ser lido.
 */
export function isSensitiveFile(fileNameOrPath) {
  if (typeof fileNameOrPath !== 'string') {
    return false;
  }

  const baseName = extractBaseName(fileNameOrPath).toLowerCase();
  if (!baseName) {
    return false;
  }

  // Arquivos de exemplo e documentacao publica de variaveis sao seguros
  if (baseName === '.env.example' || baseName === '.env.sample' || baseName === '.env.template') {
    return false;
  }

  // Bloqueio categorico de arquivos de ambiente reais ou variantes
  if (baseName === '.env' || baseName.startsWith('.env.')) {
    return true;
  }

  // Certificados e chaves privadas
  if (/\.(pem|key|pkcs12|pfx|keystore)$/i.test(baseName)) {
    return true;
  }

  return false;
}

/**
 * Identifica se um arquivo e minificado ou bundle pre-compilado,
 * com base no nome do arquivo ou padrao de extensao.
 *
 * @param {string} fileNameOrPath - Nome ou caminho do arquivo.
 * @returns {boolean} Verdadeiro se o arquivo for minificado.
 */
export function isMinifiedFile(fileNameOrPath) {
  if (typeof fileNameOrPath !== 'string') {
    return false;
  }

  const baseName = extractBaseName(fileNameOrPath);
  if (!baseName) {
    return false;
  }

  return MINIFIED_PATTERNS.some((pattern) => pattern.test(baseName));
}

/**
 * Avalia se um arquivo e elegivel para o processamento sintatico com Babel.
 * Um arquivo e considerado processavel se:
 * 1. Possui extensao permitida (.js, .jsx, .mjs, .cjs);
 * 2. Nao e um arquivo minificado (*.min.js, *.bundle.js);
 * 3. Nao e um arquivo de manifesto de lock (package-lock.json, etc.);
 * 4. Nao e um arquivo sensivel com credenciais (.env);
 * 5. Nao esta contido dentro de um diretorio ignorado (node_modules, dist, etc.).
 *
 * @param {string} fileNameOrPath - Nome ou caminho relativo do arquivo.
 * @returns {boolean} Verdadeiro caso o arquivo deva ser lido e submetido ao parser.
 */
export function isProcessableFile(fileNameOrPath) {
  if (typeof fileNameOrPath !== 'string') {
    return false;
  }

  const normalized = normalizePathSeparators(fileNameOrPath);
  if (!normalized) {
    return false;
  }

  // Se o caminho estiver dentro de uma pasta ignorada, descartar imediatamente
  if (isIgnoredDirectory(normalized)) {
    return false;
  }

  const baseName = extractBaseName(normalized);
  if (!baseName) {
    return false;
  }

  // Descarte de arquivos sensíveis
  if (isSensitiveFile(baseName)) {
    return false;
  }

  // Descarte de lockfiles
  const lowerBase = baseName.toLowerCase();
  if (LOCKFILE_NAMES.includes(lowerBase)) {
    return false;
  }

  // Descarte de arquivos minificados
  if (isMinifiedFile(baseName)) {
    return false;
  }

  // Validacao de extensao permitida
  const dotIndex = lowerBase.lastIndexOf('.');
  if (dotIndex <= 0) {
    return false;
  }

  const extension = lowerBase.slice(dotIndex);
  return ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Avalia se um determinado caminho relativo de diretorio ou arquivo
 * pode ser navegado com seguranca durante a varredura, garantindo
 * que nenhuma arvore de pastas ignoradas seja percorrida.
 *
 * @param {string} relativePath - Caminho relativo do diretorio ou arquivo.
 * @returns {boolean} Verdadeiro se o caminho pode ser acessado na varredura.
 */
export function shouldScanPath(relativePath) {
  if (typeof relativePath !== 'string') {
    return false;
  }

  const normalized = normalizePathSeparators(relativePath);
  if (!normalized) {
    return false;
  }

  return !isIgnoredDirectory(normalized);
}
