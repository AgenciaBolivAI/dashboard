/**
 * n8n REST API wrapper. Used to read execution history (so the dashboard
 * can show recent runs / failures) and to trigger ingestion sub-workflows.
 *
 * n8n API docs: https://docs.n8n.io/api/
 *
 * NOTE: server-only. The N8N_API_KEY must never reach the browser.
 */

const BASE = process.env.N8N_BASE_URL!;
const KEY = process.env.N8N_API_KEY!;

type FetchOpts = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

async function n8nFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(`/api/v1${path}`, BASE);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      "X-N8N-API-KEY": KEY,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`n8n ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type N8NExecution = {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt: string | null;
  workflowId: string;
  status: "running" | "success" | "error" | "waiting" | "canceled";
};

export async function listExecutions(opts: {
  workflowId?: string;
  limit?: number;
  status?: "success" | "error" | "running" | "waiting";
} = {}) {
  const { data } = await n8nFetch<{ data: N8NExecution[] }>("/executions", {
    query: {
      workflowId: opts.workflowId,
      limit: opts.limit ?? 50,
      status: opts.status,
    },
  });
  return data;
}

export async function getExecution(id: string) {
  return n8nFetch<{ id: string; data: unknown; status: string }>(
    `/executions/${id}`,
  );
}

export async function listWorkflows() {
  const { data } = await n8nFetch<{ data: { id: string; name: string; active: boolean }[] }>(
    "/workflows",
  );
  return data;
}

export async function triggerWorkflow(workflowId: string, payload: unknown) {
  return n8nFetch<{ id: string }>(`/workflows/${workflowId}/execute`, {
    method: "POST",
    body: payload,
  });
}
