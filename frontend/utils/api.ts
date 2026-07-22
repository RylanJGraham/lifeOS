// ─── FastAPI backend client ──────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return API_TOKEN ? { ...extra, "X-API-Key": API_TOKEN } : extra;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  status: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
}

export interface BackendStatus {
  status: string;
  services: {
    ollama: string;
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
    // Non-JSON error body — fall through to generic message
  }
  return new Error(`${fallback} (HTTP ${res.status})`);
}

export async function sendChat(message: string, image?: string): Promise<{ reply: string }> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...(message ? { message } : {}),
      // base64-encoded image WITHOUT the data: prefix
      ...(image ? { image } : {}),
    }),
  });
  if (!res.ok) throw await parseError(res, "Chat request failed");
  return res.json();
}

export async function getPipelines(): Promise<Pipeline[]> {
  const res = await fetch(`${API_URL}/api/pipelines`, { headers: authHeaders() });
  if (!res.ok) throw await parseError(res, "Failed to fetch pipelines");
  const body = await res.json();
  return body.data ?? [];
}

export async function runPipeline(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/pipelines/${id}/run`, { method: "POST", headers: authHeaders() });
  if (!res.ok) throw await parseError(res, `Failed to run pipeline "${id}"`);
}

export async function getBackendStatus(): Promise<BackendStatus> {
  const res = await fetch(`${API_URL}/status`);
  if (!res.ok) throw await parseError(res, "Failed to fetch backend status");
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
