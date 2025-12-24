export async function sendDiscordWebhook(embed: any, content?: string, components?: any[]) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    // 1. Prefer Bot API (Supports Buttons)
    if (botToken && channelId) {
        try {
            const body: any = { embeds: [embed] };
            if (content) body.content = content;
            if (components) body.components = components;

            const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bot ${botToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                console.error("❌ Failed to send Discord message via Bot:", await response.text());
            } else {
                console.log("✅ Discord message sent via Bot");
            }
            return;
        } catch (error) {
            console.error("❌ Error sending Discord message via Bot:", error);
            // Fallback to webhook not really possible if we don't know if the webhook is for the same channel, but usually we just log error.
        }
    }

    // 2. Fallback to Webhook (No buttons support usually)
    if (!webhookUrl) {
        console.error("❌ DISCORD_WEBHOOK_URL and (BOT_TOKEN+CHANNEL_ID) are not defined");
        return;
    }

    try {
        const body: any = { embeds: [embed] };
        if (content) body.content = content;
        // Components are typically ignored by standard webhooks, but we can try just in case.
        if (components) body.components = components;

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.error("❌ Failed to send Discord webhook:", await response.text());
        } else {
            console.log("✅ Discord webhook sent successfully");
        }
    } catch (error) {
        console.error("❌ Error sending Discord webhook:", error);
    }
}
