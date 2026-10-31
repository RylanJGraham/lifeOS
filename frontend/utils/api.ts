import { supabase } from "./supabaseClient";
// ─── FastAPI backend client ──────────────────────────────────────
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// The backend authenticates with the caller's Supabase session token. (A shared
// NEXT_PUBLIC_* secret would ship in the browser bundle, so there isn't one.)
export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  schedule: string | null;
  status: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
}

export interface BackendStatus {
  status: string;
  services: {
    openrouter: string;
    supabase: string;
    ngrok: string;
  };
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (body?.detail) {
      const detail =
        typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      return new Error(detail);
    }
  } catch {
    // Non-JSON error body — fall through to generic error
  }
  return new Error(`${fallback} (HTTP ${res.status})`);
}

export async function sendChat(message: string, image?: string, sessionId?: string): Promise<{ reply: string }> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...(message ? { message } : {}),
      // base64-encoded image WITHOUT the data: prefix
      ...(image ? { image } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
  if (!res.ok) throw await parseError(res, "Chat request failed");
  return res.json();
}

export async function sendGoalsChat(
  message: string,
  history: { role: string; content: string }[],
): Promise<{ reply: string; goals_changed: boolean }> {
  const res = await fetch(`${API_URL}/api/goals/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw await parseError(res, "Goals chat request failed");
  return res.json();
}

export type PersonaKey = "doctor" | "nutritionist" | "pt";

export async function sendPersonaChat(
  persona: PersonaKey,
  message: string,
  history: { role: string; content: string }[],
): Promise<{ reply: string; changed: boolean }> {
  const res = await fetch(`${API_URL}/api/personas/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ persona, message, history }),
  });
  if (!res.ok) throw await parseError(res, "Specialist chat request failed");
  return res.json();
}

export async function sendBudgetCoachChat(
  message: string,
  history: { role: string; content: string }[],
): Promise<{ reply: string }> {
  const res = await fetch(`${API_URL}/api/budget-coach`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw await parseError(res, "Budget coach request failed");
  return res.json();
}

export async function getPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${API_URL}/api/pipelines`, { headers: await authHeaders() });
  if (!res.ok) throw await parseError(res, "Failed to fetch pipelines");
  const body = await res.json();
  return body.data ?? [];
}

export async function runPipeline(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/pipelines/${id}/run`, { method: "POST", headers: await authHeaders() });
  if (!res.ok) throw await parseError(res, `Failed to run pipeline "${id}"`);
}

export async function getBackendStatus(): Promise<BackendStatus> {
  const res = await fetch(`${API_URL}/status`);
  if (!res.ok) throw await parseError(res, "Failed to fetch backend status");
  return res.json();
}

export interface TelegramWebhookInfo {
  status: string;
  webhook_url: string;
  last_update_at: string | null;
  pending_update_count: number;
  webhook_status: "ok" | "failing" | "not_set";
  error: string;
}

export async function getTelegramWebhookInfo(): Promise<TelegramWebhookInfo> {
  const res = await fetch(`${API_URL}/telegram/webhook-info`, { headers: await authHeaders() });
  if (!res.ok) throw await parseError(res, "Failed to fetch Telegram webhook info");
  return res.json();
}

export interface CalculateTargetsRequest {
  height_cm: number;
  age: number;
  sex: "male" | "female";
  physique_description: string;
  goal: "cut" | "lean_bulk" | "bulk" | "maintain";
  activity_level: "sedentary" | "light" | "moderate" | "athlete";
  current_weight_kg?: number | null;
}

export interface CalculatedTargets {
  estimated_weight_kg: number;
  weight_was_estimated: boolean;
  bmr: number;
  tdee: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export async function calculateTargets(req: CalculateTargetsRequest): Promise<CalculatedTargets> {
  const res = await fetch(`${API_URL}/api/calculate-targets`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw await parseError(res, "Failed to calculate targets");
  return res.json();
}

// ─── Calendar ─────────────────────────────────────────────────────
export interface CalendarOccurrence {
  id: string;
  occurrence_id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  series_starts_at: string; // first occurrence of the series; edits apply to the whole series
  all_day: boolean;
  kind: string;
  recurrence: string;
  reminder_offsets: number[];
  origin: "user" | "goal" | "rsu" | "subscription" | "dividend"; // everything but "user" is derived and read-only
}

export async function getCalendarEvents(startIso: string, endIso: string): Promise<CalendarOccurrence[]> {
  const res = await fetch(
    `${API_URL}/api/calendar/events?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
    { headers: await authHeaders() },
  );
  if (!res.ok) throw await parseError(res, "Could not load calendar");
  return (await res.json()).data;
}

export async function createCalendarEvent(ev: {
  title: string;
  starts_at: string;
  recurrence?: string;
  location?: string | null;
  reminder_offsets?: number[];
}): Promise<void> {
  const res = await fetch(`${API_URL}/api/calendar/events`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(ev),
  });
  if (!res.ok) throw await parseError(res, "Could not save event");
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/calendar/events/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res, "Could not delete event");
}

export async function updateCalendarEvent(
  id: string,
  patch: { title?: string; starts_at?: string; recurrence?: string; location?: string | null; reminder_offsets?: number[] },
): Promise<void> {
  const res = await fetch(`${API_URL}/api/calendar/events/${id}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await parseError(res, "Could not update event");
}

export async function getCalendarFeedUrl(rotate = false): Promise<string> {
  const res = await fetch(`${API_URL}/api/calendar/feed${rotate ? "/rotate" : ""}`, {
    method: rotate ? "POST" : "GET",
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res, "Could not get the calendar link");
  return (await res.json()).url;
}
