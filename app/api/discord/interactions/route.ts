import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nacl from "tweetnacl";

const prisma = new PrismaClient();
const PUB_KEY = process.env.DISCORD_PUBLIC_KEY;
const APP_ID = process.env.DISCORD_APP_ID;

// ---------------------------------------------------------
// LOGIC HELPERS
// ---------------------------------------------------------

async function getUpdatedEmbedData(callId: string) {
    const call = await prisma.call.findUnique({
        where: { id: callId },
        include: {
            creator: true,
            responses: { include: { user: true } }
        }
    });

    if (!call) return null;

    // 1. Implicit Participants
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

    // 2. Explicit
    const acceptedUserIds = new Set<string>();
    call.responses.forEach(r => {
        if (r.status === "ACCEPTED") acceptedUserIds.add(r.userId);
    });

    // Merge
    implicitUserIds.forEach(uid => {
        const hasResponse = call.responses.find(r => r.userId === uid);
        if (!hasResponse || hasResponse.status !== "DECLINED") {
            acceptedUserIds.add(uid);
        }
    });

    // 3. Names & Lists
    const participants = await prisma.user.findMany({
        where: { id: { in: Array.from(acceptedUserIds) } },
        select: { name: true, customName: true, id: true }
    });

    const names = participants.map(p => p.customName || p.name || "Joueur");
    const count = names.length;
    const missing = 10 - count;

    // Construct Embed
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

    // Participants List String for the ephemeral message or updating logic
    const participantListStr = count > 0
        ? participants.map(p => `- ${p.customName || p.name}`).join("\n")
        : "Personne pour le moment.";

    // Absents (Declined)
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


// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------

export async function POST(req: Request) {
    try {
        if (!PUB_KEY) return NextResponse.json({ error: "No PUB_KEY" }, { status: 500 });

        const signature = req.headers.get("X-Signature-Ed25519");
        const timestamp = req.headers.get("X-Signature-Timestamp");
        const bodyText = await req.text();

        if (!signature || !timestamp || !bodyText) return NextResponse.json({ error: "Bad Request" }, { status: 401 });

        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + bodyText),
            Buffer.from(signature, "hex"),
            Buffer.from(PUB_KEY, "hex")
        );

        if (!isVerified) return NextResponse.json({ error: "Invalid Sig" }, { status: 401 });

        const body = JSON.parse(bodyText);

        // PING
        if (body.type === 1) return NextResponse.json({ type: 1 });

        // BUTTONS
        if (body.type === 3) {
            const customId = body.data.custom_id;
            const discordUserId = body.member?.user?.id || body.user?.id;
            const [action, callId] = customId.split(":");

            if (!discordUserId || !callId) return NextResponse.json({ type: 4, data: { content: "Erreur params", flags: 64 } });

            // 1. Identify User
            const userAccount = await prisma.account.findFirst({
                where: { provider: 'discord', providerAccountId: discordUserId },
                include: { user: true }
            });

            if (!userAccount) {
                return NextResponse.json({ type: 4, data: { content: "🚫 Connecte-toi sur le site d'abord !", flags: 64 } });
            }
            const userId = userAccount.userId;

            // 2. Routing Actions

            // --- LIST PARTICIPANTS ---
            if (action === "list_participants") {
                const data = await getUpdatedEmbedData(callId);
                if (!data) return NextResponse.json({ type: 4, data: { content: "Appel introuvable", flags: 64 } });

                const msgPer = `**✅ Présents :**\n${data.participantListStr}`;
                const msgAbs = `**❌ Absents :**\n${data.absentListStr}`;

                return NextResponse.json({
                    type: 4,
                    data: {
                        content: `${msgPer}\n\n${msgAbs}`,
                        flags: 64 // Ephemeral
                    }
                });
            }

            // --- CANCEL CALL ---
            if (action === "cancel_call") {
                const call = await prisma.call.findUnique({ where: { id: callId } });
                if (!call || call.creatorId !== userId) {
                    return NextResponse.json({ type: 4, data: { content: "Seul le créateur peut annuler.", flags: 64 } });
                }

                // Parallel Delete
                const delCall = prisma.call.delete({ where: { id: callId } });
                const delAvail = syncAvailability(userId, callId, 'remove');

                await Promise.all([delCall, delAvail]);

                return NextResponse.json({
                    type: 7, // Update Message
                    data: {
                        embeds: [{
                            title: "❌ APPEL ANNULÉ",
                            description: `L'appel a été annulé par **${userAccount.user.name ?? "le créateur"}**.`,
                            color: 15548997 // Red
                        }],
                        components: []
                    }
                });
            }

            // --- PARTICIPATION ACTION (Accept/Decline) ---
            const status = action === "accept_call" ? "ACCEPTED" : "DECLINED";

            // 1. Update Response (Fast)
            await prisma.callResponse.upsert({
                where: { callId_userId: { callId, userId } },
                create: { callId, userId, status },
                update: { status }
            });

            // 2. Trigger Availability Sync
            const syncAction = status === "ACCEPTED" ? 'add' : 'remove';

            // FIRE-AND-FORGET: Do not await calling this to avoid 3s timeout.
            // Vercel might kill this, but it's the only way to stay within 3s without Edge functions.
            syncAvailability(userId, callId, syncAction).catch(e => console.error("Background sync error:", e));

            // 3. Generate Embed
            const data = await getUpdatedEmbedData(callId);

            if (!data) return NextResponse.json({ type: 4, data: { content: "Erreur maj", flags: 64 } });

            return NextResponse.json({
                type: 7,
                data: { embeds: [data.embed] }
            });
        }

        return NextResponse.json({ error: "Unknown" }, { status: 400 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal" }, { status: 500 });
    }
}
