import { Resend } from "npm:resend";
import {
  buildChatEmailJob,
  isChatEmailJobType,
  type ChatQueueMessage,
} from "../_shared/email-jobs/chat.ts";
import {
  buildListingEmailJob,
  isListingEmailJobType,
  type ListingQueueMessage,
} from "../_shared/email-jobs/listing.ts";
import {
  buildPayoutEmailJob,
  isPayoutEmailJobType,
  type PayoutQueueMessage,
} from "../_shared/email-jobs/payout.ts";
import {
  buildReservationEmailJob,
  isReservationEmailJobType,
  type ReservationQueueMessage,
} from "../_shared/email-jobs/reservation.ts";
import {
  buildReviewEmailJob,
  isReviewEmailJobType,
  type ReviewQueueMessage,
} from "../_shared/email-jobs/review.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const emailFrom = Deno.env.get("EMAIL_FROM");
const siteUrl = (Deno.env.get("SITE_URL") ?? "http://localhost:5173").replace(/\/+$/, "");

if (!resendApiKey) {
  throw new Error("Missing RESEND_API_KEY.");
}

if (!emailFrom) {
  throw new Error("Missing EMAIL_FROM.");
}

const resend = new Resend(resendApiKey);

type RequestBody = {
  limit?: number;
};

type QueuePayload = {
  [key: string]: unknown;
};

type QueueRecord = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: (ChatQueueMessage | ListingQueueMessage | PayoutQueueMessage | ReservationQueueMessage | ReviewQueueMessage) & { payload: QueuePayload };
};

async function readQueue(limit: number) {
  const service = createServiceClient();
  const { data, error } = await service
    .schema("pgmq_public")
    .rpc("read", {
      queue_name: "emails_queue",
      sleep_seconds: 60,
      n: limit,
    });

  if (error) {
    throw new Error(`Failed to read emails_queue: ${error.message}`);
  }

  return (data ?? []) as QueueRecord[];
}

async function deleteMessage(msgId: number) {
  const service = createServiceClient();
  const { error } = await service
    .schema("pgmq_public")
    .rpc("delete", {
      queue_name: "emails_queue",
      message_id: msgId,
    });

  if (error) {
    throw new Error(`Failed to delete queue message ${msgId}: ${error.message}`);
  }
}

async function sendEmail(args: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
}) {
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    tags: args.tags,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function processMessage(record: QueueRecord) {
  try {
    const email = isChatEmailJobType(record.message.job_type)
      ? await buildChatEmailJob(record.message as ChatQueueMessage, siteUrl)
      : isReservationEmailJobType(record.message.job_type)
      ? await buildReservationEmailJob(record.message as ReservationQueueMessage, siteUrl)
      : isListingEmailJobType(record.message.job_type)
      ? await buildListingEmailJob(record.message as ListingQueueMessage, siteUrl)
      : isPayoutEmailJobType(record.message.job_type)
      ? await buildPayoutEmailJob(record.message as PayoutQueueMessage, siteUrl)
      : isReviewEmailJobType(record.message.job_type)
      ? await buildReviewEmailJob(record.message as ReviewQueueMessage, siteUrl)
      : null;

    if (!email) {
      throw new Error(`Unhandled email job type: ${record.message.job_type}`);
    }

    const providerMessageId = await sendEmail(email);

    await deleteMessage(record.msg_id);

    return {
      msgId: record.msg_id,
      dedupeKey: record.message.dedupe_key,
      sent: true,
      providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      msgId: record.msg_id,
      dedupeKey: record.message.dedupe_key,
      sent: false,
      error: message,
    };
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
    const body = await request.json() as RequestBody;
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0
      ? Math.min(body.limit, 50)
      : 25;

    const records = await readQueue(limit);
    const results = [];

    for (const record of records) {
      results.push(await processMessage(record));
    }

    return jsonResponse({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("process-emails-queue failed:", error);
    return errorResponse(message, 500);
  }
});
