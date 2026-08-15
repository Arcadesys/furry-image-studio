import {
  AlertTriangle,
  ArrowRight,
  Check,
  MapPinPlus,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  Annotation,
  RubricCriterion,
  Severity,
} from '../../shared/types';

interface GradeInspectorProps {
  rubric: RubricCriterion[];
  scores: Record<string, number>;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  annotationMode: boolean;
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  savedLabel: string;
  validationMessage: string | null;
  onScoreChange: (criterionId: string, score: number) => void;
  onSelectAnnotation: (annotationId: string) => void;
  onUpdateAnnotation: (patch: Partial<Pick<Annotation, 'category' | 'severity' | 'note'>>) => void;
  onDeleteAnnotation: () => void;
  onStartAnnotation: () => void;
  onSaveDraft: () => void;
  onSaveAndNext: () => void;
}

export function GradeInspector({
  rubric,
  scores,
  annotations,
  selectedAnnotationId,
  annotationMode,
  saveState,
  savedLabel,
  validationMessage,
  onScoreChange,
  onSelectAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onStartAnnotation,
  onSaveDraft,
  onSaveAndNext,
}: GradeInspectorProps) {
  const selectedAnnotation = annotations.find((item) => item.id === selectedAnnotationId) ?? null;

  return (
    <aside className="grade-inspector" aria-label="Trace grading inspector">
      <h2>Grade this trace</h2>

      <div className="rubric-list">
        {rubric.map((criterion) => {
          const score = scores[criterion.id] ?? 0;
          const passes = score >= criterion.passThreshold;
          const state = score === 0 ? 'Not scored' : passes ? 'Pass' : 'Issue';
          return (
            <fieldset className="criterion" key={criterion.id}>
              <legend>{criterion.label}</legend>
              <div className="criterion-row">
                <div className="score-segments" aria-label={`${criterion.label} score`}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      className={`score-button ${score === value ? passes ? 'score-button--pass' : 'score-button--issue' : ''}`}
                      type="button"
                      role="radio"
                      aria-checked={score === value}
                      key={value}
                      onClick={() => onScoreChange(criterion.id, value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <span className={`criterion-state criterion-state--${score === 0 ? 'empty' : passes ? 'pass' : 'issue'}`}>
                  {score > 0 && (passes ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />)}
                  {state}
                </span>
              </div>
            </fieldset>
          );
        })}
      </div>

      <section className="annotation-editor" aria-labelledby="annotation-heading">
        <div className="annotation-heading-row">
          <h3 id="annotation-heading">
            {selectedAnnotation
              ? `Pin ${annotations.findIndex((item) => item.id === selectedAnnotation.id) + 1}: ${selectedAnnotation.assetRole === 'source' ? 'Source' : 'Output'}`
              : 'Annotations'}
          </h3>
          {annotations.length > 1 && (
            <select
              className="pin-selector"
              aria-label="Select annotation pin"
              value={selectedAnnotationId ?? ''}
              onChange={(event) => onSelectAnnotation(event.target.value)}
            >
              <option value="">Select pin</option>
              {annotations.map((item, index) => (
                <option value={item.id} key={item.id}>Pin {index + 1}</option>
              ))}
            </select>
          )}
        </div>

        {selectedAnnotation ? (
          <>
            <label>
              Category
              <select
                value={selectedAnnotation.category}
                onChange={(event) => onUpdateAnnotation({ category: event.target.value })}
              >
                {rubric.map((criterion) => (
                  <option value={criterion.id} key={criterion.id}>{criterion.label}</option>
                ))}
              </select>
            </label>

            <label>
              Severity
              <select
                value={selectedAnnotation.severity}
                onChange={(event) => onUpdateAnnotation({ severity: event.target.value as Severity })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label>
              Note <span aria-hidden="true">*</span>
              <textarea
                value={selectedAnnotation.note}
                onChange={(event) => onUpdateAnnotation({ note: event.target.value })}
                placeholder="Describe the visible evidence."
                required
              />
            </label>

            <div className="annotation-actions">
              <button className="secondary-button danger-button" type="button" onClick={onDeleteAnnotation}>
                <Trash2 aria-hidden="true" />
                Delete pin
              </button>
              <button className="secondary-button" type="button" onClick={onStartAnnotation}>
                <MapPinPlus aria-hidden="true" />
                Add annotation
              </button>
            </div>
          </>
        ) : (
          <div className="annotation-empty">
            <p>Add a numbered pin to record evidence on the source or output.</p>
            <button className="secondary-button" type="button" onClick={onStartAnnotation}>
              <MapPinPlus aria-hidden="true" />
              Add annotation
            </button>
          </div>
        )}

        {annotationMode && (
          <p className="annotation-instruction" role="status">
            Select a point on either image, or focus an image and press Enter.
          </p>
        )}
      </section>

      {validationMessage && <p className="validation-message" role="alert">{validationMessage}</p>}

      <div className="save-actions">
        <button className="primary-button" type="button" onClick={onSaveAndNext}>
          Save grade and next
          <ArrowRight aria-hidden="true" />
        </button>
        <button className="secondary-button" type="button" onClick={onSaveDraft}>
          <Save aria-hidden="true" />
          Save draft
        </button>
        <p className={`save-status save-status--${saveState}`} aria-live="polite">
          {saveState === 'saving' ? 'Saving...' : saveState === 'dirty' ? 'Unsaved changes' : saveState === 'error' ? 'Save failed' : savedLabel}
        </p>
      </div>
    </aside>
  );
}
