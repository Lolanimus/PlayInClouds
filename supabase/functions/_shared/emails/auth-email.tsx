import * as React from "npm:react";
import {
  Body,
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

export type AuthEmailVariant =
  | "signup"
  | "magiclink"
  | "recovery"
  | "invite"
  | "reauthentication"
  | "email_change_current"
  | "email_change_new";

export type RenderAuthEmailInput = {
  variant: AuthEmailVariant;
  actionUrl: string;
  otp: string;
  recipientEmail: string;
  firstName?: string | null;
  newEmail?: string | null;
};

export type RenderAuthEmailResult = {
  subject: string;
  previewText: string;
  text: string;
  html: string;
};

type AuthEmailViewModel = {
  subject: string;
  previewText: string;
  greetingName: string;
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  otpLabel: string;
  otp: string;
  expiryText: string;
  supportText: string;
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

const codeLabel = {
  color: "#7a756d",
  fontSize: "12px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  margin: "0 0 6px",
  textTransform: "uppercase" as const,
};

const codeValue = {
  backgroundColor: "#f6f5f2",
  borderRadius: "12px",
  color: "#111111",
  display: "inline-block",
  fontFamily: "Menlo, Monaco, monospace",
  fontSize: "24px",
  fontWeight: "700",
  letterSpacing: "0.2em",
  margin: "0 0 20px",
  padding: "14px 16px",
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

const buttonWrap = {
  margin: "22px 0",
};

const footer = {
  color: "#7a756d",
  fontSize: "13px",
  lineHeight: "1.5",
  margin: "0",
};

function getGreetingName(firstName?: string | null) {
  return firstName?.trim() || "there";
}

function getVariantContent(input: RenderAuthEmailInput) {
  switch (input.variant) {
    case "signup":
      return {
        subject: "Confirm your AirDrums account",
        previewText: "Confirm your email to finish creating your account.",
        heading: "Confirm your account",
        intro: "Use the button below to confirm your AirDrums account, or enter the code in the app.",
        ctaLabel: "Confirm email",
        otpLabel: "Confirmation code",
        supportText: "If you did not create this account, you can ignore this email.",
      };
    case "magiclink":
      return {
        subject: "Your AirDrums login link",
        previewText: "Use this link or code to sign in.",
        heading: "Sign in to AirDrums",
        intro: "Use the button below to sign in to your AirDrums account, or enter the code in the app.",
        ctaLabel: "Sign in",
        otpLabel: "Login code",
        supportText: "If you did not request this email, you can ignore it.",
      };
    case "recovery":
      return {
        subject: "Reset your AirDrums password",
        previewText: "Use this link or code to reset your password.",
        heading: "Reset your password",
        intro: "Use the button below to reset your AirDrums password, or enter the code in the app.",
        ctaLabel: "Reset password",
        otpLabel: "Reset code",
        supportText: "If you did not request a password reset, you can ignore this email.",
      };
    case "invite":
      return {
        subject: "You’ve been invited to AirDrums",
        previewText: "Accept your invitation and finish setting up your account.",
        heading: "Accept your invitation",
        intro: "Use the button below to accept your invitation, or enter the code in the app.",
        ctaLabel: "Accept invite",
        otpLabel: "Invitation code",
        supportText: "If you were not expecting this invite, contact the person who sent it.",
      };
    case "reauthentication":
      return {
        subject: "Confirm this security-sensitive action",
        previewText: "Use this code to continue the requested account change.",
        heading: "Confirm this action",
        intro: "Use the button below to continue the requested security-sensitive action, or enter the code in the app.",
        ctaLabel: "Continue",
        otpLabel: "Verification code",
        supportText: "If you did not request this action, change your password and review your account access.",
      };
    case "email_change_current":
      return {
        subject: "Approve your AirDrums email change",
        previewText: "Confirm that you want to move your account to a new email address.",
        heading: "Approve this email change",
        intro: input.newEmail
          ? `Confirm that you want to move your AirDrums account from ${input.recipientEmail} to ${input.newEmail}.`
          : "Confirm that you want to change the email address on your AirDrums account.",
        ctaLabel: "Approve change",
        otpLabel: "Approval code",
        supportText: "If you did not request this change, do not approve it.",
      };
    case "email_change_new":
      return {
        subject: "Confirm your new AirDrums email address",
        previewText: "Confirm the new email address for your account.",
        heading: "Confirm your new email",
        intro: input.newEmail
          ? `Confirm that ${input.newEmail} should be used for your AirDrums account.`
          : "Confirm the new email address for your AirDrums account.",
        ctaLabel: "Confirm new email",
        otpLabel: "Confirmation code",
        supportText: "If you did not request this change, you can ignore this email.",
      };
  }
}

function buildTextBody(email: AuthEmailViewModel) {
  return [
    `Hello ${email.greetingName},`,
    "",
    email.intro,
    "",
    `${email.ctaLabel}: ${email.ctaUrl}`,
    `${email.otpLabel}: ${email.otp}`,
    email.expiryText,
    "",
    email.supportText,
  ].join("\n");
}

function buildViewModel(input: RenderAuthEmailInput): AuthEmailViewModel {
  const content = getVariantContent(input);
  const greetingName = getGreetingName(input.firstName);

  const viewModel: AuthEmailViewModel = {
    subject: content.subject,
    previewText: content.previewText,
    greetingName,
    heading: content.heading,
    intro: content.intro,
    ctaLabel: content.ctaLabel,
    ctaUrl: input.actionUrl,
    otpLabel: content.otpLabel,
    otp: input.otp,
    expiryText: "This code expires in 10 minutes.",
    supportText: content.supportText,
    text: "",
  };

  viewModel.text = buildTextBody(viewModel);
  return viewModel;
}

function AuthEmail(props: { email: AuthEmailViewModel }) {
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

            <Section style={buttonWrap}>
              <a href={email.ctaUrl} style={button}>
                {email.ctaLabel}
              </a>
            </Section>

            <Hr />

            <Text style={codeLabel}>{email.otpLabel}</Text>
            <Text style={codeValue}>{email.otp}</Text>
            <Text style={text}>{email.expiryText}</Text>

            <Hr />

            <Text style={footer}>{email.supportText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderAuthEmail(input: RenderAuthEmailInput): Promise<RenderAuthEmailResult> {
  const email = buildViewModel(input);
  const html = await render(<AuthEmail email={email} />);

  return {
    subject: email.subject,
    previewText: email.previewText,
    text: email.text,
    html,
  };
}
