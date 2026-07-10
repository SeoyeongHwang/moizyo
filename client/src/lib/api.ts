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

// A password mismatch is indistinguishable from "no such response yet" —
// names aren't unique, so both cases just mean "create a new response."
export type ResponseAccess = { status: "new" } | { status: "ok"; id: number; marks: Marks };

export function checkResponseAccess(id: string, name: string, password: string): Promise<ResponseAccess> {
  return request<ResponseAccess>(`/polls/${id}/responses/${encodeURIComponent(name)}/check`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function submitResponse(id: string, name: string, password: string, marks: Marks): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/polls/${id}/responses`, {
    method: "POST",
    body: JSON.stringify({ name, password, marks }),
  });
}

export function updateResponse(id: string, responseId: number, password: string, marks: Marks): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/polls/${id}/responses/${responseId}`, {
    method: "PUT",
    body: JSON.stringify({ password, marks }),
  });
}

export function deleteResponse(id: string, responseId: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/polls/${id}/responses/${responseId}`, { method: "DELETE" });
}

export interface ResponseEntry {
  id: number;
  name: string;
  marks: Marks;
}

export interface ResultsPayload {
  poll: PollMeta;
  responses: ResponseEntry[];
}

export function getResults(id: string): Promise<ResultsPayload> {
  return request<ResultsPayload>(`/polls/${id}/results`);
}

export function updatePoll(
  id: string,
  patch: { required?: string[]; final?: FinalSlot | null; dur?: number }
): Promise<PollMeta> {
  return request<PollMeta>(`/polls/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function seedDemo(id: string): Promise<{ added: number }> {
  return request<{ added: number }>(`/polls/${id}/seed-demo`, { method: "POST" });
}
