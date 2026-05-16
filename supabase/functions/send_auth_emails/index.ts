import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend";
import { renderAuthEmail, type AuthEmailVariant } from "../_shared/emails/auth-email.tsx";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const emailFrom = Deno.env.get("EMAIL_FROM");
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/+$/, "");

if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY.");
}

if (!emailFrom) {
  throw new Error("Missing EMAIL_FROM.");
}

if (!hookSecret) {
  throw new Error("Missing SEND_EMAIL_HOOK_SECRET.");
}

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL.");
}

if (!siteUrl) {
  throw new Error("Missing SITE_URL.");
}

const resend = new Resend(resendApiKey);
const webhook = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));

type AuthUser = {
  id: string;
  email?: string | null;
  new_email?: string | null;
  user_metadata?: {
    first_name?: string | null;
    full_name?: string | null;
    [key: string]: unknown;
  } | null;
};

type AuthEmailData = {
  token: string;
  token_hash: string;
  redirect_to?: string | null;
  email_action_type: string;
  site_url?: string | null;
  token_new?: string | null;
  token_hash_new?: string | null;
};

type AuthHookPayload = {
  user: AuthUser;
  email_data: AuthEmailData;
};

const DIRECT_AUTH_ACTION_TYPES = [
  "signup",
  "email",
  "magiclink",
  "recovery",
  "invite",
  "reauthentication",
] as const;

type DirectAuthActionType = (typeof DIRECT_AUTH_ACTION_TYPES)[number];

type OutboundEmail = {
  to: string;
  variant: AuthEmailVariant;
  otp: string;
  tokenHash: string;
};

function getFirstName(user: AuthUser) {
  const firstName = user.user_metadata?.first_name?.trim();
  if (firstName) return firstName;

  const fullName = user.user_metadata?.full_name?.trim();
  if (!fullName) return null;

  return fullName.split(/\s+/)[0] || null;
}

function getActionUrl(args: {
  tokenHash: string;
  emailActionType: string;
}) {
  const url = new URL("/auth/v1/verify", supabaseUrl);
  url.searchParams.set("token", args.tokenHash);
  url.searchParams.set("type", args.emailActionType);
  url.searchParams.set("redirect_to", siteUrl);

  return url.toString();
}

function isDirectAuthActionType(emailActionType: string): emailActionType is DirectAuthActionType {
  return DIRECT_AUTH_ACTION_TYPES.includes(emailActionType as DirectAuthActionType);
}

function getAuthEmailVariant(emailActionType: DirectAuthActionType): AuthEmailVariant {
  return emailActionType === "email" ? "magiclink" : emailActionType;
}

function buildOutboundEmails(payload: AuthHookPayload): OutboundEmail[] {
  const {
    user,
    email_data: {
      email_action_type: emailActionType,
      token,
      token_hash: tokenHash,
      token_new: tokenNew,
      token_hash_new: tokenHashNew,
    },
  } = payload;

  if (emailActionType === "email_change") {
    if (!user.new_email) {
      throw new Error("Missing user.new_email for email_change.");
    }

    if (tokenHashNew && token) {
      const emails: OutboundEmail[] = [];

      if (user.email) {
        emails.push({
          to: user.email,
          variant: "email_change_current",
          otp: token,
          tokenHash: tokenHashNew,
        });
      }

      emails.push({
        to: user.new_email,
        variant: "email_change_new",
        otp: tokenNew || token,
        tokenHash,
      });

      return emails;
    }

    return [
      {
        to: user.new_email,
        variant: "email_change_new",
        otp: tokenNew || token,
        tokenHash,
      },
    ];
  }

  if (!user.email) {
    throw new Error(`Missing user.email for auth email_action_type: ${emailActionType}`);
  }

  if (!isDirectAuthActionType(emailActionType)) {
    throw new Error(`Unsupported auth email_action_type: ${emailActionType}`);
  }

  return [
    {
      to: user.email,
      variant: getAuthEmailVariant(emailActionType),
      otp: token,
      tokenHash,
    },
  ];
}

async function sendAuthEmail(payload: AuthHookPayload) {
  const emails = buildOutboundEmails(payload);
  const firstName = getFirstName(payload.user);

  for (const email of emails) {
    const rendered = await renderAuthEmail({
      variant: email.variant,
      actionUrl: getActionUrl({
        tokenHash: email.tokenHash,
        emailActionType: payload.email_data.email_action_type,
      }),
      otp: email.otp,
      recipientEmail: email.to,
      firstName,
      newEmail: payload.user.new_email,
    });

    const { error } = await resend.emails.send({
      from: emailFrom,
      to: [email.to],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [
        { name: "category", value: "auth" },
        { name: "auth_action", value: payload.email_data.email_action_type },
        { name: "auth_variant", value: email.variant },
      ],
    });

    if (error) {
      throw new Error(error.message);
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const rawPayload = await request.text();
    const headers = Object.fromEntries(request.headers);
    const payload = webhook.verify(rawPayload, headers) as AuthHookPayload;

    await sendAuthEmail(payload);

    return jsonResponse({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return jsonResponse(
      {
        error: {
          message,
        },
      },
      { status: 401 },
    );
  }
});
