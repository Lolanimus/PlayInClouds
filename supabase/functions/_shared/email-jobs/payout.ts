import { renderPayoutEmail } from "../emails/payout-email.tsx";

export type PayoutQueuePayload = {
  reservation_id: string;
  listing_id: string;
  listing_title: string;
  host_first_name?: string | null;
  host_last_name?: string | null;
};

export type PayoutQueueMessage = {
  dedupe_key: string;
  job_type: string;
  recipient_role: "host";
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: PayoutQueuePayload;
};

export function isPayoutEmailJobType(jobType: string) {
  return jobType === "host_payout_setup_needed";
}

export async function buildPayoutEmailJob(message: PayoutQueueMessage, siteUrl: string) {
  const email = await renderPayoutEmail({
    financesUrl: `${siteUrl}/host/finances`,
    listingTitle: message.payload.listing_title,
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
