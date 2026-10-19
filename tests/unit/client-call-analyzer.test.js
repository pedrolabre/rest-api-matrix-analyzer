import { describe, it, expect } from 'vitest';
import { parseSourceToAst } from '../../src/parsers/ast-parser.js';
import {
  CLIENT_HTTP_METHODS,
  DEFAULT_CLIENT_IDENTIFIERS,
  combineRoutePaths,
  extractExpressionName,
  extractCanonicalPathFromUrl,
  extractUrlInfo,
  extractCallerNameFromPath,
  extractClientCalls,
} from '../../src/analyzers/client-call-analyzer.js';

describe('client-call-analyzer', () => {
  describe('constantes exportadas', () => {
    it('deve exportar CLIENT_HTTP_METHODS congelado com verbos http suportados', () => {
      expect(Object.isFrozen(CLIENT_HTTP_METHODS)).toBe(true);
      expect(CLIENT_HTTP_METHODS).toEqual(['get', 'post', 'put', 'patch', 'delete']);
    });

    it('deve exportar DEFAULT_CLIENT_IDENTIFIERS congelado com identificadores comuns', () => {
      expect(Object.isFrozen(DEFAULT_CLIENT_IDENTIFIERS)).toBe(true);
      expect(DEFAULT_CLIENT_IDENTIFIERS).toContain('axios');
      expect(DEFAULT_CLIENT_IDENTIFIERS).toContain('api');
      expect(DEFAULT_CLIENT_IDENTIFIERS).toContain('client');
      expect(DEFAULT_CLIENT_IDENTIFIERS).toContain('httpClient');
      expect(DEFAULT_CLIENT_IDENTIFIERS).toContain('apiClient');
    });
  });

  describe('combineRoutePaths e extractExpressionName', () => {
    it('deve combinar caminhos e prefixos sem barras duplicadas', () => {
      expect(combineRoutePaths('/api', '/users')).toBe('/api/users');
      expect(combineRoutePaths('/api/', '/users/')).toBe('/api/users');
      expect(combineRoutePaths('', '/users')).toBe('/users');
    });

    it('deve extrair nomes de identificadores e membros', () => {
      const { ast } = parseSourceToAst('api.service.getUsers();');
      const call = ast.program.body[0].expression;
      expect(extractExpressionName(call.callee)).toBe('api.service.getUsers');
    });
  });

  describe('extractCanonicalPathFromUrl', () => {
    it('deve normalizar caminhos relativos simples', () => {
      expect(extractCanonicalPathFromUrl('/api/users')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('api/users')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('/api/users/')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('//api///users//')).toBe('/api/users');
    });

    it('deve extrair pathname canonico a partir de URLs com protocolo http ou https', () => {
      expect(extractCanonicalPathFromUrl('https://api.example.com/api/users')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('http://localhost:3000/api/v1/posts')).toBe('/api/v1/posts');
      expect(extractCanonicalPathFromUrl('http://127.0.0.1:8080/users/:id')).toBe('/users/:id');
      expect(extractCanonicalPathFromUrl('https://api.example.com')).toBe('/');
      expect(extractCanonicalPathFromUrl('https://api.example.com/')).toBe('/');
    });

    it('deve descartar parametros de query string e hashes na canonizacao', () => {
      expect(extractCanonicalPathFromUrl('/api/users?page=1&limit=20')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('/api/users#section-profile')).toBe('/api/users');
      expect(extractCanonicalPathFromUrl('https://api.example.com/api/orders?status=active#details')).toBe('/api/orders');
    });

    it('deve lidar com caminhos vazios, nulos ou espacos em branco', () => {
      expect(extractCanonicalPathFromUrl('')).toBe('/');
      expect(extractCanonicalPathFromUrl('   ')).toBe('/');
      expect(extractCanonicalPathFromUrl(null)).toBe('/');
      expect(extractCanonicalPathFromUrl(undefined)).toBe('/');
      expect(extractCanonicalPathFromUrl('/')).toBe('/');
    });
  });

  describe('extractUrlInfo', () => {
    it('deve extrair informacoes de StringLiteral simples', () => {
      const { ast } = parseSourceToAst("fetch('/api/users');");
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: '/api/users',
        canonicalPath: '/api/users',
      });
    });

    it('deve extrair informacoes de TemplateLiteral estatico', () => {
      const { ast } = parseSourceToAst('fetch(`/api/static`);');
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: '/api/static',
        canonicalPath: '/api/static',
      });
    });

    it('deve extrair informacoes de TemplateLiteral interpolado com variaveis', () => {
      const { ast } = parseSourceToAst('fetch(`/api/users/${userId}/posts/${postId}`);');
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: '/api/users/${userId}/posts/${postId}',
        canonicalPath: '/api/users/:userId/posts/:postId',
      });
    });

    it('deve extrair informacoes de BinaryExpression com concatenacao de strings', () => {
      const { ast } = parseSourceToAst("fetch('/api/' + 'users');");
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: '/api/ + users',
        canonicalPath: '/api/users',
      });
    });

    it('deve extrair informacoes de BinaryExpression com concatenacao de variavel', () => {
      const { ast } = parseSourceToAst("fetch('/api/users/' + id);");
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: '/api/users/ + id',
        canonicalPath: '/api/users/:id',
      });
    });

    it('deve extrair informacoes de BinaryExpression com prefixo de variavel', () => {
      const { ast } = parseSourceToAst("fetch(BASE_URL + '/api/users');");
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: "BASE_URL + '/api/users'",
        canonicalPath: '/api/users',
      });
    });

    it('deve extrair informacoes de Identifier como placeholder', () => {
      const { ast } = parseSourceToAst('fetch(ENDPOINT);');
      const urlArg = ast.program.body[0].expression.arguments[0];
      const result = extractUrlInfo(urlArg);

      expect(result).toEqual({
        rawUrl: 'ENDPOINT',
        canonicalPath: '/:ENDPOINT',
      });
    });

    it('deve retornar null para nos incompativeis com caminho ou url', () => {
      expect(extractUrlInfo(null)).toBeNull();
      expect(extractUrlInfo({ type: 'NumericLiteral', value: 42 })).toBeNull();
      expect(extractUrlInfo({ type: 'BooleanLiteral', value: true })).toBeNull();
    });
  });

  describe('extractCallerNameFromPath', () => {
    it('deve extrair callerName de FunctionDeclaration nomeada', () => {
      const { ast } = parseSourceToAst(`
        function loadUsers() {
          fetch('/api/users');
        }
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('loadUsers');
    });

    it('deve extrair callerName de arrow function atribuida a variavel', () => {
      const { ast } = parseSourceToAst(`
        const fetchProfile = async () => {
          return axios.get('/api/profile');
        };
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('fetchProfile');
    });

    it('deve extrair callerName de FunctionExpression atribuida a variavel', () => {
      const { ast } = parseSourceToAst(`
        const getOrders = function() {
          return api.get('/api/orders');
        };
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('getOrders');
    });

    it('deve extrair callerName de metodos de objeto e classe', () => {
      const { ast } = parseSourceToAst(`
        const userService = {
          listUsers() {
            fetch('/api/users');
          },
          deleteUser: (id) => {
            axios.delete('/api/users/' + id);
          }
        };

        class OrderClient {
          async getOrder() {
            return axios.get('/api/order');
          }
        }
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(3);
      expect(calls[0].callerName).toBe('listUsers');
      expect(calls[1].callerName).toBe('deleteUser');
      expect(calls[2].callerName).toBe('getOrder');
    });

    it('deve extrair callerName de atribuicao a expressao de membro', () => {
      const { ast } = parseSourceToAst(`
        userService.find = () => {
          fetch('/api/find');
        };
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('userService.find');
    });

    it('deve extrair nome do componente React quando a chamada esta dentro de useEffect', () => {
      const { ast } = parseSourceToAst(`
        function UserProfile({ userId }) {
          useEffect(() => {
            fetch('/api/users/' + userId);
          }, [userId]);

          return <div>Profile</div>;
        }
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('UserProfile');
    });

    it('deve extrair nome de componente React arrow function com useEffect', () => {
      const { ast } = parseSourceToAst(`
        const ProductList = () => {
          useEffect(() => {
            axios.get('/api/products');
          }, []);

          return <div>Products</div>;
        };
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('ProductList');
    });

    it('deve extrair nome de custom hook que invoca useEffect', () => {
      const { ast } = parseSourceToAst(`
        function useDashboardStats() {
          useEffect(() => {
            api.get('/api/stats');
          }, []);
        }
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('useDashboardStats');
    });

    it('deve atribuir useEffect quando nao houver componente delimitador nomeado', () => {
      const { ast } = parseSourceToAst(`
        useEffect(() => {
          fetch('/api/orphan');
        }, []);
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('useEffect');
    });

    it('deve atribuir anonymous para arrow functions isoladas sem nome', () => {
      const { ast } = parseSourceToAst(`
        (() => {
          fetch('/api/anonymous');
        })();
      `);
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBe('anonymous');
    });

    it('deve retornar null para chamadas disparadas no escopo global', () => {
      const { ast } = parseSourceToAst("fetch('/api/health');");
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(1);
      expect(calls[0].callerName).toBeNull();
    });
  });

  describe('chamadas globais de fetch', () => {
    it('deve extrair chamada fetch simples inferindo metodo GET por padrao', () => {
      const { ast } = parseSourceToAst("fetch('/api/users');", 'src/services/api.js');
      const calls = extractClientCalls(ast, 'src/services/api.js');

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/users',
        rawUrl: '/api/users',
        filePath: 'src/services/api.js',
        clientType: 'fetch',
      });
      expect(calls[0].line).toBe(1);
    });

    it('deve extrair metodo HTTP explicito a partir do objeto init de opcoes', () => {
      const code = `
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Pedro' }),
        });

        fetch('/api/users/123', {
          method: 'put',
        });

        fetch('/api/users/456', {
          method: 'DELETE',
        });

        fetch('/api/users/789', {
          method: 'patch',
        });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(4);
      expect(calls[0].method).toBe('POST');
      expect(calls[1].method).toBe('PUT');
      expect(calls[2].method).toBe('DELETE');
      expect(calls[3].method).toBe('PATCH');
    });

    it('deve suportar window.fetch e globalThis.fetch', () => {
      const code = `
        window.fetch('/api/window');
        globalThis.fetch('/api/global', { method: 'POST' });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/window',
        clientType: 'fetch',
      });
      expect(calls[1]).toMatchObject({
        method: 'POST',
        canonicalPath: '/api/global',
        clientType: 'fetch',
      });
    });

    it('deve ignorar com seguranca metodos fora da matriz REST como OPTIONS e HEAD', () => {
      const code = `
        fetch('/api/options', { method: 'OPTIONS' });
        fetch('/api/head', { method: 'HEAD' });
        fetch('/api/valid', { method: 'GET' });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(calls[0].canonicalPath).toBe('/api/valid');
    });

    it('deve ignorar chamadas fetch sem argumentos', () => {
      const { ast } = parseSourceToAst('fetch();');
      const calls = extractClientCalls(ast);
      expect(calls).toHaveLength(0);
    });
  });

  describe('metodos de atalho do axios', () => {
    it('deve extrair todos os metodos de atalho padrao em axios', () => {
      const code = `
        axios.get('/api/users');
        axios.post('/api/users', { name: 'Pedro' });
        axios.put('/api/users/1', { name: 'Pedro' });
        axios.patch('/api/users/1', { active: true });
        axios.delete('/api/users/1');
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(5);
      expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
      expect(calls.every((c) => c.clientType === 'axios')).toBe(true);
    });

    it('deve reconhecer chamadas via axios.default', () => {
      const { ast } = parseSourceToAst("axios.default.get('/api/default');");
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/default',
        clientType: 'axios',
      });
    });

    it('deve extrair URLs interpoladas em metodos de atalho do axios', () => {
      const code = `
        const id = 42;
        axios.get(\`/api/users/\${id}/details\`);
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/users/:id/details',
        rawUrl: '/api/users/${id}/details',
      });
    });
  });

  describe('instancias customizadas de cliente HTTP', () => {
    it('deve reconhecer identificadores convencionais como api, client e httpClient', () => {
      const code = `
        api.get('/api/profile');
        client.post('/api/auth/login', creds);
        httpClient.delete('/api/items/99');
        apiClient.patch('/api/settings', payload);
        http.put('/api/update', data);
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(5);
      expect(calls[0]).toMatchObject({ method: 'GET', canonicalPath: '/api/profile', clientType: 'axios' });
      expect(calls[1]).toMatchObject({ method: 'POST', canonicalPath: '/api/auth/login', clientType: 'axios' });
      expect(calls[2]).toMatchObject({ method: 'DELETE', canonicalPath: '/api/items/99', clientType: 'axios' });
      expect(calls[3]).toMatchObject({ method: 'PATCH', canonicalPath: '/api/settings', clientType: 'axios' });
      expect(calls[4]).toMatchObject({ method: 'PUT', canonicalPath: '/api/update', clientType: 'axios' });
    });

    it('deve detectar automaticamente instancias criadas via axios.create()', () => {
      const code = `
        const myCustomClient = axios.create({ baseURL: 'https://api.myapp.com' });
        myCustomClient.get('/api/dashboard');
        myCustomClient.delete('/api/dashboard/reset');
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', canonicalPath: '/api/dashboard', clientType: 'axios' });
      expect(calls[1]).toMatchObject({ method: 'DELETE', canonicalPath: '/api/dashboard/reset', clientType: 'axios' });
    });

    it('deve aceitar identificadores de clientes adicionais via options.clientIdentifiers', () => {
      const code = `
        remoteGateway.get('/api/ping');
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast, 'client.js', {
        clientIdentifiers: ['remoteGateway'],
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/ping',
        clientType: 'axios',
      });
    });
  });

  describe('chamadas axios genericas configuradas via objeto', () => {
    it('deve extrair chamadas axios({ method, url }) com metodo explicito', () => {
      const code = `
        axios({
          method: 'POST',
          url: '/api/users',
          data: { name: 'Pedro' },
        });

        api({
          method: 'delete',
          url: '/api/users/1',
        });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'POST', canonicalPath: '/api/users', clientType: 'axios' });
      expect(calls[1]).toMatchObject({ method: 'DELETE', canonicalPath: '/api/users/1', clientType: 'axios' });
    });

    it('deve inferir GET como padrao em axios({ url }) quando method nao e fornecido', () => {
      const { ast } = parseSourceToAst("axios({ url: '/api/settings' });");
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/settings',
        clientType: 'axios',
      });
    });

    it('deve suportar chamadas axios(url, config)', () => {
      const code = `
        axios('/api/direct-url');
        axios('/api/direct-post', { method: 'POST' });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ method: 'GET', canonicalPath: '/api/direct-url', clientType: 'axios' });
      expect(calls[1]).toMatchObject({ method: 'POST', canonicalPath: '/api/direct-post', clientType: 'axios' });
    });

    it('deve suportar axios.request({ method, url })', () => {
      const code = `
        axios.request({
          method: 'PUT',
          url: '/api/orders/55',
        });
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'PUT',
        canonicalPath: '/api/orders/55',
        clientType: 'axios',
      });
    });
  });

  describe('integracao com componentes React e modulos complexos', () => {
    it('deve extrair multiplas chamadas ordenadas por linha em componente React', () => {
      const componentCode = `
        import React, { useEffect, useState } from 'react';
        import axios from 'axios';

        export function UsersPage() {
          const [users, setUsers] = useState([]);

          useEffect(() => {
            fetch('/api/users')
              .then((res) => res.json())
              .then((data) => setUsers(data));
          }, []);

          const handleDelete = async (id) => {
            await axios.delete('/api/users/' + id);
          };

          const handleCreate = async () => {
            await axios.post('/api/users', { name: 'Novo' });
          };

          return <div>Usuarios</div>;
        }
      `;
      const { ast } = parseSourceToAst(componentCode, 'src/pages/UsersPage.jsx');
      const calls = extractClientCalls(ast, 'src/pages/UsersPage.jsx');

      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/api/users',
        clientType: 'fetch',
        callerName: 'UsersPage',
        filePath: 'src/pages/UsersPage.jsx',
      });
      expect(calls[1]).toMatchObject({
        method: 'DELETE',
        canonicalPath: '/api/users/:id',
        clientType: 'axios',
        callerName: 'handleDelete',
        filePath: 'src/pages/UsersPage.jsx',
      });
      expect(calls[2]).toMatchObject({
        method: 'POST',
        canonicalPath: '/api/users',
        clientType: 'axios',
        callerName: 'handleCreate',
        filePath: 'src/pages/UsersPage.jsx',
      });
      expect(calls[0].line).toBeLessThan(calls[1].line);
      expect(calls[1].line).toBeLessThan(calls[2].line);
    });

    it('deve extrair chamadas em modulo de servico com CommonJS require', () => {
      const serviceCode = `
        const axios = require('axios');

        function fetchCatalog() {
          return axios.get('https://api.store.com/v1/catalog');
        }

        module.exports = { fetchCatalog };
      `;
      const { ast } = parseSourceToAst(serviceCode, 'services/catalog.js');
      const calls = extractClientCalls(ast, 'services/catalog.js');

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        canonicalPath: '/v1/catalog',
        rawUrl: 'https://api.store.com/v1/catalog',
        clientType: 'axios',
        callerName: 'fetchCatalog',
      });
    });

    it('deve retornar array vazio para arquivos sem chamadas HTTP', () => {
      const code = `
        export const sum = (a, b) => a + b;
        export const multiply = (a, b) => a * b;
      `;
      const { ast } = parseSourceToAst(code);
      const calls = extractClientCalls(ast);
      expect(calls).toEqual([]);
    });

    it('deve suportar payload de retorno de parseSourceToAst diretamente', () => {
      const parseResult = parseSourceToAst("fetch('/api/test');", 'custom/file.js');
      const calls = extractClientCalls(parseResult);

      expect(calls).toHaveLength(1);
      expect(calls[0].filePath).toBe('custom/file.js');
    });

    it('deve retornar array vazio defensivamente para entradas nulas ou com falha sintatica', () => {
      expect(extractClientCalls(null)).toEqual([]);
      expect(extractClientCalls(undefined)).toEqual([]);
      expect(extractClientCalls({})).toEqual([]);
      expect(extractClientCalls({ ok: false, ast: null })).toEqual([]);
    });

    it('deve garantir imutabilidade estrita e conformidade com o contrato createHttpCall', () => {
      const { ast } = parseSourceToAst("fetch('/api/freeze');");
      const calls = extractClientCalls(ast);

      expect(calls).toHaveLength(1);
      expect(Object.isFrozen(calls[0])).toBe(true);
      expect(() => {
        calls[0].method = 'POST';
      }).toThrow();
    });
  });
});
