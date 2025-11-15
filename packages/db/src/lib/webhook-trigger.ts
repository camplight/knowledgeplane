import { Webhook } from "../models/Webhook.js";
import crypto from "crypto";

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
}

export async function triggerWebhook(
  event: string,
  data: any,
): Promise<void> {
  const webhooks = await Webhook.findByEvent(event);

  if (webhooks.length === 0) {
    return;
  }

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  const payloadString = JSON.stringify(payload);

  // Trigger webhooks asynchronously (don't wait for responses)
  for (const webhook of webhooks) {
    triggerWebhookAsync(webhook.url, payloadString, webhook.secret).catch(
      (error) => {
        console.error(
          `Failed to trigger webhook ${webhook.id} for event ${event}:`,
          error,
        );
      },
    );
  }
}

async function triggerWebhookAsync(
  url: string,
  payload: string,
  secret?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "KnowledgePlane-Webhook/1.0",
  };

  // Add signature if secret is provided
  if (secret) {
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    headers["X-KnowledgePlane-Signature"] = `sha256=${signature}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok) {
      throw new Error(
        `Webhook returned status ${response.status}: ${response.statusText}`,
      );
    }
  } catch (error) {
    throw error;
  }
}

