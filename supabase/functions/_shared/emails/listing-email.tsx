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

export type ListingEmailVariant =
  | "NEW_LISTING_CREATED"
  | "LISTING_APPROVED"
  | "LISTING_REFUSED";

export type ListingEmailInput = {
  variant: ListingEmailVariant;
  listingUrl: string;
  listingTitle: string;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  moderationMessage?: string | null;
};

export type ListingEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type ListingEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  listingTitle: string;
  moderationMessage?: string | null;
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

function buildListingEmailViewModel(input: ListingEmailInput): ListingEmailViewModel {
  const greetingName = getFullName(input.ownerFirstName, input.ownerLastName);

  switch (input.variant) {
    case "NEW_LISTING_CREATED": {
      const subject = "Your listing was submitted";
      const intro = `${input.listingTitle} was created and is now waiting for review.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        moderationMessage: null,
        ctaLabel: "Review listing",
        ctaUrl: input.listingUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Listing: ${input.listingTitle}\n\n` +
          `Open listing: ${input.listingUrl}\n`,
      };
    }
    case "LISTING_APPROVED": {
      const subject = "Your listing is approved";
      const intro = `${input.listingTitle} has been approved and can now accept reservations.`;
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        moderationMessage: input.moderationMessage,
        ctaLabel: "Open listing",
        ctaUrl: input.listingUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Listing: ${input.listingTitle}\n\n` +
          `Open listing: ${input.listingUrl}\n`,
      };
    }
    case "LISTING_REFUSED": {
      const subject = "Your listing was not approved";
      const intro = `${input.listingTitle} needs changes before it can go live.`;
      const message = input.moderationMessage?.trim() || "Please review the moderator feedback and update your listing.";
      return {
        subject,
        previewText: intro,
        greetingName,
        heading: subject,
        intro,
        listingTitle: input.listingTitle,
        moderationMessage: message,
        ctaLabel: "Edit listing",
        ctaUrl: input.listingUrl,
        text:
          `Hello ${greetingName},\n\n` +
          `${intro}\n` +
          `Listing: ${input.listingTitle}\n` +
          `Feedback: ${message}\n\n` +
          `Edit listing: ${input.listingUrl}\n`,
      };
    }
  }
}

function ListingEmail(props: { email: ListingEmailViewModel }) {
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

            {email.moderationMessage ? (
              <>
                <Text style={detailLabel}>Feedback</Text>
                <Text style={detailValue}>{email.moderationMessage}</Text>
              </>
            ) : null}

            <Button href={email.ctaUrl} style={button}>{email.ctaLabel}</Button>

            <Hr />

            <Text style={footer}>
              Open your host tools to review the current moderation state of this listing.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderListingEmail(input: ListingEmailInput): Promise<ListingEmailContent> {
  const email = buildListingEmailViewModel(input);
  const html = await render(<ListingEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
