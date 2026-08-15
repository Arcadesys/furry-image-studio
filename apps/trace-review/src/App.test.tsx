import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { bootstrapFixture, runFixture } from './test/fixtures';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('Trace Review', () => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    if (path === '/api/bootstrap') return jsonResponse(bootstrapFixture);
    if (path === `/api/runs/${runFixture.id}`) return jsonResponse(runFixture);
    if (path.includes('/review') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { scores: Record<string, number>; completed: boolean };
      return jsonResponse({
        traceId: runFixture.traces[0].id,
        scores: body.scores,
        completed: body.completed,
        updatedAt: new Date().toISOString(),
        annotations: [],
      });
    }
    if (path.includes('/annotations') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        ...body,
        id: '10000000-0000-4000-8000-000000000001',
        traceId: runFixture.traces[0].id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, 201);
    }
    if (path.startsWith('/api/annotations/') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      return jsonResponse({
        ...body,
        id: path.split('/').at(-1),
        traceId: runFixture.traces[0].id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return jsonResponse({ error: 'Not found in test' }, 404);
  });

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('grades a criterion and saves a draft', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Grey mouse / sodium bar' })).toBeInTheDocument();
    const targetScores = screen.getByLabelText('Target selection score');
    await user.click(within(targetScores).getByRole('radio', { name: '5' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/review'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  it('places a source annotation from the keyboard and requires visible evidence', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Grey mouse / sodium bar' });
    await user.click(screen.getByRole('button', { name: 'Add annotation' }));
    const source = screen.getByLabelText('Source image. Annotation pins can be placed here.');
    source.focus();
    fireEvent.keyDown(source, { key: 'Enter' });

    expect(screen.getByRole('heading', { name: 'Pin 1: Source' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Describe the visible evidence.'), 'The left paw reads too human.');
    expect(screen.getByRole('button', { name: /Annotation pin 1/ })).toBeInTheDocument();
  });

  it('identifies the pipeline output source without offering upload controls', async () => {
    render(<App />);

    await screen.findByRole('heading', { name: 'Grey mouse / sodium bar' });
    expect(screen.getByText('evals/outputs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import set' })).not.toBeInTheDocument();
    expect(screen.queryByText(/upload/i)).not.toBeInTheDocument();
  });

  it('shows a pipeline-oriented empty state when no outputs exist', async () => {
    const savedRuns = bootstrapFixture.runs;
    bootstrapFixture.runs = [];
    try {
      render(<App />);
      expect(await screen.findByRole('heading', { name: 'No eval outputs found' })).toBeInTheDocument();
      expect(screen.getByText(/writes trace manifests and images under/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add|import|upload/i })).not.toBeInTheDocument();
    } finally {
      bootstrapFixture.runs = savedRuns;
    }
  });

  it('surfaces orphan files reported by the importer', async () => {
    const warning = 'Orphan output image: unexpected-mouse.png';
    runFixture.importWarnings = [warning];
    bootstrapFixture.runs[0].importWarnings = [warning];

    try {
      render(<App />);
      await screen.findByRole('heading', { name: 'Grey mouse / sodium bar' });
      expect(screen.getByRole('region', { name: 'Pipeline warnings' })).toHaveTextContent(warning);
    } finally {
      runFixture.importWarnings = [];
      bootstrapFixture.runs[0].importWarnings = [];
    }
  });
});
