import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectImportCard from '../../src/components/project-import/ProjectImportCard.jsx';
import * as directoryReader from '../../src/parsers/directory-reader.js';
import * as zipExtractor from '../../src/parsers/zip-extractor.js';

describe('ProjectImportCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza o titulo, orientacoes e botoes de acao no estado inicial', () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(true);

    render(<ProjectImportCard onFilesSelected={vi.fn()} />);

    expect(screen.getByText('Importar Projeto para Auditoria')).toBeInTheDocument();
    expect(screen.getByText('Selecionar Pasta do Projeto')).toBeInTheDocument();
    expect(screen.getByText('Escolher Arquivo .ZIP')).toBeInTheDocument();
    expect(screen.getByText(/Arraste e solte o arquivo/i)).toBeInTheDocument();
  });

  it('exibe aviso de incompatibilidade quando a File System Access API nao for suportada', () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(false);

    render(<ProjectImportCard onFilesSelected={vi.fn()} />);

    expect(
      screen.getByText(/Selecao de pasta nativa nao suportada neste navegador/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Selecionar Pasta do Projeto')).not.toBeInTheDocument();
  });

  it('aciona o seletor nativo e chama onFilesSelected ao selecionar diretorio com sucesso', async () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(true);
    vi.spyOn(directoryReader, 'pickDirectory').mockResolvedValue({ name: 'meu-projeto' });
    vi.spyOn(directoryReader, 'readLocalDirectory').mockResolvedValue([
      { relativePath: 'src/index.js' },
      { relativePath: 'src/server.js' },
    ]);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    const selectButton = screen.getByText('Selecionar Pasta do Projeto');
    fireEvent.click(selectButton);

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledWith(
        [
          { relativePath: 'src/index.js' },
          { relativePath: 'src/server.js' },
        ],
        'meu-projeto'
      );
    });
  });

  it('nao emite erro nem chama onFilesSelected quando o usuario cancela o seletor nativo', async () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(true);
    vi.spyOn(directoryReader, 'pickDirectory').mockResolvedValue(null);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    fireEvent.click(screen.getByText('Selecionar Pasta do Projeto'));

    await waitFor(() => {
      expect(onFilesSelected).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('exibe alerta quando nenhum arquivo processavel for encontrado no diretorio', async () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(true);
    vi.spyOn(directoryReader, 'pickDirectory').mockResolvedValue({ name: 'pasta-vazia' });
    vi.spyOn(directoryReader, 'readLocalDirectory').mockResolvedValue([]);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    fireEvent.click(screen.getByText('Selecionar Pasta do Projeto'));

    await waitFor(() => {
      expect(
        screen.getByText(/Nenhum arquivo JavaScript\/Node.js/i)
      ).toBeInTheDocument();
      expect(onFilesSelected).not.toHaveBeenCalled();
    });
  });

  it('captura e exibe erro quando a leitura do diretorio falhar', async () => {
    vi.spyOn(directoryReader, 'isFileSystemAccessSupported').mockReturnValue(true);
    vi.spyOn(directoryReader, 'pickDirectory').mockRejectedValue(new Error('Acesso negado pelo sistema'));

    render(<ProjectImportCard onFilesSelected={vi.fn()} />);

    fireEvent.click(screen.getByText('Selecionar Pasta do Projeto'));

    await waitFor(() => {
      expect(screen.getByText('Acesso negado pelo sistema')).toBeInTheDocument();
    });
  });

  it('processa pacote ZIP solto via drag-and-drop e aciona onFilesSelected', async () => {
    const mockFile = new File(['fake-zip'], 'app.zip', { type: 'application/zip' });
    vi.spyOn(zipExtractor, 'isZipFile').mockReturnValue(true);
    vi.spyOn(zipExtractor, 'extractProjectFromZip').mockResolvedValue([
      { relativePath: 'src/app.js' },
    ]);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    const dropzone = screen.getByText(/Arraste e solte o arquivo/i).closest('div');

    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledWith(
        [{ relativePath: 'src/app.js' }],
        'app'
      );
    });
  });

  it('exibe erro ao soltar arquivo que nao seja um pacote ZIP', async () => {
    const mockTxtFile = new File(['texto'], 'documento.txt', { type: 'text/plain' });
    vi.spyOn(zipExtractor, 'isZipFile').mockReturnValue(false);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    const dropzone = screen.getByText(/Arraste e solte o arquivo/i).closest('div');

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [mockTxtFile],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/O arquivo selecionado deve ser um pacote .zip valido/i)
      ).toBeInTheDocument();
      expect(onFilesSelected).not.toHaveBeenCalled();
    });
  });

  it('processa arquivo ZIP selecionado atraves do input de arquivo oculto', async () => {
    const mockZipFile = new File(['conteudo'], 'projeto-backend.zip', {
      type: 'application/zip',
    });
    vi.spyOn(zipExtractor, 'isZipFile').mockReturnValue(true);
    vi.spyOn(zipExtractor, 'extractProjectFromZip').mockResolvedValue([
      { relativePath: 'server.js' },
    ]);

    const onFilesSelected = vi.fn();
    render(<ProjectImportCard onFilesSelected={onFilesSelected} />);

    const input = screen.getByTestId('zip-file-input');
    fireEvent.change(input, {
      target: { files: [mockZipFile] },
    });

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalledWith(
        [{ relativePath: 'server.js' }],
        'projeto-backend'
      );
    });
  });

  it('renderiza barra de progresso e botao de cancelar quando isAnalyzing for verdadeiro', () => {
    const onCancel = vi.fn();
    render(
      <ProjectImportCard
        isAnalyzing={true}
        progress={{
          percent: 65,
          currentFile: 'src/controllers/userController.js',
          processedFiles: 13,
          totalFiles: 20,
        }}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Analisando codigo-fonte em background...')).toBeInTheDocument();
    expect(screen.getByText('Arquivo: src/controllers/userController.js')).toBeInTheDocument();
    expect(screen.getByText('13 de 20 (65%)')).toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '65');
    expect(progressBar).toHaveStyle({ width: '65%' });

    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalled();
  });

  it('renderiza banner de erro externo recebido via prop error', () => {
    render(
      <ProjectImportCard
        error={new Error('Falha no Web Worker de parsing')}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Falha no Web Worker de parsing')).toBeInTheDocument();
  });

  it('permite fechar alerta de erro local clicando no botao de fechamento', async () => {
    render(<ProjectImportCard error="Mensagem de alerta" />);

    expect(screen.getByText('Mensagem de alerta')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: 'Fechar alerta de erro' });
    fireEvent.click(closeBtn);
  });
});
