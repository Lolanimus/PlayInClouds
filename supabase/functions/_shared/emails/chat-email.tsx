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

export type ChatEmailInput = {
  messagesUrl: string;
  conversationCount: number;
  conversations: Array<{
    chatId: string;
    listingId?: string | null;
    listingTitle?: string | null;
    otherUserId: string;
    otherUserName: string;
    firstMessageAt?: string | null;
    firstMessagePreview?: string | null;
  }>;
};

export type ChatEmailContent = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type ChatEmailViewModel = {
  subject: string;
  previewText: string;
  heading: string;
  intro: string;
  conversationCount: number;
  conversations: Array<{
    label: string;
    preview: string;
  }>;
  moreConversationCount: number;
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

const conversationLabel = {
  color: "#161616",
  fontSize: "15px",
  fontWeight: "700",
  lineHeight: "1.5",
  margin: "0 0 4px",
};

const conversationMeta = {
  color: "#5b5b5b",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 14px",
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

function buildChatEmailViewModel(input: ChatEmailInput): ChatEmailViewModel {
  const subject = input.conversationCount === 1
    ? "You have a new message"
    : "You have new messages";
  const intro = input.conversationCount === 1
    ? "You have a new unread conversation on AirDrums."
    : `You have unread messages in ${input.conversationCount} conversations on AirDrums.`;
  const conversations = input.conversations.slice(0, 3).map((conversation) => ({
    label: conversation.listingTitle
      ? `${conversation.otherUserName} - ${conversation.listingTitle}`
      : conversation.otherUserName,
    preview: conversation.firstMessagePreview?.trim() || "Open the conversation to read the message.",
  }));
  const moreConversationCount = Math.max(input.conversationCount - conversations.length, 0);

  return {
    subject,
    previewText: intro,
    heading: subject,
    intro,
    conversationCount: input.conversationCount,
    conversations,
    moreConversationCount,
    ctaLabel: "Open messages",
    ctaUrl: input.messagesUrl,
    text:
      `${intro}\n\n` +
      conversations.map((conversation) =>
        `${conversation.label}\n"${conversation.preview}"`
      ).join("\n\n") +
      (moreConversationCount > 0
        ? `\n\n+ ${moreConversationCount} more ${moreConversationCount === 1 ? "conversation" : "conversations"}`
        : "") +
      `\n\n` +
      `Open messages: ${input.messagesUrl}\n`,
  };
}

function ChatEmail(props: { email: ChatEmailViewModel }) {
  const { email } = props;

  return (
    <Html>
      <Head />
      <Preview>{email.previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>{email.heading}</Heading>
            <Text style={text}>{email.intro}</Text>

            <Text style={detailLabel}>Unread conversations</Text>
            <Text style={detailValue}>{email.conversationCount}</Text>

            {email.conversations.length > 0 ? (
              <>
                <Text style={detailLabel}>Conversations</Text>
                {email.conversations.map((conversation) => (
                  <React.Fragment key={conversation.label}>
                    <Text style={conversationLabel}>{conversation.label}</Text>
                    <Text style={conversationMeta}>
                      "{conversation.preview}"
                    </Text>
                  </React.Fragment>
                ))}
                {email.moreConversationCount > 0 ? (
                  <Text style={conversationMeta}>
                    + {email.moreConversationCount} more {email.moreConversationCount === 1 ? "conversation" : "conversations"}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Button href={email.ctaUrl} style={button}>{email.ctaLabel}</Button>

            <Hr />

            <Text style={footer}>
              Chat emails are limited to at most one every 30 minutes while new unread messages keep arriving.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderChatEmail(input: ChatEmailInput): Promise<ChatEmailContent> {
  const email = buildChatEmailViewModel(input);
  const html = await render(<ChatEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
