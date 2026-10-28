// Mirrors frontend/utils/api.ts — same backend, same contracts.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
export const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || "";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return API_TOKEN ? { ...extra, "X-API-Key": API_TOKEN } : extra;
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
  status: "logged" | "removed" | "error";
  title: string;
  subtitle?: string | null;
  rows: { label: string; value: string }[];
  insight?: string | null;
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
): Promise<{ reply: string; ui?: UIBlock | null }> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...(message ? { message } : {}),
      // base64-encoded images WITHOUT the data: prefix
      ...(images && images.length > 0 ? { images } : {}),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ brand, name }),
  });
  if (!res.ok) throw await parseError(res, "Supplement lookup failed");
  const json = await res.json();
  return json.supplement;
}

export async function listSupplements(): Promise<SupplementPolicy> {
  const res = await fetch(`${API_URL}/api/supplements`, {
    headers: authHeaders(),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ item, time_of_day: timeOfDay, hour }),
  });
  if (!res.ok) throw await parseError(res, "Failed to add supplement");
  const json = await res.json();
  return json.supplement;
}

export async function removeSupplement(itemId: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/supplements`, {
    method: "DELETE",
    headers: authHeaders({ "Content-Type": "application/json" }),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
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
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, history }),
  });
  if (!res.ok) throw await parseError(res, "Budget coach request failed");
  return res.json();
}

export async function getPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${API_URL}/api/pipelines`, { headers: authHeaders() });
  if (!res.ok) throw await parseError(res, "Failed to fetch pipelines");
  const body = await res.json();
  return body.data ?? [];
}

export async function runPipeline(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/pipelines/${id}/run`, {
    method: "POST",
    headers: authHeaders(),
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
  const res = await fetch(`${API_URL}/telegram/webhook-info`, { headers: authHeaders() });
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
    headers: authHeaders({ "Content-Type": "application/json" }),
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
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw await parseError(res, "Statement upload failed");
  return res.json();
}
