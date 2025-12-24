import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APP_ID = process.env.DISCORD_APP_ID || process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;

// Helper: Edit the original Discord message via Webhook
async function editDiscordMessage(token: string, data: any) {
    if (!APP_ID) {
        console.error("❌ CRITICAL: No APP_ID found in env!");
        return;
    }
    const url = `https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`;

    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    if (!res.ok) console.error("Failed to edit discord message", await res.text());
}

// Helper: Send Follow-up (for Ephemeral results)
async function sendFollowUp(token: string, data: any) {
    if (!APP_ID) {
        console.error("❌ CRITICAL: No APP_ID found in env!");
        return;
    }
    const url = `https://discord.com/api/v10/webhooks/${APP_ID}/${token}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    if (!res.ok) console.error("Failed to send follow up", await res.text());
}

async function getUpdatedEmbedData(callId: string) {
    const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
            creator: true,
            responses: { include: { user: true } }
        }
    });

    if (!call) return null;

    const slotsCount = call.duration === 90 ? 5 : 4;
    const slots = Array.from({ length: slotsCount }, (_, i) => call.hour + i);

    const availabilities = await prisma.availability.findMany({
        where: { date: call.date, hour: { in: slots } },
        select: { userId: true, hour: true }
    });

    const userMap: Record<string, number> = {};
    availabilities.forEach(a => {
        userMap[a.userId] = (userMap[a.userId] || 0) + 1;
    });
    const implicitUserIds = Object.keys(userMap).filter(uid => userMap[uid] === slotsCount);

    const acceptedUserIds = new Set<string>();
    call.responses.forEach(r => {
        if (r.status === "ACCEPTED") acceptedUserIds.add(r.userId);
    });

    implicitUserIds.forEach(uid => {
        const hasResponse = call.responses.find(r => r.userId === uid);
        if (!hasResponse || hasResponse.status !== "DECLINED") {
            acceptedUserIds.add(uid);
        }
    });

    const participants = await prisma.user.findMany({
        where: { id: { in: Array.from(acceptedUserIds) } },
        select: { name: true, customName: true, id: true }
    });

    const names = participants.map(p => p.customName || p.name || "Joueur");
    const count = names.length;
    const missing = 10 - count;

    const dateObj = new Date(call.date);
    const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });
    const durationStr = call.duration === 90 ? "1h30" : "1h00";

    const embed = {
        title: "📢 NOUVEL APPEL FIVE !",
        description: `**${call.creator.name || "Un joueur"}** lance un appel pour un Five !\n\n📅 **${dateStr}**\n⏰ **${call.hour}h00**\n⏱️ **Durée : ${durationStr}**\n📍 **${call.location}**` +
            (call.price ? `\n💰 **Prix : ${call.price}**` : "") +
            (call.comment ? `\n📝 **Note : ${call.comment}**` : "") +
            `\n\n👉 Connectez-vous pour rejoindre !`,
        color: 5763719,
        url: "https://planifive.vercel.app/",
        fields: [
            { name: "Créneau réservé", value: `${call.hour}h - ${(call.hour + slotsCount) % 24 === 0 ? "00" : (call.hour + slotsCount) % 24}h`, inline: true },
            { name: `👥 Participants (${count}/10)`, value: count > 0 ? names.join(", ") : "Aucun inscrit", inline: false },
            { name: "🔥 Places restantes", value: `${missing > 0 ? missing : 0} places`, inline: true }
        ],
        thumbnail: { url: call.creator.image || "" },
        footer: { text: "Planifive • Let's play!" },
        timestamp: new Date().toISOString(),
    };

    const participantListStr = count > 0
        ? participants.map(p => `- ${p.customName || p.name}`).join("\n")
        : "Personne pour le moment.";

    const declinedResponses = call.responses.filter(r => r.status === "DECLINED");
    const absentIds = declinedResponses.map(r => r.userId);
    let absentListStr = "Personne.";

    if (absentIds.length > 0) {
        const absents = await prisma.user.findMany({
            where: { id: { in: absentIds } },
            select: { name: true, customName: true }
        });
        if (absents.length > 0) {
            absentListStr = absents.map(p => `- ${p.customName || p.name}`).join("\n");
        }
    }

    return { embed, participantListStr, absentListStr };
}

async function syncAvailability(userId: string, callId: string, action: 'add' | 'remove') {
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) return;

    const slotsCount = call.duration === 90 ? 5 : 4;
    const slots = Array.from({ length: slotsCount }, (_, i) => call.hour + i);

    if (action === 'remove') {
        await prisma.availability.deleteMany({
            where: { userId, date: call.date, hour: { in: slots } }
        });
    } else {
        const upserts = slots.map(h => {
            if (h > 23) return null;
            return prisma.availability.upsert({
                where: { userId_date_hour: { userId, date: call.date, hour: h } },
                create: { userId, date: call.date, hour: h },
                update: {}
            });
        });
        await Promise.all(upserts.filter(p => p !== null));
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, callId, userId, token, userAccountName } = body;

        if (!action || !callId || !userId || !token) {
            console.error("Worker: Missing params", body);
            return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }

        // Fetch Call Data for validation
        const call = await prisma.call.findUnique({
            where: { id: callId },
            include: { responses: true }
        });

        if (!call) {
            return NextResponse.json({ error: "Call not found" });
        }
        const isCreator = call.creatorId === userId;


        // --- LIST PARTICIPANTS ---
        if (action === "list_participants") {
            const data = await getUpdatedEmbedData(callId);
            if (data) {
                const msgPer = `**✅ Présents :**\n${data.participantListStr}`;
                const msgAbs = `**❌ Absents :**\n${data.absentListStr}`;

                await sendFollowUp(token, {
                    content: `${msgPer}\n\n${msgAbs}`,
                    flags: 64 // Ephemeral
                });
            }
            return NextResponse.json({ success: true });
        }


        // --- CANCEL CALL ---
        if (action === "cancel_call") {
            if (isCreator) {
                await prisma.call.delete({ where: { id: callId } });
                await syncAvailability(userId, callId, 'remove');

                await editDiscordMessage(token, {
                    embeds: [{
                        title: "❌ APPEL ANNULÉ",
                        description: `L'appel a été annulé par **${userAccountName ?? "le créateur"}**.`,
                        color: 15548997
                    }],
                    components: []
                });
            } else {
                await sendFollowUp(token, { content: "❌ Seul le créateur peut annuler l'appel.", flags: 64 });
            }
            return NextResponse.json({ success: true });
        }


        // --- ACCEPT CALL ---
        if (action === 'accept_call') {
            if (isCreator) {
                return await sendFollowUp(token, { content: "🚫 Inutile, tu es le créateur (donc présent d'office).", flags: 64 });
            }

            const existing = call.responses.find(r => r.userId === userId);

            // 1. Check Explicit Acceptance
            if (existing?.status === 'ACCEPTED') {
                return await sendFollowUp(token, { content: "✅ Tu as déjà accepté cet appel.", flags: 64 });
            }

            // 2. Check Implicit Presence (only if not declined)
            if (existing?.status !== 'DECLINED') {
                const slotsCount = call.duration === 90 ? 5 : 4;
                const slots = Array.from({ length: slotsCount }, (_, i) => call.hour + i);
                const availCount = await prisma.availability.count({
                    where: { userId, date: call.date, hour: { in: slots } }
                });
                if (availCount === slotsCount) {
                    return await sendFollowUp(token, { content: "✅ Tu es déjà noté présent(e) grâce à tes disponibilités sur le site !", flags: 64 });
                }
            }

            // Proceed to accept (refill hours)
            await prisma.callResponse.upsert({
                where: { callId_userId: { callId, userId } },
                create: { callId, userId, status: 'ACCEPTED' },
                update: { status: 'ACCEPTED' }
            });
            await syncAvailability(userId, callId, 'add');
        }


        // --- DECLINE CALL ---
        if (action === 'decline_call') {
            if (isCreator) {
                return await sendFollowUp(token, { content: "🚫 Tu ne peux pas te retirer de ton propre appel. Annule-le si besoin.", flags: 64 });
            }

            const existing = call.responses.find(r => r.userId === userId);
            if (existing?.status === 'DECLINED') {
                return await sendFollowUp(token, { content: "❌ Tu as déjà refusé cet appel.", flags: 64 });
            }

            // Proceed to decline
            await prisma.callResponse.upsert({
                where: { callId_userId: { callId, userId } },
                create: { callId, userId, status: 'DECLINED' },
                update: { status: 'DECLINED' }
            });
            await syncAvailability(userId, callId, 'remove');
        }


        // Update Embed after change
        const data = await getUpdatedEmbedData(callId);
        if (data) {
            await editDiscordMessage(token, {
                embeds: [data.embed]
            });
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error("Worker Error:", e);
        return NextResponse.json({ error: "Worker Error" }, { status: 500 });
    }
}
