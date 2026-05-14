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

export type ReviewReceivedRecipientRole = "booker" | "host";

export type ReviewReceivedEmailInput = {
  recipientRole: ReviewReceivedRecipientRole;
  profileUrl: string;
  listingTitle: string;
  rating: number;
  reviewerFirstName?: string | null;
  reviewerLastName?: string | null;
  revieweeFirstName?: string | null;
  revieweeLastName?: string | null;
};

export type ReviewReceivedEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type ReviewReceivedEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  listingTitle: string;
  rating: string;
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

function getFullName(firstName?: string | null, lastName?: string | null) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || "there";
}

function buildReviewReceivedViewModel(input: ReviewReceivedEmailInput): ReviewReceivedEmailViewModel {
  const greetingName = getFullName(input.revieweeFirstName, input.revieweeLastName);
  const reviewerName = getFullName(input.reviewerFirstName, input.reviewerLastName);
  const rating = `${Math.round(input.rating)}/5`;
  const subject = input.recipientRole === "host"
    ? "A guest left you a review"
    : "A host left you a review";
  const intro = input.recipientRole === "host"
    ? `${reviewerName} left a new review for ${input.listingTitle}.`
    : `${reviewerName} left a new review after your reservation for ${input.listingTitle}.`;

  return {
    subject,
    previewText: intro,
    greetingName,
    heading: subject,
    intro,
    listingTitle: input.listingTitle,
    rating,
    ctaLabel: "View your profile",
    ctaUrl: input.profileUrl,
    text:
      `Hello ${greetingName},\n\n` +
      `${intro}\n` +
      `Listing: ${input.listingTitle}\n` +
      `Rating: ${rating}\n\n` +
      `View your profile: ${input.profileUrl}\n`,
  };
}

function ReviewReceivedEmail(props: { email: ReviewReceivedEmailViewModel }) {
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

            <Text style={detailLabel}>Rating</Text>
            <Text style={detailValue}>{email.rating}</Text>

            <Button href={email.ctaUrl} style={button}>{email.ctaLabel}</Button>

            <Hr />

            <Text style={footer}>
              Reviews appear on the recipient profile and help build trust on AirDrums.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReviewReceivedEmail(
  input: ReviewReceivedEmailInput,
): Promise<ReviewReceivedEmailContent> {
  const email = buildReviewReceivedViewModel(input);
  const html = await render(<ReviewReceivedEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
