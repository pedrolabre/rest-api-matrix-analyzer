import { describe, it, expect, vi } from 'vitest';
import {
  isFileSystemAccessSupported,
  pickDirectory,
  traverseDirectory,
  readLocalDirectory,
} from '../../src/parsers/directory-reader.js';

/**
 * Cria um mock de FileSystemFileHandle com conteudo em texto.
 *
 * @param {string} name - Nome do arquivo com extensao.
 * @param {string} [content=''] - Conteudo textual simulado.
 * @returns {object} Mock compativel com FileSystemFileHandle.
 */
function createMockFileHandle(name, content = '') {
  return {
    kind: 'file',
    name,
    getFile: vi.fn(async () => ({
      name,
      size: content.length,
      text: async () => content,
    })),
  };
}

/**
 * Cria um mock de FileSystemDirectoryHandle a partir de uma lista de handles filhos.
 *
 * @param {string} name - Nome da pasta.
 * @param {Array<object>} [children=[]] - Lista de FileSystemFileHandle ou FileSystemDirectoryHandle.
 * @param {object} [options={}] - Opcoes adicionais como rastreamento de chamadas.
 * @returns {object} Mock compativel com FileSystemDirectoryHandle.
 */
function createMockDirectoryHandle(name, children = [], options = {}) {
  const valuesSpy = vi.fn(async function* () {
    for (const child of children) {
      yield child;
    }
  });

  if (options.trackSpy) {
    options.trackSpy(valuesSpy);
  }

  return {
    kind: 'directory',
    name,
    values: valuesSpy,
  };
}

/**
 * Cria uma arvore hierarquica de mocks a partir de uma definicao declarativa em objeto.
 *
 * @param {string} rootName - Nome da pasta raiz.
 * @param {object} treeDef - Mapa de nomes para strings (conteudo de arquivo) ou sub-objetos (pastas).
 * @param {Map<string, Function>} [spyRegistry] - Registro opcional para verificar se values() de certas pastas foi chamado.
 * @returns {object} Mock de FileSystemDirectoryHandle raiz.
 */
function createTreeMock(rootName, treeDef, spyRegistry = new Map()) {
  const children = [];

  for (const [key, val] of Object.entries(treeDef)) {
    if (typeof val === 'string') {
      children.push(createMockFileHandle(key, val));
    } else if (typeof val === 'object' && val !== null) {
      const childDir = createTreeMock(key, val, spyRegistry);
      children.push(childDir);
    }
  }

  const dirHandle = createMockDirectoryHandle(rootName, children, {
    trackSpy: (spy) => {
      spyRegistry.set(rootName, spy);
    },
  });

  return dirHandle;
}

describe('directory-reader: isFileSystemAccessSupported', () => {
  it('deve retornar verdadeiro quando window.showDirectoryPicker for uma funcao', () => {
    const mockWindow = {
      showDirectoryPicker: vi.fn(),
    };
    expect(isFileSystemAccessSupported(mockWindow)).toBe(true);
  });

  it('deve retornar falso quando targetWindow for nulo ou indefinido', () => {
    expect(isFileSystemAccessSupported(null)).toBe(false);
    expect(isFileSystemAccessSupported(undefined)).toBe(false);
  });

  it('deve retornar falso quando showDirectoryPicker nao estiver presente', () => {
    const mockWindow = {};
    expect(isFileSystemAccessSupported(mockWindow)).toBe(false);
  });

  it('deve retornar falso quando showDirectoryPicker nao for uma funcao', () => {
    const mockWindow = { showDirectoryPicker: 'nao-e-funcao' };
    expect(isFileSystemAccessSupported(mockWindow)).toBe(false);
  });
});

describe('directory-reader: pickDirectory', () => {
  it('deve retornar o handle quando o usuario escolhe um diretorio com sucesso', async () => {
    const fakeHandle = { kind: 'directory', name: 'meu-projeto' };
    const mockWindow = {
      showDirectoryPicker: vi.fn().mockResolvedValue(fakeHandle),
    };

    const result = await pickDirectory({ id: 'app-folder' }, mockWindow);

    expect(mockWindow.showDirectoryPicker).toHaveBeenCalledWith({ id: 'app-folder' });
    expect(result).toBe(fakeHandle);
  });

  it('deve retornar null silenciosamente quando o usuario cancela o seletor (AbortError)', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    const mockWindow = {
      showDirectoryPicker: vi.fn().mockRejectedValue(abortError),
    };

    const result = await pickDirectory({}, mockWindow);

    expect(result).toBeNull();
  });

  it('deve propagar o erro caso ocorra uma falha diferente de cancelamento (ex: SecurityError)', async () => {
    const securityError = new Error('Permission denied.');
    securityError.name = 'SecurityError';

    const mockWindow = {
      showDirectoryPicker: vi.fn().mockRejectedValue(securityError),
    };

    await expect(pickDirectory({}, mockWindow)).rejects.toThrow('Permission denied.');
  });

  it('deve disparar erro quando a API nao for suportada no ambiente', async () => {
    const mockWindow = {};

    await expect(pickDirectory({}, mockWindow)).rejects.toThrow(
      'File System Access API nao e suportada neste ambiente.'
    );
  });
});

describe('directory-reader: traverseDirectory', () => {
  it('deve lancar TypeError se dirHandle for nulo, indefinido ou nao possuir metodo values()', async () => {
    await expect(async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of traverseDirectory(null)) {
        // no-op
      }
    }).rejects.toThrow(TypeError);

    await expect(async () => {
      // eslint-disable-next-line no-unused-vars
      for await (const _ of traverseDirectory({})) {
        // no-op
      }
    }).rejects.toThrow(TypeError);
  });

  it('deve percorrer arquivos elegiveis em um diretorio plano', async () => {
    const dirHandle = createMockDirectoryHandle('root', [
      createMockFileHandle('index.js', 'console.log("ok");'),
      createMockFileHandle('app.jsx', 'export default function App() {}'),
      createMockFileHandle('package.json', '{"name": "teste"}'),
      createMockFileHandle('style.css', 'body { color: red; }'),
    ]);

    const collected = [];
    for await (const entry of traverseDirectory(dirHandle)) {
      collected.push(entry);
    }

    expect(collected).toHaveLength(2);
    expect(collected.map((f) => f.relativePath)).toEqual(['index.js', 'app.jsx']);
    expect(collected[0].name).toBe('index.js');
    expect(await collected[0].text()).toBe('console.log("ok");');
  });

  it('deve percorrer recursivamente subdiretorios acumulando caminhos relativos normalizados', async () => {
    const tree = {
      src: {
        controllers: {
          'userController.js': 'export const getUsers = () => {};',
        },
        routes: {
          'api.routes.mjs': 'export default router;',
        },
        'server.cjs': 'const express = require("express");',
      },
      'README.md': '# Docs',
    };

    const rootDir = createTreeMock('meu-projeto', tree);

    const collected = [];
    for await (const entry of traverseDirectory(rootDir)) {
      collected.push(entry);
    }

    expect(collected).toHaveLength(3);
    const paths = collected.map((f) => f.relativePath);
    expect(paths).toContain('src/controllers/userController.js');
    expect(paths).toContain('src/routes/api.routes.mjs');
    expect(paths).toContain('src/server.cjs');

    const serverEntry = collected.find((f) => f.relativePath === 'src/server.cjs');
    expect(serverEntry).toBeDefined();
    expect(await serverEntry.text()).toBe('const express = require("express");');
    const fileObj = await serverEntry.getFile();
    expect(fileObj.size).toBeGreaterThan(0);
  });

  it('deve podar antecipadamente diretorios ignorados sem inspecionar seus filhos', async () => {
    const spies = new Map();
    const tree = {
      src: {
        'index.js': 'console.log("app");',
      },
      node_modules: {
        express: {
          'index.js': 'module.exports = {};',
        },
        react: {
          'index.js': 'module.exports = {};',
        },
      },
      dist: {
        'bundle.js': 'var a=1;',
      },
      '.git': {
        objects: {
          'test.js': 'git blob',
        },
      },
    };

    const rootDir = createTreeMock('projeto-com-deps', tree, spies);

    const collected = [];
    for await (const entry of traverseDirectory(rootDir)) {
      collected.push(entry);
    }

    // Apenas src/index.js deve ser retornado
    expect(collected).toHaveLength(1);
    expect(collected[0].relativePath).toBe('src/index.js');

    // Confirma que values() de node_modules, dist e .git NUNCA foram chamados
    const nodeModulesSpy = spies.get('node_modules');
    const distSpy = spies.get('dist');
    const gitSpy = spies.get('.git');

    expect(nodeModulesSpy).not.toHaveBeenCalled();
    expect(distSpy).not.toHaveBeenCalled();
    expect(gitSpy).not.toHaveBeenCalled();
  });

  it('deve descartar arquivos minificados, segredos e lockfiles durante a varredura', async () => {
    const tree = {
      src: {
        'main.js': 'import "./vendor.bundle.js";',
        'vendor.bundle.js': 'function min(){}',
        'app.min.js': 'var x=1;',
        '.env': 'DATABASE_URL=postgres://...',
        '.env.local': 'SECRET=123',
        '.env.example': 'DATABASE_URL=example',
      },
      'package-lock.json': '{}',
      'yarn.lock': '',
    };

    const rootDir = createTreeMock('app', tree);

    const collected = [];
    for await (const entry of traverseDirectory(rootDir)) {
      collected.push(entry);
    }

    const paths = collected.map((f) => f.relativePath);
    expect(paths).toEqual(['src/main.js']);
  });

  it('deve ignorar entradas invalidas ou sem nome sem lancar erro', async () => {
    const dirHandle = {
      kind: 'directory',
      name: 'corrupted',
      values: async function* () {
        yield null;
        yield undefined;
        yield {};
        yield { kind: 'unknown', name: 'desconhecido.bin' };
        yield createMockFileHandle('valid.js', 'const a = 1;');
      },
    };

    const collected = [];
    for await (const entry of traverseDirectory(dirHandle)) {
      collected.push(entry);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0].relativePath).toBe('valid.js');
  });
});

describe('directory-reader: readLocalDirectory', () => {
  it('deve orquestrar leitura completa a partir de um handle fornecido', async () => {
    const tree = {
      src: {
        'index.js': 'console.log(1);',
        'routes.js': 'console.log(2);',
      },
    };
    const rootDir = createTreeMock('app', tree);
    const onFileSpy = vi.fn();

    const result = await readLocalDirectory(rootDir, {
      onFileFound: onFileSpy,
    });

    expect(result).toHaveLength(2);
    expect(onFileSpy).toHaveBeenCalledTimes(2);
    expect(result.map((f) => f.relativePath)).toEqual(['src/index.js', 'src/routes.js']);
  });

  it('deve respeitar maxFiles quando especificado nas opcoes', async () => {
    const tree = {
      src: {
        'a.js': '1',
        'b.js': '2',
        'c.js': '3',
      },
    };
    const rootDir = createTreeMock('app', tree);

    const result = await readLocalDirectory(rootDir, {
      maxFiles: 2,
    });

    expect(result).toHaveLength(2);
  });

  it('deve chamar pickDirectory automaticamente se nenhum handle for fornecido', async () => {
    const tree = {
      'index.js': 'console.log(1);',
    };
    const rootDir = createTreeMock('projeto-escolhido', tree);
    const mockWindow = {
      showDirectoryPicker: vi.fn().mockResolvedValue(rootDir),
    };

    const result = await readLocalDirectory({
      targetWindow: mockWindow,
      pickerOptions: { id: 'test-picker' },
    });

    expect(mockWindow.showDirectoryPicker).toHaveBeenCalledWith({ id: 'test-picker' });
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('index.js');
  });

  it('deve retornar null se o usuario cancelar a selecao de diretorio', async () => {
    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';

    const mockWindow = {
      showDirectoryPicker: vi.fn().mockRejectedValue(abortError),
    };

    const result = await readLocalDirectory({
      targetWindow: mockWindow,
    });

    expect(result).toBeNull();
  });
});
