import * as React from "npm:react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "npm:@react-email/components";

export type ReservationEmailVariant =
  | "NEW_RESERVATION_BOOKER"
  | "NEW_RESERVATION_HOST"
  | "STATUS_CONFIRMED"
  | "STATUS_CANCELLED_PENDING"
  | "STATUS_CANCELLED_CONFIRMED";

export type ReservationEmailInput = {
  variant: ReservationEmailVariant;
  reservationUrl: string;
  listingTitle: string;
  listingTimeZone: string;
  startAt: string;
  endAt: string;
  guests: number;
  totalPrice: number;
  paymentDeadline?: string | null;
  renterFirstName?: string | null;
  renterLastName?: string | null;
  hostFirstName?: string | null;
  hostLastName?: string | null;
};

export type ReservationEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type ReservationEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  listingTitle: string;
  startAt: string;
  endAt: string;
  guests: number;
  total: string;
  metaLabel: string;
  metaValue: string;
  ctaLabel: string;
  ctaUrl: string;
  text: string;
};

const main = {
  backgroundColor: "#f6f5f2",
  fontFamily: "Helvetica, Arial, sans-serif",
  margin: "0",
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e8e3da",
  borderRadius: "16px",
  margin: "0 auto",
  maxWidth: "560px",
  overflow: "hidden",
};

const section = {
  padding: "32px",
};

const heading = {
  color: "#111111",
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "1.25",
  margin: "0 0 16px",
};

const text = {
  color: "#3d3d3d",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 14px",
};

const detailLabel = {
  color: "#7a756d",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  margin: "0 0 6px",
  textTransform: "uppercase" as const,
};

const detailValue = {
  color: "#161616",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0 0 16px",
};

const button = {
  backgroundColor: "#111111",
  borderRadius: "999px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "700",
  padding: "12px 20px",
  textDecoration: "none",
};

const footer = {
  color: "#7a756d",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0",
};

function getReadableTimeZone(timeZone: string) {
  return timeZone.replaceAll("_", " ");
}

function formatDateTime(value: string, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(value));

  return `${formatted.replace(/,\s([^,]+)$/, " - $1")} (${getReadableTimeZone(timeZone)})`;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function getFullName(firstName?: string | null, lastName?: string | null) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || "there";
}

function buildReservationEmailViewModel(input: ReservationEmailInput): ReservationEmailViewModel {
  const greetingName = getFullName(input.renterFirstName, input.renterLastName);
  const hostName = getFullName(input.hostFirstName, input.hostLastName);
  const formattedStartAt = formatDateTime(input.startAt, input.listingTimeZone);
  const formattedEndAt = formatDateTime(input.endAt, input.listingTimeZone);
  const formattedTotal = formatMoney(input.totalPrice);
  const formattedDeadline = input.paymentDeadline
    ? formatDateTime(input.paymentDeadline, input.listingTimeZone)
    : "Unknown";

  const base = {
    greetingName,
    listingTitle: input.listingTitle,
    startAt: formattedStartAt,
    endAt: formattedEndAt,
    guests: input.guests,
    total: formattedTotal,
    ctaLabel: "View reservation",
    ctaUrl: input.reservationUrl,
  };

  switch (input.variant) {
    case "NEW_RESERVATION_BOOKER": {
      const intro = `Your reservation request for ${input.listingTitle} was submitted.`;
      const subject = "Your reservation request was submitted";
      const textBody =
        `Hello ${greetingName},\n\n` +
        `${intro}\n` +
        `Start: ${formattedStartAt}\n` +
        `End: ${formattedEndAt}\n` +
        `Guests: ${input.guests}\n` +
        `Total: ${formattedTotal}\n` +
        `Host response deadline: ${formattedDeadline}\n\n` +
        `View reservation: ${input.reservationUrl}\n`;

      return {
        ...base,
        subject,
        previewText: "Your PlayInClouds reservation request was submitted.",
        heading: subject,
        intro,
        metaLabel: "Host response deadline",
        metaValue: formattedDeadline,
        text: textBody,
      };
    }
    case "NEW_RESERVATION_HOST": {
      const intro = `${greetingName} just requested a reservation for ${input.listingTitle}.`;
      const subject = "New reservation request";
      const textBody =
        `Hello ${hostName},\n\n` +
        `${intro}\n` +
        `Start: ${formattedStartAt}\n` +
        `End: ${formattedEndAt}\n` +
        `Guests: ${input.guests}\n` +
        `Total: ${formattedTotal}\n` +
        `Respond by: ${formattedDeadline}\n\n` +
        `View reservation: ${input.reservationUrl}\n`;

      return {
        ...base,
        greetingName: hostName,
        subject,
        previewText: `${greetingName} requested a reservation for ${input.listingTitle}.`,
        heading: subject,
        intro,
        metaLabel: "Respond by",
        metaValue: formattedDeadline,
        text: textBody,
      };
    }
    case "STATUS_CONFIRMED": {
      const intro = `${hostName} confirmed your reservation for ${input.listingTitle}.`;
      const subject = "Your reservation was confirmed";
      const textBody =
        `Hello ${greetingName},\n\n` +
        `${intro}\n` +
        `Start: ${formattedStartAt}\n` +
        `End: ${formattedEndAt}\n` +
        `Guests: ${input.guests}\n` +
        `Total: ${formattedTotal}\n` +
        `Reservation status: CONFIRMED\n\n` +
        `View reservation: ${input.reservationUrl}\n`;

      return {
        ...base,
        subject,
        previewText: `${input.listingTitle} was confirmed.`,
        heading: subject,
        intro,
        metaLabel: "Reservation status",
        metaValue: "CONFIRMED",
        text: textBody,
      };
    }
    case "STATUS_CANCELLED_PENDING": {
      const intro = `Your reservation request for ${input.listingTitle} is no longer active.`;
      const subject = "Your reservation request was cancelled";
      const textBody =
        `Hello ${greetingName},\n\n` +
        `${intro}\n` +
        `Start: ${formattedStartAt}\n` +
        `End: ${formattedEndAt}\n` +
        `Guests: ${input.guests}\n` +
        `Total: ${formattedTotal}\n` +
        `Reservation status: CANCELLED\n\n` +
        `View reservation: ${input.reservationUrl}\n`;

      return {
        ...base,
        subject,
        previewText: `${input.listingTitle} was cancelled.`,
        heading: subject,
        intro,
        metaLabel: "Reservation status",
        metaValue: "CANCELLED",
        text: textBody,
      };
    }
    case "STATUS_CANCELLED_CONFIRMED": {
      const intro = `Your confirmed reservation for ${input.listingTitle} is no longer active.`;
      const subject = "Your reservation was cancelled";
      const textBody =
        `Hello ${greetingName},\n\n` +
        `${intro}\n` +
        `Start: ${formattedStartAt}\n` +
        `End: ${formattedEndAt}\n` +
        `Guests: ${input.guests}\n` +
        `Total: ${formattedTotal}\n` +
        `Reservation status: CANCELLED\n\n` +
        `View reservation: ${input.reservationUrl}\n`;

      return {
        ...base,
        subject,
        previewText: `${input.listingTitle} was cancelled.`,
        heading: subject,
        intro,
        metaLabel: "Reservation status",
        metaValue: "CANCELLED",
        text: textBody,
      };
    }
  }
}

export function ReservationRequestEmail({ input }: { input: ReservationEmailInput }) {
  const email = buildReservationEmailViewModel(input);

  return (
    <Html>
      <Head />
      <Preview>{email.previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>{email.heading}</Heading>
            <Text style={text}>Hello {email.greetingName},</Text>
            <Text style={text}>{email.intro}</Text>

            <Hr style={{ borderColor: "#ece7de", margin: "24px 0" }} />

            <Text style={detailLabel}>Listing</Text>
            <Text style={detailValue}>{email.listingTitle}</Text>

            <Text style={detailLabel}>Start</Text>
            <Text style={detailValue}>{email.startAt}</Text>

            <Text style={detailLabel}>End</Text>
            <Text style={detailValue}>{email.endAt}</Text>

            <Text style={detailLabel}>Guests</Text>
            <Text style={detailValue}>{email.guests}</Text>

            <Text style={detailLabel}>Total</Text>
            <Text style={detailValue}>{email.total}</Text>

            <Text style={detailLabel}>{email.metaLabel}</Text>
            <Text style={detailValue}>{email.metaValue}</Text>

            <Button href={email.ctaUrl} style={button}>
              {email.ctaLabel}
            </Button>
          </Section>

          <Section style={{ ...section, paddingTop: "0" }}>
            <Text style={footer}>
              PlayInClouds sent this email because of activity on your reservation.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReservationEmail(input: ReservationEmailInput): Promise<ReservationEmailContent> {
  const { render } = await import("npm:@react-email/render");
  const email = buildReservationEmailViewModel(input);
  const html = await render(<ReservationRequestEmail input={input} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
