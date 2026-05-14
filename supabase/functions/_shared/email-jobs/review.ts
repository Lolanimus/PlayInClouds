import {
  renderReviewReminderEmail,
  type ReviewReminderRecipientRole,
} from "../emails/review-reminder-email.tsx";
import { renderReviewReceivedEmail } from "../emails/review-received-email.tsx";

export type ReviewQueuePayload = {
  reservation_id: string;
  listing_id: string;
  listing_title: string;
  listing_time_zone: string;
  start_at: string;
  end_at: string;
  expires_at: string;
  renter_first_name?: string | null;
  renter_last_name?: string | null;
  host_first_name?: string | null;
  host_last_name?: string | null;
};

export type ReviewReceivedQueuePayload = {
  review_id: string;
  reservation_id: string;
  listing_id: string;
  listing_title: string;
  rating: number | string;
  reviewer_first_name?: string | null;
  reviewer_last_name?: string | null;
  reviewee_first_name?: string | null;
  reviewee_last_name?: string | null;
};

export type ReviewReminderQueueMessage = {
  dedupe_key: string;
  job_type: "review_reminder";
  recipient_role: ReviewReminderRecipientRole;
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: ReviewQueuePayload;
};

export type ReviewReceivedQueueMessage = {
  dedupe_key: string;
  job_type: "review_received";
  recipient_role: ReviewReminderRecipientRole;
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: ReviewReceivedQueuePayload;
};

export type ReviewQueueMessage = ReviewReminderQueueMessage | ReviewReceivedQueueMessage;

export function isReviewEmailJobType(jobType: string) {
  return jobType === "review_reminder" || jobType === "review_received";
}

export async function buildReviewEmailJob(message: ReviewQueueMessage, siteUrl: string) {
  const email = message.job_type === "review_received"
    ? await renderReviewReceivedEmail({
      recipientRole: message.recipient_role,
      profileUrl: message.recipient_user_id
        ? `${siteUrl}/profile/${message.recipient_user_id}`
        : `${siteUrl}/reservation/${message.payload.reservation_id}`,
      listingTitle: message.payload.listing_title,
      rating: Number(message.payload.rating),
      reviewerFirstName: message.payload.reviewer_first_name,
      reviewerLastName: message.payload.reviewer_last_name,
      revieweeFirstName: message.payload.reviewee_first_name,
      revieweeLastName: message.payload.reviewee_last_name,
    })
    : await renderReviewReminderEmail({
      recipientRole: message.recipient_role,
      reservationUrl: `${siteUrl}/reservation/${message.payload.reservation_id}?leaveReview=1`,
      listingTitle: message.payload.listing_title,
      listingTimeZone: message.payload.listing_time_zone || "UTC",
      startAt: message.payload.start_at,
      endAt: message.payload.end_at,
      expiresAt: message.payload.expires_at,
      renterFirstName: message.payload.renter_first_name,
      renterLastName: message.payload.renter_last_name,
      hostFirstName: message.payload.host_first_name,
      hostLastName: message.payload.host_last_name,
    });

  return {
    to: message.recipient_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    tags: [
      { name: "job_type", value: message.job_type },
      { name: "recipient_role", value: message.recipient_role },
    ],
  };
}
