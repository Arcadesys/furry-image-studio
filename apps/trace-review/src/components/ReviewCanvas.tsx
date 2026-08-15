import {
  Expand,
  Hand,
  Minus,
  Plus,
  Scan,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Annotation, Trace } from '../../shared/types';

interface ReviewCanvasProps {
  traces: Trace[];
  activeIndex: number;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  annotationMode: boolean;
  onSelectTrace: (index: number) => void;
  onSelectAnnotation: (id: string) => void;
  onPlaceAnnotation: (role: 'source' | 'output', x: number, y: number) => void;
}

interface PanPoint {
  x: number;
  y: number;
}

function fitImage(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  const imageAspect = imageWidth / imageHeight;
  const stageAspect = stageWidth / stageHeight;
  if (imageAspect > stageAspect) {
    const height = stageWidth / imageAspect;
    return { left: 0, top: (stageHeight - height) / 2, width: stageWidth, height };
  }
  const width = stageHeight * imageAspect;
  return { left: (stageWidth - width) / 2, top: 0, width, height: stageHeight };
}

export function ReviewCanvas({
  traces,
  activeIndex,
  annotations,
  selectedAnnotationId,
  annotationMode,
  onSelectTrace,
  onSelectAnnotation,
  onPlaceAnnotation,
}: ReviewCanvasProps) {
  const trace = traces[activeIndex];
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; pan: PanPoint } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const [panEnabled, setPanEnabled] = useState(false);
  const [mobileRole, setMobileRole] = useState<'source' | 'output'>('output');

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [trace?.id]);

  if (!trace) {
    return <div className="canvas-empty">Select a review set to begin.</div>;
  }

  const fit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const changeZoom = (next: number) => {
    setZoom(Math.min(3, Math.max(0.5, Number(next.toFixed(2)))));
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    role: 'source' | 'output',
    imageWidth: number,
    imageHeight: number,
  ) => {
    if (annotationMode) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const fitted = fitImage(bounds.width, bounds.height, imageWidth, imageHeight);
      const baseX = (event.clientX - bounds.left - pan.x - bounds.width / 2) / zoom + bounds.width / 2;
      const baseY = (event.clientY - bounds.top - pan.y - bounds.height / 2) / zoom + bounds.height / 2;
      onPlaceAnnotation(
        role,
        Math.min(1, Math.max(0, (baseX - fitted.left) / fitted.width)),
        Math.min(1, Math.max(0, (baseY - fitted.top) / fitted.height)),
      );
      return;
    }

    if (!panEnabled) return;
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      pan,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.pan.x + event.clientX - dragRef.current.pointerX,
      y: dragRef.current.pan.y + event.clientY - dragRef.current.pointerY,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, role: 'source' | 'output') => {
    if (annotationMode && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onPlaceAnnotation(role, 0.5, 0.5);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await canvasRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const imageTransform = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
  };

  return (
    <section className="review-canvas" ref={canvasRef} aria-label="Source and output comparison">
      <div className="canvas-toolbar" aria-label="Image view controls">
        <button
          className={`icon-button ${panEnabled ? 'icon-button--active' : ''}`}
          type="button"
          onClick={() => setPanEnabled((value) => !value)}
          aria-pressed={panEnabled}
          aria-label="Toggle synchronized pan"
          title="Pan both images"
        >
          <Hand aria-hidden="true" />
        </button>
        <button className="icon-button" type="button" onClick={() => changeZoom(zoom - 0.25)} aria-label="Zoom out">
          <Minus aria-hidden="true" />
        </button>
        <output className="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button className="icon-button" type="button" onClick={() => changeZoom(zoom + 0.25)} aria-label="Zoom in">
          <Plus aria-hidden="true" />
        </button>
        <button className="toolbar-button" type="button" onClick={fit}>
          <Scan aria-hidden="true" />
          Fit
        </button>
        <button className="icon-button" type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle full screen">
          <Expand aria-hidden="true" />
        </button>
        {annotationMode && (
          <span className="placement-status" role="status">
            Select a point on either image. Press Enter for center.
          </span>
        )}
      </div>

      <div className="mobile-image-tabs" role="tablist" aria-label="Image comparison">
        <button
          role="tab"
          aria-selected={mobileRole === 'source'}
          className={mobileRole === 'source' ? 'active' : ''}
          onClick={() => setMobileRole('source')}
        >
          Source
        </button>
        <button
          role="tab"
          aria-selected={mobileRole === 'output'}
          className={mobileRole === 'output' ? 'active' : ''}
          onClick={() => setMobileRole('output')}
        >
          Output
        </button>
      </div>

      <div className="image-comparison">
        {(['source', 'output'] as const).map((role) => {
          const asset = role === 'source' ? trace.sourceAsset : trace.outputAsset;
          const fitted = fitImage(4, 3, asset.width, asset.height);
          const visibleClass = role === mobileRole ? 'image-panel--mobile-visible' : '';
          return (
            <figure className={`image-panel ${visibleClass}`} key={role}>
              <figcaption>{role === 'source' ? 'Source' : 'Output'}</figcaption>
              <div
                className={`image-stage ${panEnabled ? 'image-stage--pannable' : ''} ${annotationMode ? 'image-stage--placing' : ''}`}
                tabIndex={0}
                aria-label={`${role === 'source' ? 'Source' : 'Output'} image. Annotation pins can be placed here.`}
                onPointerDown={(event) => handlePointerDown(event, role, asset.width, asset.height)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => handleCanvasKeyDown(event, role)}
              >
                <div className="image-transform" style={imageTransform}>
                  <img src={asset.url} alt={`${role === 'source' ? 'Source' : 'Output'} for trace ${trace.ordinal}`} draggable={false} />
                  {annotations.map((annotation, index) => annotation.assetRole === role && (
                    <button
                      className={`annotation-pin ${selectedAnnotationId === annotation.id ? 'annotation-pin--selected' : ''}`}
                      style={{
                        left: `${(fitted.left + annotation.x * fitted.width) / 4 * 100}%`,
                        top: `${(fitted.top + annotation.y * fitted.height) / 3 * 100}%`,
                      }}
                      type="button"
                      key={annotation.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectAnnotation(annotation.id);
                      }}
                      aria-label={`Annotation pin ${index + 1}: ${annotation.category}, ${annotation.severity} severity`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            </figure>
          );
        })}
      </div>

      <div className="filmstrip" aria-label="Traces in this review set">
        {traces.map((item, index) => {
          const current = index === activeIndex;
          const label = item.status === 'graded'
            ? 'Graded'
            : item.status === 'draft'
              ? 'Draft'
              : 'Needs review';
          return (
            <button
              className={`filmstrip-item ${current ? 'filmstrip-item--current' : ''}`}
              type="button"
              key={item.id}
              onClick={() => onSelectTrace(index)}
              aria-current={current ? 'true' : undefined}
            >
              <span className="filmstrip-number">{index + 1}</span>
              <img src={item.outputAsset.url} alt="" />
              <span className="filmstrip-status">{current ? 'Current' : label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
