import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export interface AuthenticatedContext {
  client: SupabaseClient;
  user: User;
}

export type AiQuotaAction = "analyze_clothing" | "generate_outfits";

function requiredEnvironmentValue(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(
      500,
      "SERVER_CONFIGURATION_ERROR",
      "The server is not configured correctly.",
    );
  }
  return value;
}

function keyFromMap(name: string): string | null {
  const rawValue = Deno.env.get(name)?.trim();
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const keys = parsed as Record<string, unknown>;
    if (typeof keys.default === "string" && keys.default.trim()) {
      return keys.default.trim();
    }
    const firstKey = Object.values(keys).find((value) =>
      typeof value === "string" && value.trim().length > 0
    );
    return typeof firstKey === "string" ? firstKey.trim() : null;
  } catch {
    return null;
  }
}

function requiredSupabaseKey(
  legacyName: string,
  keyMapName: string,
): string {
  const legacyValue = Deno.env.get(legacyName)?.trim();
  const value = legacyValue || keyFromMap(keyMapName);
  if (!value) {
    throw new HttpError(
      500,
      "SERVER_CONFIGURATION_ERROR",
      "The server is not configured correctly.",
    );
  }
  return value;
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  } as const;
}

export async function authenticatedContext(
  request: Request,
): Promise<AuthenticatedContext> {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    throw new HttpError(401, "AUTH_REQUIRED", "Authentication required.");
  }

  const client = createClient(
    requiredEnvironmentValue("SUPABASE_URL"),
    requiredSupabaseKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS"),
    {
      ...clientOptions(),
      global: { headers: { Authorization: authorization } },
    },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new HttpError(401, "INVALID_TOKEN", "Invalid or expired token.");
  }

  return { client, user: data.user };
}

export function adminClient(): SupabaseClient {
  return createClient(
    requiredEnvironmentValue("SUPABASE_URL"),
    requiredSupabaseKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS"),
    clientOptions(),
  );
}

export async function enforceAiQuota(
  client: SupabaseClient,
  action: AiQuotaAction,
): Promise<void> {
  const { data, error } = await client.rpc("consume_ai_quota", {
    p_action: action,
  });
  if (error) {
    console.error("Unable to enforce AI quota:", error.code);
    throw new HttpError(500, "QUOTA_CHECK_FAILED", "Unable to check AI quota.");
  }
  if (data !== true) {
    throw new HttpError(
      429,
      "AI_RATE_LIMITED",
      "Hourly AI request limit reached. Try again later.",
    );
  }
}
