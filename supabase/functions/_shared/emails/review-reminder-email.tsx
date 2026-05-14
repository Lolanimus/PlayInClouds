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

export type ReviewReminderRecipientRole = "booker" | "host";

export type ReviewReminderEmailInput = {
  recipientRole: ReviewReminderRecipientRole;
  reservationUrl: string;
  listingTitle: string;
  listingTimeZone: string;
  startAt: string;
  endAt: string;
  expiresAt: string;
  renterFirstName?: string | null;
  renterLastName?: string | null;
  hostFirstName?: string | null;
  hostLastName?: string | null;
};

export type ReviewReminderEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type ReviewReminderEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  listingTitle: string;
  endAt: string;
  expiresAt: string;
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

function buildReviewReminderViewModel(input: ReviewReminderEmailInput): ReviewReminderEmailViewModel {
  const greetingName = input.recipientRole === "host"
    ? getFullName(input.hostFirstName, input.hostLastName)
    : getFullName(input.renterFirstName, input.renterLastName);
  const revieweeName = input.recipientRole === "host"
    ? getFullName(input.renterFirstName, input.renterLastName)
    : getFullName(input.hostFirstName, input.hostLastName);
  const formattedEndAt = formatDateTime(input.endAt, input.listingTimeZone);
  const formattedExpiresAt = formatDateTime(input.expiresAt, input.listingTimeZone);
  const subject = input.recipientRole === "host"
    ? "Leave a review for your guest"
    : "Leave a review for your host";
  const intro = input.recipientRole === "host"
    ? `Your session for ${input.listingTitle} has ended. Share feedback for ${revieweeName}.`
    : `Your reservation for ${input.listingTitle} has ended. Share feedback for ${revieweeName}.`;
  const textBody =
    `Hello ${greetingName},\n\n` +
    `${intro}\n` +
    `Reservation ended: ${formattedEndAt}\n` +
    `Review deadline: ${formattedExpiresAt}\n\n` +
    `Leave your review: ${input.reservationUrl}\n`;

  return {
    subject,
    previewText: intro,
    greetingName,
    heading: subject,
    intro,
    listingTitle: input.listingTitle,
    endAt: formattedEndAt,
    expiresAt: formattedExpiresAt,
    ctaLabel: "Leave a review",
    ctaUrl: input.reservationUrl,
    text: textBody,
  };
}

function ReviewReminderEmail(props: { email: ReviewReminderEmailViewModel }) {
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

            <Text style={detailLabel}>Reservation ended</Text>
            <Text style={detailValue}>{email.endAt}</Text>

            <Text style={detailLabel}>Review deadline</Text>
            <Text style={detailValue}>{email.expiresAt}</Text>

            <Button href={email.ctaUrl} style={button}>{email.ctaLabel}</Button>

            <Hr />

            <Text style={footer}>
              You can leave one review within 14 days after the reservation ends.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReviewReminderEmail(input: ReviewReminderEmailInput): Promise<ReviewReminderEmailContent> {
  const email = buildReviewReminderViewModel(input);
  const html = await render(<ReviewReminderEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
