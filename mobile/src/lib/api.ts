// Mirrors frontend/utils/api.ts — same backend, same contracts.
import { supabase } from "./supabase";
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

// The backend authenticates with the signed-in user's Supabase session token.
// (A shared EXPO_PUBLIC_* secret would ship inside the app binary.)
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
  services: { openrouter: string; supabase: string; ngrok: string };
}

// Structured chat reply blocks — mirrors src/nodes/ui_blocks.py on the
// backend. Additive: `reply` (plain text) is always present; `ui` is only
// set when the backend recognized the message as a logging confirmation or
// a question about existing data it could ground in real rows.
export interface ConfirmationBlock {
  type: "confirmation";
  status: "logged" | "removed" | "error" | "preview";
  title: string;
  subtitle?: string | null;
  rows: { label: string; value: string }[];
  insight?: string | null;
  metadata?: Record<string, any> | null;
}

export interface StatGridBlock {
  type: "stat_grid";
  title: string;
  stats: {
    label: string;
    value: string;
    unit?: string | null;
    caption?: string | null;
    severity?: "good" | "warn" | "bad" | "neutral" | null;
  }[];
}

export type UIBlock = ConfirmationBlock | StatGridBlock;

async function parseError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    if (body?.detail) {
      const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      return new Error(detail);
    }
  } catch {
    // Non-JSON error body — fall through to generic error
  }
  return new Error(`${fallback} (HTTP ${res.status})`);
}

export async function sendChat(
  message: string,
  images?: string[],
  sessionId?: string,
  dryRun = false,
): Promise<{ reply: string; ui?: UIBlock | null }> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...(message ? { message } : {}),
      // base64-encoded images WITHOUT the data: prefix
      ...(images && images.length > 0 ? { images } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      dry_run: dryRun,
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

// ─── Supplements ───────────────────────────────────────────────
export interface SupplementItem {
  id?: string;
  brand: string;
  product_name: string;
  description: string;
  serving_size: string;
  servings_per_dose?: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients: Record<string, number>;
  notes: string;
  time_of_day: "morning" | "evening" | "anytime";
  hour: number;
}

export interface SupplementPolicy {
  enabled: boolean;
  items: SupplementItem[];
}

export async function lookupSupplement(
  brand: string,
  name: string,
): Promise<SupplementItem> {
  const res = await fetch(`${API_URL}/api/supplements/lookup`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ brand, name }),
  });
  if (!res.ok) throw await parseError(res, "Supplement lookup failed");
  const json = await res.json();
  return json.supplement;
}

export async function listSupplements(): Promise<SupplementPolicy> {
  const res = await fetch(`${API_URL}/api/supplements`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw await parseError(res, "Failed to load supplements");
  const json = await res.json();
  return json.policy;
}

export async function addSupplement(
  item: SupplementItem,
  timeOfDay: "morning" | "evening" | "anytime",
  hour: number,
): Promise<SupplementItem> {
  const res = await fetch(`${API_URL}/api/supplements`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ item, time_of_day: timeOfDay, hour }),
  });
  if (!res.ok) throw await parseError(res, "Failed to add supplement");
  const json = await res.json();
  return json.supplement;
}

export async function removeSupplement(itemId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/supplements`, {
    method: "DELETE",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ item_id: itemId }),
  });
  if (!res.ok) throw await parseError(res, "Failed to remove supplement");
  const json = await res.json();
  return json.status === "success";
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
  const res = await fetch(`${API_URL}/api/pipelines/${id}/run`, {
    method: "POST",
    headers: await authHeaders(),
  });
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

export interface StatementUploadResponse {
  status: string;
  message?: string;
  upload_id?: string | null;
  path?: string;
}

export async function uploadStatement(
  fileUri: string,
  fileName: string,
): Promise<StatementUploadResponse> {
  // expo/fetch (the default in SDK 58) doesn't support RN's {uri, name, type}
  // FormData shape — only string/Blob. Convert the file to a Blob first so
  // the upload works under both expo/fetch and RN's native fetch.
  const blob = await (await fetch(fileUri)).blob();
  const form = new FormData();
  form.append("file", blob, fileName);
  const res = await fetch(`${API_URL}/statements/upload`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw await parseError(res, "Statement upload failed");
  return res.json();
}

export async function goalCheckinAnswer(
  goalId: string,
  answer: "yes" | "no",
  insightId?: string,
): Promise<{ streak: number; achieved: boolean }> {
  const res = await fetch(`${API_URL}/api/goals/checkin`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ goal_id: goalId, answer, insight_id: insightId }),
  });
  if (!res.ok) throw await parseError(res, "Check-in failed");
  return res.json();
}

// ─── Notifications ────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPrefs {
  push_enabled: boolean;
  kinds: Record<string, boolean>;
  quiet_start: string | null; // "HH:MM:SS" from Postgres TIME
  quiet_end: string | null;
  timezone: string;
}

async function apiJson<T>(path: string, init: RequestInit = {}, fallback = "Request failed"): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: await authHeaders(init.body ? { "Content-Type": "application/json" } : {}),
  });
  if (!res.ok) throw await parseError(res, fallback);
  return res.json();
}

export const fetchNotifications = (limit = 50) =>
  apiJson<{ data: AppNotification[]; unread: number }>(`/api/notifications?limit=${limit}`, {}, "Could not load notifications");

export const markNotificationsRead = (ids?: string[]) =>
  apiJson<{ updated: number }>("/api/notifications/read", { method: "POST", body: JSON.stringify(ids ?? null) });

export const fetchNotificationPrefs = () =>
  apiJson<{ data: NotificationPrefs }>("/api/notifications/prefs", {}, "Could not load preferences");

export const saveNotificationPrefs = (prefs: Partial<Omit<NotificationPrefs, "quiet_start" | "quiet_end">> & {
  quiet_start?: string | null;
  quiet_end?: string | null;
}) =>
  apiJson<{ data: NotificationPrefs }>(
    "/api/notifications/prefs",
    { method: "PUT", body: JSON.stringify(prefs) },
    "Could not save preferences",
  );

export const registerDevice = (expo_push_token: string, platform: string) =>
  apiJson("/api/notifications/devices", { method: "POST", body: JSON.stringify({ expo_push_token, platform }) });

export const sendTestNotification = () => apiJson("/api/notifications/test", { method: "POST" });

// ─── Calendar ─────────────────────────────────────────────────────────────
export type CalendarKind = "event" | "appointment" | "bill" | "reminder" | "workout" | "other";
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface CalendarOccurrence {
  id: string;
  occurrence_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  series_starts_at: string; // first occurrence of the series; edits apply to the whole series
  all_day: boolean;
  kind: CalendarKind;
  recurrence: Recurrence;
  reminder_offsets: number[];
  origin: "user" | "goal" | "rsu" | "subscription" | "dividend"; // everything but "user" is derived and read-only
}

export interface CalendarEventInput {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  all_day?: boolean;
  kind?: CalendarKind;
  recurrence?: Recurrence;
  location?: string | null;
  notes?: string | null;
  reminder_offsets?: number[];
}

export const fetchCalendarEvents = (startIso: string, endIso: string) =>
  apiJson<{ data: CalendarOccurrence[] }>(
    `/api/calendar/events?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`,
    {},
    "Could not load calendar",
  );

export const createCalendarEvent = (ev: CalendarEventInput) =>
  apiJson("/api/calendar/events", { method: "POST", body: JSON.stringify(ev) }, "Could not save event");

export const deleteCalendarEvent = (id: string) =>
  apiJson(`/api/calendar/events/${id}`, { method: "DELETE" }, "Could not delete event");

export const updateCalendarEvent = (id: string, patch: Partial<CalendarEventInput>) =>
  apiJson(`/api/calendar/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, "Could not update event");

export const fetchCalendarFeedUrl = () =>
  apiJson<{ url: string }>("/api/calendar/feed", {}, "Could not get the calendar link");

export const rotateCalendarFeedUrl = () =>
  apiJson<{ url: string }>("/api/calendar/feed/rotate", { method: "POST" }, "Could not reset the calendar link");
