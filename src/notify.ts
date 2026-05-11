interface NotifyOptions {
  title: string;
  message: string;
  priority?: "min" | "low" | "default" | "high" | "urgent";
  tags?: string[];
}

export async function sendPushNotification(opts: NotifyOptions): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  const server = (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");

  if (!topic) {
    console.log("[notify] NTFY_TOPIC not set — printing notification instead:");
    console.log(`\n--- ${opts.title} ---\n${opts.message}\n---`);
    return;
  }

  const headers: Record<string, string> = {
    Title: opts.title,
    Priority: opts.priority ?? "default",
    "Content-Type": "text/plain",
  };

  if (opts.tags?.length) {
    headers.Tags = opts.tags.join(",");
  }

  try {
    const res = await fetch(`${server}/${topic}`, {
      method: "POST",
      headers,
      body: opts.message,
    });

    if (!res.ok) {
      console.error(`[notify] ntfy returned HTTP ${res.status}: ${await res.text()}`);
    } else {
      console.log(`[notify] Sent to ${server}/${topic}`);
    }
  } catch (err) {
    console.error(`[notify] Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
