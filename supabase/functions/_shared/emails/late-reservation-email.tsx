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
import { render } from "npm:@react-email/render";

export type LateReservationEmailVariant =
  | "LATE_RESERVATION_CONSENT_REQUIRED"
  | "LATE_RESERVATION_WAITING_FOR_GUEST"
  | "LATE_RESERVATION_HOST_APPROVED"
  | "LATE_RESERVATION_GUEST_CONTINUED";

export type LateReservationEmailInput = {
  variant: LateReservationEmailVariant;
  reservationUrl: string;
  listingTitle: string;
  listingTimeZone: string;
  startAt: string;
  endAt: string;
  paymentDeadline: string;
  reservationConfirmed?: boolean;
  renterFirstName?: string | null;
  renterLastName?: string | null;
  hostFirstName?: string | null;
  hostLastName?: string | null;
};

export type LateReservationEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type LateReservationEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  listingTitle: string;
  startAt: string;
  endAt: string;
  paymentDeadline: string;
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

function getFullName(firstName?: string | null, lastName?: string | null) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || "there";
}

function buildLateReservationEmailViewModel(input: LateReservationEmailInput): LateReservationEmailViewModel {
  const isHostRecipient =
    input.variant === "LATE_RESERVATION_WAITING_FOR_GUEST" ||
    input.variant === "LATE_RESERVATION_GUEST_CONTINUED";
  const greetingName = isHostRecipient
    ? getFullName(input.hostFirstName, input.hostLastName)
    : getFullName(input.renterFirstName, input.renterLastName);
  const formattedStartAt = formatDateTime(input.startAt, input.listingTimeZone);
  const formattedEndAt = formatDateTime(input.endAt, input.listingTimeZone);
  const formattedDeadline = formatDateTime(input.paymentDeadline, input.listingTimeZone);

  switch (input.variant) {
    case "LATE_RESERVATION_CONSENT_REQUIRED": {
      const subject = "Your late reservation needs your approval";
      const intro = `Your reservation for ${input.listingTitle} entered the late-request window. Continue it before the deadline if you still want the booking.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        startAt: formattedStartAt,
        endAt: formattedEndAt,
        paymentDeadline: formattedDeadline,
        ctaLabel: "Review late request",
        ctaUrl: input.reservationUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Start: ${formattedStartAt}\n` +
          `End: ${formattedEndAt}\n` +
          `Act by: ${formattedDeadline}\n\n` +
          `Review reservation: ${input.reservationUrl}\n`,
      };
    }
    case "LATE_RESERVATION_WAITING_FOR_GUEST": {
      const subject = "Waiting for guest approval on a late request";
      const intro = `This reservation for ${input.listingTitle} is now waiting for the guest to continue the late request.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        startAt: formattedStartAt,
        endAt: formattedEndAt,
        paymentDeadline: formattedDeadline,
        ctaLabel: "View reservation",
        ctaUrl: input.reservationUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Start: ${formattedStartAt}\n` +
          `End: ${formattedEndAt}\n` +
          `Late-request deadline: ${formattedDeadline}\n\n` +
          `View reservation: ${input.reservationUrl}\n`,
      };
    }
    case "LATE_RESERVATION_HOST_APPROVED": {
      const subject = "Host approved your late request";
      const intro = `The host approved your late request for ${input.listingTitle}. Accept it before the deadline to finalize the reservation.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        startAt: formattedStartAt,
        endAt: formattedEndAt,
        paymentDeadline: formattedDeadline,
        ctaLabel: "Accept late request",
        ctaUrl: input.reservationUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Start: ${formattedStartAt}\n` +
          `End: ${formattedEndAt}\n` +
          `Accept by: ${formattedDeadline}\n\n` +
          `View reservation: ${input.reservationUrl}\n`,
      };
    }
    case "LATE_RESERVATION_GUEST_CONTINUED": {
      const reservationConfirmed = input.reservationConfirmed === true;
      const subject = reservationConfirmed
        ? "Guest accepted the late request"
        : "Guest continued the late request";
      const intro = reservationConfirmed
        ? `The guest accepted the late-request terms for ${input.listingTitle}. The reservation is now confirmed.`
        : `The guest accepted the late-request terms for ${input.listingTitle}. You can confirm the reservation before the deadline.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        startAt: formattedStartAt,
        endAt: formattedEndAt,
        paymentDeadline: formattedDeadline,
        ctaLabel: reservationConfirmed ? "View reservation" : "Confirm reservation",
        ctaUrl: input.reservationUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Start: ${formattedStartAt}\n` +
          `End: ${formattedEndAt}\n` +
          `${reservationConfirmed ? "Confirmed at" : "Confirm by"}: ${formattedDeadline}\n\n` +
          `View reservation: ${input.reservationUrl}\n`,
      };
    }
  }
}

function LateReservationEmail(props: { email: LateReservationEmailViewModel }) {
  const { email } = props;

  return (
    <Html>
      <Head />
      <Preview>{email.previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={text}>Hello {email.greetingName},</Text>
            <Heading style={heading}>{email.heading}</Heading>
            <Text style={text}>{email.intro}</Text>

            <Text style={detailLabel}>Listing</Text>
            <Text style={detailValue}>{email.listingTitle}</Text>

            <Text style={detailLabel}>Start</Text>
            <Text style={detailValue}>{email.startAt}</Text>

            <Text style={detailLabel}>End</Text>
            <Text style={detailValue}>{email.endAt}</Text>

            <Text style={detailLabel}>Action deadline</Text>
            <Text style={detailValue}>{email.paymentDeadline}</Text>

            <Button href={email.ctaUrl} style={button}>{email.ctaLabel}</Button>

            <Hr />

            <Text style={footer}>
              PlayInClouds sent this email because the reservation needs another late-request action.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderLateReservationEmail(input: LateReservationEmailInput): Promise<LateReservationEmailContent> {
  const email = buildLateReservationEmailViewModel(input);
  const html = await render(<LateReservationEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
