/**
 * Wrapper de Parsing AST Seguro com Babel Parser
 * rest-api-matrix-analyzer
 *
 * Converte strings de codigo-fonte JavaScript e JSX moderno em arvore
 * de sintaxe abstrata (AST) do Babel, com configuracoes permissivas e
 * tratamento defensivo contra erros de sintaxe sem abortar a analise global.
 */

import { parse } from '@babel/parser';

/**
 * Plugins padrao configurados para cobrir sintaxes modernas de JS, JSX e propostas estaveis.
 */
export const DEFAULT_PARSER_PLUGINS = Object.freeze([
  'jsx',
  'asyncGenerators',
  'dynamicImport',
  'exportDefaultFrom',
  'exportNamespaceFrom',
  'classProperties',
  'optionalChaining',
  'nullishCoalescingOperator',
]);

/**
 * Opcoes padrao permissivas para suportar CommonJS, ES Modules, top-level await e returns soltos.
 */
export const DEFAULT_PARSER_OPTIONS = Object.freeze({
  sourceType: 'unambiguous',
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true,
  allowAwaitOutsideFunction: true,
  allowSuperOutsideMethod: true,
  plugins: DEFAULT_PARSER_PLUGINS,
});

/**
 * Mescla opcoes customizadas com as opcoes padrao do parser, unificando plugins sem duplicatas.
 *
 * @param {Object} [customOptions={}]
 * @returns {Object}
 */
export function mergeParserOptions(customOptions = {}) {
  if (!customOptions || typeof customOptions !== 'object') {
    return { ...DEFAULT_PARSER_OPTIONS, plugins: [...DEFAULT_PARSER_PLUGINS] };
  }

  const { plugins: customPlugins, ...restCustom } = customOptions;

  const plugins = Array.isArray(customPlugins)
    ? Array.from(new Set([...DEFAULT_PARSER_PLUGINS, ...customPlugins]))
    : [...DEFAULT_PARSER_PLUGINS];

  return {
    ...DEFAULT_PARSER_OPTIONS,
    ...restCustom,
    plugins,
  };
}

/**
 * Normaliza e formata um erro de parsing sintatico do Babel em estrutura padronizada.
 *
 * @param {Error|Object} error
 * @param {string} [filePath='']
 * @returns {Object}
 */
export function formatParserError(error, filePath = '') {
  const line = error?.loc?.line ?? (typeof error?.lineNumber === 'number' ? error.lineNumber : 1);
  const column = error?.loc?.column ?? (typeof error?.columnNumber === 'number' ? error.columnNumber : 0);
  const rawMessage = error?.message ? String(error.message) : 'Erro desconhecido de sintaxe ao gerar AST';
  const cleanMessage = rawMessage.replace(/\s*\(\d+:\d+\)$/, '').trim();

  return {
    message: cleanMessage,
    rawMessage,
    line,
    column,
    code: error?.code || 'BABEL_PARSER_SYNTAX_ERROR',
    reasonCode: error?.reasonCode || null,
    filePath: typeof filePath === 'string' ? filePath : '',
  };
}

/**
 * Valida se um determinado objeto possui a estrutura minima de um no AST valido.
 *
 * @param {unknown} node
 * @returns {boolean}
 */
export function isAstNode(node) {
  return Boolean(node && typeof node === 'object' && typeof node.type === 'string');
}

/**
 * Converte codigo-fonte em AST de forma tolerante a falhas.
 *
 * @param {string} code - Conteudo do arquivo em texto
 * @param {string|Object} [filePathOrOptions=''] - Caminho do arquivo ou objeto de opcoes
 * @param {Object} [options={}] - Opcoes adicionais do Babel e configuracoes de logging
 * @returns {{ ok: boolean, ast: Object|null, error: Object|null, filePath: string }}
 */
export function parseSourceToAst(code, filePathOrOptions = '', options = {}) {
  let resolvedFilePath = '';
  let resolvedOptions = {};

  if (typeof filePathOrOptions === 'object' && filePathOrOptions !== null) {
    resolvedOptions = filePathOrOptions;
    resolvedFilePath = typeof resolvedOptions.filePath === 'string' ? resolvedOptions.filePath : '';
  } else {
    resolvedFilePath = typeof filePathOrOptions === 'string' ? filePathOrOptions : '';
    resolvedOptions = typeof options === 'object' && options !== null ? options : {};
  }

  if (typeof code !== 'string') {
    const errorDetails = {
      message: `Codigo-fonte invalido: esperado string, recebido ${code === null ? 'null' : typeof code}`,
      rawMessage: `Codigo-fonte invalido: esperado string, recebido ${code === null ? 'null' : typeof code}`,
      line: 1,
      column: 0,
      code: 'INVALID_INPUT',
      reasonCode: 'InvalidInput',
      filePath: resolvedFilePath,
    };

    if (resolvedOptions?.logger && typeof resolvedOptions.logger.warn === 'function') {
      resolvedOptions.logger.warn(
        `[ast-parser] ${errorDetails.message} em '${resolvedFilePath || 'arquivo anonimo'}'`
      );
    }

    return {
      ok: false,
      ast: null,
      error: errorDetails,
      filePath: resolvedFilePath,
    };
  }

  try {
    const parserOptions = mergeParserOptions(resolvedOptions);
    const ast = parse(code, parserOptions);

    return {
      ok: true,
      ast,
      error: null,
      filePath: resolvedFilePath,
    };
  } catch (err) {
    const formattedError = formatParserError(err, resolvedFilePath);

    if (resolvedOptions?.logger && typeof resolvedOptions.logger.warn === 'function') {
      resolvedOptions.logger.warn(
        `[ast-parser] Falha de sintaxe ao analisar '${resolvedFilePath || 'arquivo anonimo'}': ${formattedError.message} (linha ${formattedError.line}, coluna ${formattedError.column})`
      );
    }

    return {
      ok: false,
      ast: null,
      error: formattedError,
      filePath: resolvedFilePath,
    };
  }
}
