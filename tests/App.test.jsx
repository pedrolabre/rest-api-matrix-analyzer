import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renderiza o cabecalho e o identificador do produto', () => {
    render(<App />);
    expect(screen.getByText('rest-api-matrix-analyzer')).toBeInTheDocument();
    expect(screen.getByText(/Processamento 100% Client-Side/i)).toBeInTheDocument();
    expect(screen.getByText(/Ambiente Inicializado com Sucesso/i)).toBeInTheDocument();
  });
});
