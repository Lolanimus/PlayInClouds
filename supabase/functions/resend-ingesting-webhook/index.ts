import { createServiceClient } from "../_shared/supabase.ts";
import { verifyWebhook, type WebhookHeaders } from '../_shared/resend/verify-webhook.ts';
import {
  prepareContactEventData,
  prepareDomainEventData,
  prepareEmailEventData,
} from '../_shared/resend/webhook-handler.ts';
import {
  type ContactWebhookEvent,
  type DomainWebhookEvent,
  type EmailWebhookEvent,
  isContactEvent,
  isDomainEvent,
  isEmailEvent,
} from '../_shared/resend/resend-webhook.types.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;
const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");

async function insertEmailEvent(
  supabase: SupabaseClient,
  event: EmailWebhookEvent,
  svixId: string,
) {
  const data = prepareEmailEventData(event);

  const { error } = await supabase.from('resend_wh_emails').upsert(
    {
      svix_id: svixId,
      ...data,
    },
    { onConflict: 'svix_id', ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`Failed to insert email event: ${error.message}`);
  }
}

async function insertContactEvent(
  supabase: SupabaseClient,
  event: ContactWebhookEvent,
  svixId: string,
) {
  const data = prepareContactEventData(event);

  const { error } = await supabase.from('resend_wh_contacts').upsert(
    {
      svix_id: svixId,
      ...data,
    },
    { onConflict: 'svix_id', ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`Failed to insert contact event: ${error.message}`);
  }
}

async function insertDomainEvent(
  supabase: SupabaseClient,
  event: DomainWebhookEvent,
  svixId: string,
) {
  const data = prepareDomainEventData(event);

  const { error } = await supabase.from('resend_wh_domains').upsert(
    {
      svix_id: svixId,
      ...data,
    },
    { onConflict: 'svix_id', ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`Failed to insert domain event: ${error.message}`);
  }
}

Deno.serve(async (request) => {
  if (!secret) {
    console.error('Missing RESEND_WEBHOOK_SECRET environment variable');
    return Response.json(
      { error: 'Server misconfiguration' },
      { status: 500 },
    );
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json(
      { error: 'Missing required Svix headers' },
      { status: 400 },
    );
  }

  const headers: WebhookHeaders = {
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': svixSignature,
  };

  const rawBody = await request.text();
  const result = verifyWebhook(rawBody, headers, secret);

  if (!result.success) {
    console.error('Webhook verification failed:', result.error);
    return Response.json(
      { error: 'Invalid webhook signature' },
      { status: 401 },
    );
  }

  const event = result.event;

  try {
    const supabase = createServiceClient();

    if (isEmailEvent(event)) {
      await insertEmailEvent(supabase, event, svixId);
    } else if (isContactEvent(event)) {
      await insertContactEvent(supabase, event, svixId);
    } else if (isDomainEvent(event)) {
      await insertDomainEvent(supabase, event, svixId);
    } else {
      const _exhaustiveCheck = event;
      console.warn('Unknown event type:', _exhaustiveCheck);
      return Response.json(
        { error: 'Unknown event type' },
        { status: 400 },
      );
    }

    return Response.json({ received: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Database insertion failed:', message);
    return Response.json(
      { error: 'Failed to process webhook' },
      { status: 500 },
    );
  }
});
