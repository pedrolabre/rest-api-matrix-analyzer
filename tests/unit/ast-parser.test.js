import { describe, it, expect, vi } from 'vitest';
import {
  parseSourceToAst,
  formatParserError,
  mergeParserOptions,
  isAstNode,
  DEFAULT_PARSER_PLUGINS,
  DEFAULT_PARSER_OPTIONS,
} from '../../src/parsers/ast-parser.js';

describe('ast-parser', () => {
  describe('constantes e configuracoes padrao', () => {
    it('deve exportar DEFAULT_PARSER_PLUGINS como array congelado contendo os plugins essenciais', () => {
      expect(Object.isFrozen(DEFAULT_PARSER_PLUGINS)).toBe(true);
      expect(DEFAULT_PARSER_PLUGINS).toContain('jsx');
      expect(DEFAULT_PARSER_PLUGINS).toContain('asyncGenerators');
      expect(DEFAULT_PARSER_PLUGINS).toContain('dynamicImport');
      expect(DEFAULT_PARSER_PLUGINS).toContain('exportDefaultFrom');
      expect(DEFAULT_PARSER_PLUGINS).toContain('exportNamespaceFrom');
      expect(DEFAULT_PARSER_PLUGINS).toContain('classProperties');
      expect(DEFAULT_PARSER_PLUGINS).toContain('optionalChaining');
      expect(DEFAULT_PARSER_PLUGINS).toContain('nullishCoalescingOperator');
    });

    it('deve exportar DEFAULT_PARSER_OPTIONS como objeto congelado com sourceType unambiguous', () => {
      expect(Object.isFrozen(DEFAULT_PARSER_OPTIONS)).toBe(true);
      expect(DEFAULT_PARSER_OPTIONS.sourceType).toBe('unambiguous');
      expect(DEFAULT_PARSER_OPTIONS.allowReturnOutsideFunction).toBe(true);
      expect(DEFAULT_PARSER_OPTIONS.allowImportExportEverywhere).toBe(true);
      expect(DEFAULT_PARSER_OPTIONS.allowAwaitOutsideFunction).toBe(true);
      expect(DEFAULT_PARSER_OPTIONS.allowSuperOutsideMethod).toBe(true);
    });

    it('deve mesclar opcoes customizadas preservando plugins padrao e evitando duplicatas', () => {
      const merged = mergeParserOptions({
        sourceType: 'module',
        plugins: ['jsx', 'flow'],
      });

      expect(merged.sourceType).toBe('module');
      expect(merged.plugins).toContain('flow');
      expect(merged.plugins).toContain('jsx');
      expect(merged.plugins.filter((p) => p === 'jsx').length).toBe(1);
    });

    it('deve retornar opcoes padrao intactas quando nenhum argumento for passado para mergeParserOptions', () => {
      const merged = mergeParserOptions();
      expect(merged.sourceType).toBe('unambiguous');
      expect(merged.plugins.length).toBe(DEFAULT_PARSER_PLUGINS.length);
    });
  });

  describe('formatParserError', () => {
    it('deve extrair linha, coluna e mensagem limpa a partir de erro do Babel', () => {
      const babelError = {
        message: 'Unexpected token, expected ";" (12:4)',
        loc: { line: 12, column: 4 },
        code: 'BABEL_PARSER_SYNTAX_ERROR',
        reasonCode: 'UnexpectedToken',
      };

      const formatted = formatParserError(babelError, 'src/routes.js');

      expect(formatted.line).toBe(12);
      expect(formatted.column).toBe(4);
      expect(formatted.message).toBe('Unexpected token, expected ";"');
      expect(formatted.rawMessage).toBe('Unexpected token, expected ";" (12:4)');
      expect(formatted.code).toBe('BABEL_PARSER_SYNTAX_ERROR');
      expect(formatted.reasonCode).toBe('UnexpectedToken');
      expect(formatted.filePath).toBe('src/routes.js');
    });

    it('deve fornecer valores padrao seguros para erros sem coordenadas de localizacao', () => {
      const genericError = new Error('Erro generico');
      const formatted = formatParserError(genericError);

      expect(formatted.line).toBe(1);
      expect(formatted.column).toBe(0);
      expect(formatted.message).toBe('Erro generico');
      expect(formatted.filePath).toBe('');
    });

    it('deve tratar erro nulo ou indefinido sem lancar excecao', () => {
      const formatted = formatParserError(null);
      expect(formatted.line).toBe(1);
      expect(formatted.column).toBe(0);
      expect(formatted.message).toBe('Erro desconhecido de sintaxe ao gerar AST');
    });
  });

  describe('isAstNode', () => {
    it('deve retornar true para objetos com campo type em string', () => {
      expect(isAstNode({ type: 'File' })).toBe(true);
      expect(isAstNode({ type: 'Identifier', name: 'foo' })).toBe(true);
    });

    it('deve retornar false para valores primitivos, nulos ou objetos sem type', () => {
      expect(isAstNode(null)).toBe(false);
      expect(isAstNode(undefined)).toBe(false);
      expect(isAstNode('string')).toBe(false);
      expect(isAstNode(123)).toBe(false);
      expect(isAstNode({})).toBe(false);
      expect(isAstNode({ type: 123 })).toBe(false);
    });
  });

  describe('parseSourceToAst com codigo valido', () => {
    it('deve converter codigo JavaScript simples em no raiz File da AST', () => {
      const code = 'const answer = 42; console.log(answer);';
      const result = parseSourceToAst(code, 'src/math.js');

      expect(result.ok).toBe(true);
      expect(result.ast).not.toBeNull();
      expect(result.ast.type).toBe('File');
      expect(result.error).toBeNull();
      expect(result.filePath).toBe('src/math.js');
      expect(result.ast.program.body.length).toBe(2);
    });

    it('deve aceitar arquivo vazio e gerar AST valida com corpo de programa vazio', () => {
      const result = parseSourceToAst('', 'src/empty.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.ast.program.body).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('deve processar arquivo contendo apenas comentarios e quebras de linha', () => {
      const code = '// Linha de comentario\n/* Bloco de comentario */\n';
      const result = parseSourceToAst(code, 'src/comments.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.ast.program.body).toEqual([]);
    });

    it('deve processar modulos CommonJS com require e module.exports', () => {
      const code = `
        const express = require('express');
        const router = express.Router();
        router.get('/health', (req, res) => res.json({ status: 'ok' }));
        module.exports = router;
      `;
      const result = parseSourceToAst(code, 'server/routes/health.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.error).toBeNull();
    });

    it('deve processar ES Modules modernos com import e export', () => {
      const code = `
        import axios from 'axios';
        export const fetchUsers = () => axios.get('/api/users');
        export default fetchUsers;
      `;
      const result = parseSourceToAst(code, 'src/services/users.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.error).toBeNull();
    });

    it('deve processar componentes React com sintaxe JSX e fragments', () => {
      const code = `
        import React from 'react';
        export function ProfileCard({ user }) {
          return (
            <>
              <div className="card">
                <h1>{user.name}</h1>
                <p>{user.email}</p>
              </div>
            </>
          );
        }
      `;
      const result = parseSourceToAst(code, 'src/components/ProfileCard.jsx');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.error).toBeNull();
    });

    it('deve suportar recursos modernos: optional chaining, nullish coalescing e class fields', () => {
      const code = `
        class ServiceHandler {
          endpoint = '/api/v1';
          #secretKey = 'safe';

          async execute(params) {
            const token = params?.auth?.token ?? 'anonymous';
            return { token, endpoint: this.endpoint };
          }
        }
      `;
      const result = parseSourceToAst(code, 'src/services/handler.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
      expect(result.error).toBeNull();
    });

    it('deve suportar async generators e dynamic imports', () => {
      const code = `
        async function* streamChunks() {
          const mod = await import('./chunk-loader.js');
          yield mod.load();
        }
      `;
      const result = parseSourceToAst(code, 'src/stream.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
    });

    it('deve suportar exportDefaultFrom e exportNamespaceFrom', () => {
      const code = `
        export default from './module.js';
        export * as helpers from './helpers.js';
      `;
      const result = parseSourceToAst(code, 'src/index.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
    });

    it('deve permitir top-level await e return fora de funcao devido as opcoes permissivas', () => {
      const code = `
        const data = await Promise.resolve({ ok: true });
        return data;
      `;
      const result = parseSourceToAst(code, 'scripts/runner.js');

      expect(result.ok).toBe(true);
      expect(result.ast.type).toBe('File');
    });
  });

  describe('parseSourceToAst com erros de sintaxe e defensividade', () => {
    it('deve capturar erro de sintaxe graciosa e defensivamente sem lancar excecao', () => {
      const invalidCode = 'const a = ;';
      const result = parseSourceToAst(invalidCode, 'src/broken.js');

      expect(result.ok).toBe(false);
      expect(result.ast).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error.line).toBe(1);
      expect(result.error.column).toBeGreaterThanOrEqual(0);
      expect(result.error.message.length).toBeGreaterThan(0);
      expect(result.error.filePath).toBe('src/broken.js');
      expect(result.filePath).toBe('src/broken.js');
    });

    it('deve capturar erro de JSX mal-fechado sem quebrar a aplicacao', () => {
      const invalidJsx = 'export default () => <div><span></div>;';
      const result = parseSourceToAst(invalidJsx, 'src/BrokenComponent.jsx');

      expect(result.ok).toBe(false);
      expect(result.ast).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error.filePath).toBe('src/BrokenComponent.jsx');
    });

    it('deve registrar aviso no logger quando logger.warn for fornecido na presenca de erro sintatico', () => {
      const mockLogger = { warn: vi.fn() };
      const invalidCode = 'function () {';

      const result = parseSourceToAst(invalidCode, 'src/syntax.js', { logger: mockLogger });

      expect(result.ok).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[ast-parser] Falha de sintaxe')
      );
    });

    it('deve rejeitar entradas nao-string graciosamente sem lancar excecao', () => {
      const nonStringInputs = [null, undefined, 123, true, {}, []];

      nonStringInputs.forEach((input) => {
        const result = parseSourceToAst(input, 'src/invalid.js');
        expect(result.ok).toBe(false);
        expect(result.ast).toBeNull();
        expect(result.error.code).toBe('INVALID_INPUT');
      });
    });

    it('deve acionar logger.warn para entradas nao-string quando logger for fornecido', () => {
      const mockLogger = { warn: vi.fn() };
      const result = parseSourceToAst(null, 'src/null.js', { logger: mockLogger });

      expect(result.ok).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[ast-parser] Codigo-fonte invalido')
      );
    });
  });

  describe('flexibilidade de assinaturas de chamada', () => {
    it('deve aceitar objeto de opcoes como segundo argumento', () => {
      const code = 'const x = 10;';
      const result = parseSourceToAst(code, { filePath: 'src/flexible.js' });

      expect(result.ok).toBe(true);
      expect(result.filePath).toBe('src/flexible.js');
    });

    it('deve aceitar chamada sem filePath nem options com valores padrao', () => {
      const code = 'const x = 10;';
      const result = parseSourceToAst(code);

      expect(result.ok).toBe(true);
      expect(result.filePath).toBe('');
      expect(result.ast.type).toBe('File');
    });
  });
});
