import { processRpcRequest } from "~/app/api/supabase/helpers";
import type { EmailNotificationSettings } from "@/types/custom/api.types";

const getEmailNotificationSettings = async () => {
  return await processRpcRequest("get_email_notification_settings");
};

const updateEmailNotificationSettings = async (settings: EmailNotificationSettings) => {
  return await processRpcRequest("update_email_notification_settings", {
    p_email_account_activity_enabled: settings.email_account_activity_enabled,
    p_email_listing_activity_enabled: settings.email_listing_activity_enabled,
    p_email_reminders_enabled: settings.email_reminders_enabled,
    p_email_messages_enabled: settings.email_messages_enabled,
  });
};

export { getEmailNotificationSettings, updateEmailNotificationSettings };
export type { EmailNotificationSettings };
