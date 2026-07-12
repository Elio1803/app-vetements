import { adminClient, authenticatedContext } from "../_shared/auth.ts";
import {
  errorResponse,
  guardRequest,
  HttpError,
  jsonResponse,
} from "../_shared/http.ts";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(
      500,
      "SERVER_CONFIGURATION_ERROR",
      "Welcome email service is not configured.",
    );
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const guarded = guardRequest(request);
    if (guarded) return guarded;

    try {
      const { user } = await authenticatedContext(request);
      if (!user.email) {
        throw new HttpError(422, "EMAIL_MISSING", "The account has no email address.");
      }

      const admin = adminClient();
      const { data: profile, error: profileError } = await admin
        .from("users")
        .select("welcome_email_sent_at")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;
      if (profile.welcome_email_sent_at) {
        return jsonResponse(request, 200, { sent: false, already_sent: true });
      }

      const email = user.email.trim();
      const displayName = email.split("@")[0] || "vous";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requiredSecret("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `welcome-${user.id}`,
        },
        body: JSON.stringify({
          from: requiredSecret("WELCOME_FROM_EMAIL"),
          to: [email],
          subject: "Bonjour et bienvenue dans Le Dressing",
          text: `Bonjour ${displayName},\n\nVotre dressing est prêt. Ajoutez vos propres vêtements et composez vos premières tenues.\n\nÀ bientôt dans Le Dressing.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#201f1b"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">Le Dressing</p><h1 style="font-family:Georgia,serif;font-weight:500">Bonjour ${escapeHtml(displayName)},</h1><p>Votre dressing est prêt. Ajoutez vos propres vêtements et composez vos premières tenues.</p><p>À bientôt dans Le Dressing.</p></div>`,
        }),
      });
      if (!response.ok) {
        console.error("Resend rejected welcome email:", response.status);
        throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "Unable to send welcome email.");
      }

      const { error: updateError } = await admin
        .from("users")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) throw updateError;

      return jsonResponse(request, 200, { sent: true });
    } catch (error) {
      return errorResponse(request, error);
    }
  },
};
