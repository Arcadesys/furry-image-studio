import { Download, FolderCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { RunSummary } from '../../shared/types';
import { api } from '../api/client';

interface ManageRunsModalProps {
  runs: RunSummary[];
  onClose: () => void;
}

export function ManageRunsModal({ runs, onClose }: ManageRunsModalProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<{ runId: string; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportRun = async (runId: string) => {
    setBusyId(runId);
    setResult(null);
    setError(null);
    try {
      const response = await api.exportRun(runId);
      setResult({ runId, path: response.exportPath });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-title">
        <header className="modal-header">
          <div>
            <h2 id="manage-title">Manage review sets</h2>
            <p>Export an immutable regression bundle with checksums.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close manage review sets dialog">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="manage-list">
          {runs.map((run) => (
            <div className="manage-row" key={run.id}>
              <div>
                <strong>{run.title}</strong>
                <span>{run.gradedCount} of {run.traceCount} graded</span>
                {result?.runId === run.id && (
                  <span className="export-result" role="status">
                    <FolderCheck aria-hidden="true" />
                    {result.path}
                  </span>
                )}
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={busyId === run.id}
                onClick={() => void exportRun(run.id)}
              >
                <Download aria-hidden="true" />
                {busyId === run.id ? 'Exporting...' : 'Export bundle'}
              </button>
            </div>
          ))}
        </div>
        {error && <p className="validation-message" role="alert">{error}</p>}
      </section>
    </div>
  );
}
