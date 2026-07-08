import type { FinalSlot, Marks, PollMeta } from "./scheduling";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const err = new Error((body as { error?: string } | null)?.error || `request_failed_${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface CreatePollInput {
  purpose: string;
  dates: string[];
  startHour: number;
  endHour: number;
  dur: number;
}

export function createPoll(input: CreatePollInput): Promise<PollMeta> {
  return request<PollMeta>("/polls", { method: "POST", body: JSON.stringify(input) });
}

export function getPoll(id: string): Promise<PollMeta> {
  return request<PollMeta>(`/polls/${id}`);
}

export function checkNameExists(id: string, name: string): Promise<{ exists: boolean }> {
  return request<{ exists: boolean }>(`/polls/${id}/responses/${encodeURIComponent(name)}/exists`);
}

export function submitResponse(id: string, name: string, marks: Marks): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/polls/${id}/responses`, {
    method: "POST",
    body: JSON.stringify({ name, marks }),
  });
}

export interface ResultsPayload {
  poll: PollMeta;
  responses: Record<string, Marks>;
}

export function getResults(id: string): Promise<ResultsPayload> {
  return request<ResultsPayload>(`/polls/${id}/results`);
}

export function updatePoll(
  id: string,
  patch: { required?: string[]; final?: FinalSlot | null }
): Promise<PollMeta> {
  return request<PollMeta>(`/polls/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function seedDemo(id: string): Promise<{ added: number }> {
  return request<{ added: number }>(`/polls/${id}/seed-demo`, { method: "POST" });
}
