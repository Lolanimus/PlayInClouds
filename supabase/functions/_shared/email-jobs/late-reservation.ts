import {
  renderLateReservationEmail,
  type LateReservationEmailInput,
  type LateReservationEmailVariant,
} from "../emails/late-reservation-email.tsx";

export type LateReservationRecipientRole = "booker" | "host";

export type LateReservationState =
  | "late_reservation_consent_required"
  | "late_reservation_waiting_for_guest"
  | "late_reservation_host_approved"
  | "late_reservation_guest_continued";

export type LateReservationQueuePayload = {
  reservation_id: string;
  listing_id: string;
  listing_title: string;
  listing_time_zone: string;
  start_at: string;
  end_at: string;
  payment_deadline: string;
  late_state: LateReservationState;
  reservation_confirmed?: boolean | null;
  renter_first_name?: string | null;
  renter_last_name?: string | null;
  host_first_name?: string | null;
  host_last_name?: string | null;
};

export type LateReservationQueueMessage = {
  dedupe_key: string;
  job_type: "late_reservation_status_changed";
  recipient_role: LateReservationRecipientRole;
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: LateReservationQueuePayload;
};

export function isLateReservationEmailJobType(jobType: string) {
  return jobType === "late_reservation_status_changed";
}

function toLateReservationVariant(message: LateReservationQueueMessage): LateReservationEmailVariant {
  switch (message.payload.late_state) {
    case "late_reservation_consent_required":
      return "LATE_RESERVATION_CONSENT_REQUIRED";
    case "late_reservation_waiting_for_guest":
      return "LATE_RESERVATION_WAITING_FOR_GUEST";
    case "late_reservation_host_approved":
      return "LATE_RESERVATION_HOST_APPROVED";
    case "late_reservation_guest_continued":
      return "LATE_RESERVATION_GUEST_CONTINUED";
  }
}

function toLateReservationInput(message: LateReservationQueueMessage, siteUrl: string): LateReservationEmailInput {
  return {
    variant: toLateReservationVariant(message),
    reservationUrl: `${siteUrl}/reservation/${message.payload.reservation_id}`,
    listingTitle: message.payload.listing_title,
    listingTimeZone: message.payload.listing_time_zone || "UTC",
    startAt: message.payload.start_at,
    endAt: message.payload.end_at,
    paymentDeadline: message.payload.payment_deadline,
    reservationConfirmed: message.payload.reservation_confirmed ?? false,
    renterFirstName: message.payload.renter_first_name,
    renterLastName: message.payload.renter_last_name,
    hostFirstName: message.payload.host_first_name,
    hostLastName: message.payload.host_last_name,
  };
}

export async function buildLateReservationEmailJob(message: LateReservationQueueMessage, siteUrl: string) {
  const email = await renderLateReservationEmail(toLateReservationInput(message, siteUrl));

  return {
    to: message.recipient_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    tags: [
      { name: "job_type", value: message.job_type },
      { name: "recipient_role", value: message.recipient_role },
      { name: "late_state", value: message.payload.late_state },
    ],
  };
}
