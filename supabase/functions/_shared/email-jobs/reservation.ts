import {
  renderReservationEmail,
  type ReservationEmailInput,
  type ReservationEmailVariant,
} from "../emails/reservation-request-email.tsx";

export type RecipientRole = "booker" | "host";
export type ReservationStatusTransition =
  | "PENDING-CONFIRMED"
  | "PENDING-CANCELLED"
  | "CONFIRMED-CANCELLED";

export type ReservationQueuePayload = {
  reservation_id: string;
  listing_title: string;
  listing_time_zone: string;
  start_at: string;
  end_at: string;
  guests: number;
  total_price: number;
  payment_deadline?: string | null;
  renter_first_name?: string | null;
  renter_last_name?: string | null;
  host_first_name?: string | null;
  host_last_name?: string | null;
  status_transition?: ReservationStatusTransition | null;
};

export type ReservationQueueMessage = {
  dedupe_key: string;
  job_type: string;
  recipient_role: RecipientRole;
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: ReservationQueuePayload;
};

export function isReservationEmailJobType(jobType: string) {
  return jobType === "reservation_created" || jobType === "reservation_status_changed";
}

function toReservationVariant(message: ReservationQueueMessage): ReservationEmailVariant {
  if (message.job_type === "reservation_created") {
    return message.recipient_role === "host" ? "NEW_RESERVATION_HOST" : "NEW_RESERVATION_BOOKER";
  }

  const transition = message.payload.status_transition;

  if (message.job_type === "reservation_status_changed" && transition === "PENDING-CONFIRMED") {
    return "STATUS_CONFIRMED";
  }

  if (message.job_type === "reservation_status_changed" && transition === "PENDING-CANCELLED") {
    return "STATUS_CANCELLED_PENDING";
  }

  if (message.job_type === "reservation_status_changed" && transition === "CONFIRMED-CANCELLED") {
    return "STATUS_CANCELLED_CONFIRMED";
  }

  throw new Error(`Unsupported reservation email job: ${message.job_type}`);
}

function toReservationInput(message: ReservationQueueMessage, siteUrl: string): ReservationEmailInput {
  return {
    variant: toReservationVariant(message),
    reservationUrl: `${siteUrl}/reservation/${message.payload.reservation_id}`,
    listingTitle: message.payload.listing_title,
    listingTimeZone: message.payload.listing_time_zone || "UTC",
    startAt: message.payload.start_at,
    endAt: message.payload.end_at,
    guests: message.payload.guests,
    totalPrice: message.payload.total_price,
    paymentDeadline: message.payload.payment_deadline,
    renterFirstName: message.payload.renter_first_name,
    renterLastName: message.payload.renter_last_name,
    hostFirstName: message.payload.host_first_name,
    hostLastName: message.payload.host_last_name,
  };
}

export async function buildReservationEmailJob(message: ReservationQueueMessage, siteUrl: string) {
  const email = await renderReservationEmail(toReservationInput(message, siteUrl));

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
