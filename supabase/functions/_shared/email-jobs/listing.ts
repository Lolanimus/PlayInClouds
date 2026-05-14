import {
  renderListingEmail,
  type ListingEmailInput,
  type ListingEmailVariant,
} from "../emails/listing-email.tsx";

export type ListingRecipientRole = "owner";
export type ListingStatusTransition =
  | "PENDING_APPROVAL-APPROVED"
  | "PENDING_APPROVAL-REJECTED";

export type ListingQueuePayload = {
  listing_id: string;
  listing_title: string;
  owner_first_name?: string | null;
  owner_last_name?: string | null;
  moderation_message?: string | null;
  status_transition?: ListingStatusTransition | null;
};

export type ListingQueueMessage = {
  dedupe_key: string;
  job_type: string;
  recipient_role: ListingRecipientRole;
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: ListingQueuePayload;
};

export function isListingEmailJobType(jobType: string) {
  return jobType === "listing_created" || jobType === "listing_status_changed";
}

function toListingVariant(message: ListingQueueMessage): ListingEmailVariant {
  if (message.job_type === "listing_created") return "NEW_LISTING_CREATED";

  if (
    message.job_type === "listing_status_changed" &&
    message.payload.status_transition === "PENDING_APPROVAL-APPROVED"
  ) {
    return "LISTING_APPROVED";
  }

  if (
    message.job_type === "listing_status_changed" &&
    message.payload.status_transition === "PENDING_APPROVAL-REJECTED"
  ) {
    return "LISTING_REFUSED";
  }

  throw new Error(`Unsupported listing email job: ${message.job_type}`);
}

function toListingInput(message: ListingQueueMessage, siteUrl: string): ListingEmailInput {
  return {
    variant: toListingVariant(message),
    listingUrl: `${siteUrl}/host/edit-listing/${message.payload.listing_id}`,
    listingTitle: message.payload.listing_title,
    ownerFirstName: message.payload.owner_first_name,
    ownerLastName: message.payload.owner_last_name,
    moderationMessage: message.payload.moderation_message,
  };
}

export async function buildListingEmailJob(message: ListingQueueMessage, siteUrl: string) {
  const email = await renderListingEmail(toListingInput(message, siteUrl));

  return {
    to: message.recipient_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    tags: [
      { name: "job_type", value: message.job_type },
      { name: "recipient_role", value: message.recipient_role },
      ...(message.payload.status_transition
        ? [{ name: "status_transition", value: message.payload.status_transition }]
        : []),
    ],
  };
}
