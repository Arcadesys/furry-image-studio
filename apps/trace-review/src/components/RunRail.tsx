import { CalendarDays, ChevronRight, Search, Settings, X } from 'lucide-react';
import type { RunSummary } from '../../shared/types';

interface RunRailProps {
  runs: RunSummary[];
  selectedRunId: string | null;
  query: string;
  open: boolean;
  onQueryChange: (query: string) => void;
  onSelectRun: (runId: string) => void;
  onManageRuns: () => void;
  onClose: () => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function RunRail({
  runs,
  selectedRunId,
  query,
  open,
  onQueryChange,
  onSelectRun,
  onManageRuns,
  onClose,
}: RunRailProps) {
  const filteredRuns = runs.filter((run) =>
    run.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <>
      {open && (
        <button
          className="drawer-backdrop"
          aria-label="Close review set drawer"
          onClick={onClose}
        />
      )}
      <aside className={`run-rail ${open ? 'run-rail--open' : ''}`} aria-label="Review sets">
        <div className="rail-heading">
          <h2>Review sets</h2>
          <button className="icon-button rail-close" type="button" onClick={onClose} aria-label="Close review set drawer">
            <X aria-hidden="true" />
          </button>
        </div>

        <label className="search-field">
          <Search aria-hidden="true" />
          <span className="sr-only">Search review sets</span>
          <input
            type="search"
            placeholder="Search review sets"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <nav className="run-list" aria-label="Available review sets">
          {filteredRuns.map((run) => {
            const selected = run.id === selectedRunId;
            return (
              <button
                className={`run-row ${selected ? 'run-row--selected' : ''}`}
                type="button"
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                aria-current={selected ? 'page' : undefined}
              >
                <span className="run-row__title">{run.title}</span>
                <span className="run-row__meta">
                  <span><CalendarDays aria-hidden="true" /> {formatDate(run.updatedAt)}</span>
                  <span>{run.gradedCount} of {run.traceCount} graded</span>
                </span>
                {selected && <ChevronRight className="run-row__chevron" aria-hidden="true" />}
              </button>
            );
          })}
          {filteredRuns.length === 0 && (
            <p className="empty-message">No review sets match that search.</p>
          )}
        </nav>

        <button className="secondary-button manage-button" type="button" onClick={onManageRuns}>
          <Settings aria-hidden="true" />
          Manage review sets
        </button>
      </aside>
    </>
  );
}
