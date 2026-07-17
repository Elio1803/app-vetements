import {
  authenticatedContext,
  enforceApiRateLimit,
} from "../_shared/auth.ts";
import {
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
} from "../_shared/http.ts";

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    try {
      const { client } = await authenticatedContext(request);
      await enforceApiRateLimit(client, "list_clothing_items");
      const { data, error } = await client
        .from("clothing_items")
        .select(
          "id, user_id, photo_url, category, color_dominant, name, created_at, last_worn_at, wear_count",
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Unable to list clothing items:", error.code);
        throw new HttpError(
          500,
          "WARDROBE_LOAD_FAILED",
          "Unable to load the wardrobe.",
        );
      }

      return jsonResponse(request, 200, { items: data ?? [] });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
