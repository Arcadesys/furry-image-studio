import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  FolderSearch,
  Menu,
  MousePointer2,
  Palette,
  Target,
  UserRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Annotation,
  BootstrapResponse,
  RunDetail,
  Trace,
} from '../shared/types';
import { api } from './api/client';
import { GradeInspector } from './components/GradeInspector';
import { ManageRunsModal } from './components/ManageRunsModal';
import { ReviewCanvas } from './components/ReviewCanvas';
import { RunRail } from './components/RunRail';

const EMPTY_BOOTSTRAP: BootstrapResponse = {
  runs: [],
  characters: [],
  styles: [],
};

function profileLabel(id: string | null, options: BootstrapResponse['characters']) {
  if (!id) return 'Not recorded';
  return options.find((option) => option.id === id)?.displayName ?? id;
}

function savedTime(date: Date | null) {
  if (!date) return 'Saved';
  return `Saved ${new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)}`;
}

interface AppProps {
  logoUrl?: string;
}

export function App({ logoUrl: providedLogoUrl }: AppProps = {}) {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse>(EMPTY_BOOTSTRAP);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeTraceIndex, setActiveTraceIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [query, setQuery] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const trace = run?.traces[activeTraceIndex] ?? null;

  useEffect(() => {
    let active = true;
    void api.bootstrap()
      .then((response) => {
        if (!active) return;
        setBootstrap(response);
        setSelectedRunId((current) => {
          const next = current ?? response.runs[0]?.id ?? null;
          if (!next) {
            setLoading(false);
          }
          return next;
        });
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'The review workspace could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setRun(null);
      return;
    }

    let active = true;
    setLoading(true);
    void api.getRun(selectedRunId)
      .then((response) => {
        if (!active) return;
        setRun(response);
        setActiveTraceIndex(0);
        setError(null);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'The review set could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedRunId]);

  useEffect(() => {
    if (!trace) {
      setScores({});
      setAnnotations([]);
      setSelectedAnnotationId(null);
      return;
    }
    setScores(trace.review.scores);
    setAnnotations(trace.review.annotations);
    setSelectedAnnotationId(trace.review.annotations[0]?.id ?? null);
    setAnnotationMode(false);
    setValidationMessage(null);
    setSaveState('saved');
    setSavedAt(new Date(trace.review.updatedAt));
  }, [trace?.id]);

  const updateRunTrace = useCallback((traceId: string, nextTrace: Trace) => {
    setRun((current) => current
      ? {
          ...current,
          traces: current.traces.map((item) => item.id === traceId ? nextTrace : item),
          gradedCount: current.traces.filter((item) =>
            item.id === traceId ? nextTrace.status === 'graded' : item.status === 'graded',
          ).length,
          updatedAt: new Date().toISOString(),
        }
      : current);
  }, []);

  const persist = useCallback(async (completed: boolean, quiet = false) => {
    if (!trace || !run) return false;
    setValidationMessage(null);

    if (completed) {
      const missingScore = run.rubric.some((criterion) => !scores[criterion.id]);
      const missingNote = annotations.some((annotation) => !annotation.note.trim());
      if (missingScore || missingNote) {
        setValidationMessage(
          missingScore
            ? 'Score every grading criterion before completing this trace.'
            : 'Every annotation needs a note before completing this trace.',
        );
        return false;
      }
    }

    setSaveState('saving');
    try {
      const savedReview = await api.saveReview(trace.id, { scores, completed });
      const savedAnnotations: Annotation[] = [];

      for (const annotation of annotations) {
        if (!annotation.note.trim()) {
          savedAnnotations.push(annotation);
          continue;
        }
        const input = {
          assetRole: annotation.assetRole,
          x: annotation.x,
          y: annotation.y,
          category: annotation.category,
          severity: annotation.severity,
          note: annotation.note.trim(),
        };
        const saved = annotation.id.startsWith('local-')
          ? await api.addAnnotation(trace.id, input)
          : await api.updateAnnotation(annotation.id, input);
        savedAnnotations.push(saved);
      }

      setAnnotations(savedAnnotations);
      setSelectedAnnotationId((current) => {
        const currentIndex = annotations.findIndex((item) => item.id === current);
        return currentIndex >= 0 ? savedAnnotations[currentIndex]?.id ?? null : savedAnnotations[0]?.id ?? null;
      });

      const nextTrace: Trace = {
        ...trace,
        status: completed
          ? 'graded'
          : Object.keys(scores).length > 0 || savedAnnotations.length > 0
            ? 'draft'
            : 'ungraded',
        review: {
          ...savedReview,
          scores,
          completed,
          annotations: savedAnnotations,
        },
      };
      updateRunTrace(trace.id, nextTrace);
      setSaveState('saved');
      setSavedAt(new Date());

      if (completed) {
        let nextUngraded = run.traces.findIndex((item, index) =>
          index > activeTraceIndex && item.id !== trace.id && item.status !== 'graded',
        );
        if (nextUngraded < 0) {
          nextUngraded = run.traces.findIndex((item, index) =>
            index < activeTraceIndex && item.id !== trace.id && item.status !== 'graded',
          );
        }
        const nextIndex = nextUngraded >= 0
          ? nextUngraded
          : Math.min(activeTraceIndex + 1, run.traces.length - 1);
        setActiveTraceIndex(nextIndex);
      }
      return true;
    } catch (caught) {
      setSaveState('error');
      if (!quiet) {
        setValidationMessage(caught instanceof Error ? caught.message : 'The review could not be saved.');
      }
      return false;
    }
  }, [activeTraceIndex, annotations, run, scores, trace, updateRunTrace]);

  useEffect(() => {
    if (saveState !== 'dirty' || !trace) return;
    const timer = window.setTimeout(() => {
      void persist(false, true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [annotations, persist, saveState, scores, trace]);

  const markDirty = () => {
    setSaveState('dirty');
    setValidationMessage(null);
  };

  const selectTrace = async (index: number) => {
    if (index === activeTraceIndex) return;
    if (saveState === 'dirty') {
      await persist(false, true);
    }
    setActiveTraceIndex(index);
  };

  const placeAnnotation = (assetRole: 'source' | 'output', x: number, y: number) => {
    if (!trace || !run) return;
    const now = new Date().toISOString();
    const annotation: Annotation = {
      id: `local-${crypto.randomUUID()}`,
      traceId: trace.id,
      assetRole,
      x,
      y,
      category: run.rubric[0]?.id ?? 'general',
      severity: 'medium',
      note: '',
      createdAt: now,
      updatedAt: now,
    };
    setAnnotations((current) => [...current, annotation]);
    setSelectedAnnotationId(annotation.id);
    setAnnotationMode(false);
    markDirty();
  };

  const updateSelectedAnnotation = (patch: Partial<Pick<Annotation, 'category' | 'severity' | 'note'>>) => {
    if (!selectedAnnotationId) return;
    setAnnotations((current) => current.map((annotation) =>
      annotation.id === selectedAnnotationId
        ? { ...annotation, ...patch, updatedAt: new Date().toISOString() }
        : annotation,
    ));
    markDirty();
  };

  const deleteSelectedAnnotation = async () => {
    if (!selectedAnnotationId) return;
    const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
    if (selected && !selected.id.startsWith('local-')) {
      try {
        await api.deleteAnnotation(selected.id);
      } catch (caught) {
        setValidationMessage(caught instanceof Error ? caught.message : 'The annotation could not be deleted.');
        return;
      }
    }
    const next = annotations.filter((annotation) => annotation.id !== selectedAnnotationId);
    setAnnotations(next);
    setSelectedAnnotationId(next[0]?.id ?? null);
    markDirty();
  };

  const selectRun = (runId: string) => {
    setSelectedRunId(runId);
    setRailOpen(false);
  };

  const character = profileLabel(run?.characterId ?? null, bootstrap.characters);
  const style = profileLabel(run?.styleId ?? null, bootstrap.styles);
  const heading = run?.title ?? 'Trace Review';
  const promptText = run?.promptStatus === 'missing'
    ? 'Prompt was not recorded by the source pipeline.'
    : run?.prompt ?? '';

  const progress = useMemo(() => {
    if (!run || run.traces.length === 0) return 'No traces';
    return `Trace ${activeTraceIndex + 1} of ${run.traces.length}`;
  }, [activeTraceIndex, run]);

  return (
    <div className="app">
      <header className="top-bar">
        <button className="icon-button mobile-menu" type="button" onClick={() => setRailOpen(true)} aria-label="Open review set drawer">
          <Menu aria-hidden="true" />
        </button>
        <div className="brand">
          {providedLogoUrl ? <img src={providedLogoUrl} alt="" /> : <span aria-hidden="true">FIS</span>}
          <strong>Furry Image Studio</strong>
          <span>Trace Review</span>
        </div>
        <div className="eval-source">
          <FolderSearch aria-hidden="true" />
          <span>evals/outputs</span>
        </div>
      </header>

      <div className="workspace">
        <RunRail
          runs={bootstrap.runs}
          selectedRunId={selectedRunId}
          query={query}
          open={railOpen}
          onQueryChange={setQuery}
          onSelectRun={selectRun}
          onManageRuns={() => setManageOpen(true)}
          onClose={() => setRailOpen(false)}
        />

        <main className="main-workspace">
          {error && (
            <div className="error-banner" role="alert">
              <strong>Workspace unavailable.</strong>
              <span>{error}</span>
            </div>
          )}

          {loading && !run ? (
            <section className="loading-workspace" role="status">
              <span className="loading-indicator" aria-hidden="true" />
              <h1>Loading review sets</h1>
            </section>
          ) : !run ? (
            <section className="empty-workspace">
              <FolderSearch aria-hidden="true" />
              <h1>No eval outputs found</h1>
              <p>Run the image pipeline so it writes trace manifests and images under <code>evals/outputs/</code>, then restart Trace Review.</p>
            </section>
          ) : (
            <>
              <section className="run-header">
                <div>
                  <h1>{heading}</h1>
                  <p className="trace-progress">{progress}</p>
                </div>
                <div className="trace-navigation" aria-label="Trace navigation">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={activeTraceIndex === 0}
                    onClick={() => void selectTrace(activeTraceIndex - 1)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Previous
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!run || activeTraceIndex >= run.traces.length - 1}
                    onClick={() => void selectTrace(activeTraceIndex + 1)}
                  >
                    Next
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </section>

              <section className="evidence-card" aria-label="Prompt and profile evidence">
                <p className={run?.promptStatus === 'missing' ? 'missing-evidence' : ''}>{promptText}</p>
                <dl>
                  <div><UserRound aria-hidden="true" /><dt>Character</dt><dd>{character}</dd></div>
                  <div><Palette aria-hidden="true" /><dt>Style</dt><dd>{style}</dd></div>
                  <div><Target aria-hidden="true" /><dt>Target</dt><dd>{trace?.target ?? run?.target ?? 'Not recorded'}</dd></div>
                  <div><MousePointer2 aria-hidden="true" /><dt>Producer</dt><dd>{run?.producedBy ?? 'Not recorded'}</dd></div>
                </dl>
              </section>

              {run.importWarnings.length > 0 && (
                <section className="pipeline-warning" aria-label="Pipeline warnings">
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>Pipeline warning</strong>
                    <ul>
                      {run.importWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                </section>
              )}

              {run && (
                <ReviewCanvas
                  traces={run.traces}
                  activeIndex={activeTraceIndex}
                  annotations={annotations}
                  selectedAnnotationId={selectedAnnotationId}
                  annotationMode={annotationMode}
                  onSelectTrace={(index) => void selectTrace(index)}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onPlaceAnnotation={placeAnnotation}
                />
              )}
            </>
          )}
        </main>

        {run && trace && (
          <GradeInspector
            rubric={run.rubric}
            scores={scores}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            annotationMode={annotationMode}
            saveState={saveState}
            savedLabel={savedTime(savedAt)}
            validationMessage={validationMessage}
            onScoreChange={(criterionId, score) => {
              setScores((current) => ({ ...current, [criterionId]: score }));
              markDirty();
            }}
            onSelectAnnotation={setSelectedAnnotationId}
            onUpdateAnnotation={updateSelectedAnnotation}
            onDeleteAnnotation={() => void deleteSelectedAnnotation()}
            onStartAnnotation={() => setAnnotationMode(true)}
            onSaveDraft={() => void persist(false)}
            onSaveAndNext={() => void persist(true)}
          />
        )}
      </div>

      {manageOpen && (
        <ManageRunsModal runs={bootstrap.runs} onClose={() => setManageOpen(false)} />
      )}
    </div>
  );
}
