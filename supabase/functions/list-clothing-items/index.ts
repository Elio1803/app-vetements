import { adminClient, authenticatedContext } from "../_shared/auth.ts";
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
      const { user } = await authenticatedContext(request);
      const { data, error } = await adminClient()
        .from("clothing_items")
        .select(
          "id, user_id, photo_url, category, color_dominant, name, created_at, last_worn_at, wear_count",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Unable to list clothing items:", error.code, error.message);
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
