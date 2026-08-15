import type {
  Annotation,
  AnnotationInput,
  BootstrapResponse,
  Review,
  ReviewInput,
  RunDetail,
} from '../../shared/types';

export interface ExportResponse {
  exportPath: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json() as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // The status code remains useful when an endpoint returns no JSON body.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('/api/bootstrap'),

  getRun: (runId: string) =>
    request<RunDetail>(`/api/runs/${encodeURIComponent(runId)}`),

  saveReview: (traceId: string, input: ReviewInput) =>
    request<Review>(`/api/traces/${encodeURIComponent(traceId)}/review`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  addAnnotation: (traceId: string, input: AnnotationInput) =>
    request<Annotation>(`/api/traces/${encodeURIComponent(traceId)}/annotations`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateAnnotation: (annotationId: string, input: AnnotationInput) =>
    request<Annotation>(`/api/annotations/${encodeURIComponent(annotationId)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteAnnotation: (annotationId: string) =>
    request<void>(`/api/annotations/${encodeURIComponent(annotationId)}`, {
      method: 'DELETE',
    }),

  exportRun: async (runId: string) => {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/export`, {
      method: 'POST',
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json() as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // The status code remains useful when an endpoint returns no JSON body.
      }
      throw new ApiError(message, response.status);
    }

    if (response.headers.get('content-type')?.includes('application/zip')) {
      const disposition = response.headers.get('content-disposition') ?? '';
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'eval-bundle.zip';
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      return { exportPath: `Downloaded ${fileName}` };
    }

    return response.json() as Promise<ExportResponse>;
  },
};
