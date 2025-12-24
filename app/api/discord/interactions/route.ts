import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nacl from "tweetnacl";

const prisma = new PrismaClient();

// Your Discord Public Key from Vercel ENV
const PUB_KEY = process.env.DISCORD_PUBLIC_KEY;

export async function POST(req: Request) {
    try {
        if (!PUB_KEY) {
            console.error("Missing DISCORD_PUBLIC_KEY");
            return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
        }

        // 1. Verify Signature
        const signature = req.headers.get("X-Signature-Ed25519");
        const timestamp = req.headers.get("X-Signature-Timestamp");
        const bodyText = await req.text(); // Raw body is needed for verification

        if (!signature || !timestamp || !bodyText) {
            return NextResponse.json({ error: "Invalid Request" }, { status: 401 });
        }

        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + bodyText),
            Buffer.from(signature, "hex"),
            Buffer.from(PUB_KEY, "hex")
        );

        if (!isVerified) {
            return NextResponse.json({ error: "Invalid Signature" }, { status: 401 });
        }

        // 2. Parse Body
        const body = JSON.parse(bodyText);

        // 3. Handle PING (Type 1)
        if (body.type === 1) {
            return NextResponse.json({ type: 1 });
        }

        // 4. Handle Message Components (Buttons) (Type 3)
        if (body.type === 3) {
            const customId = body.data.custom_id;
            const discordUserId = body.member?.user?.id || body.user?.id;
            const discordUserName = body.member?.user?.global_name || body.member?.user?.username || "Joueur";

            if (!discordUserId) {
                return NextResponse.json({
                    type: 4,
                    data: {
                        content: "❌ Impossible de t'identifier (Discord ID manquant).",
                        flags: 64 // Ephemeral (Visible only to user)
                    }
                });
            }

            // Parse Action: accept_call:<callId> or decline_call:<callId>
            const [action, callId] = customId.split(":");

            if (!callId) {
                return NextResponse.json({ type: 4, data: { content: "❌ Erreur interne (Call ID invalide).", flags: 64 } });
            }

            // Find User in DB linked to this Discord ID
            const userAccount = await prisma.account.findFirst({
                where: {
                    provider: 'discord',
                    providerAccountId: discordUserId
                },
                include: { user: true }
            });

            if (!userAccount) {
                return NextResponse.json({
                    type: 4,
                    data: {
                        content: "🚫 Tu dois t'être déjà connecté au moins une fois sur le site PlaniFive pour participer !",
                        flags: 64
                    }
                });
            }

            const userId = userAccount.userId;

            // Handle Logic
            if (action === "accept_call") {
                await prisma.callResponse.upsert({
                    where: { callId_userId: { callId, userId } },
                    create: { callId, userId, status: "ACCEPTED" },
                    update: { status: "ACCEPTED" }
                });

                return NextResponse.json({
                    type: 4, // Update Response
                    data: {
                        content: `✅ **${discordUserName}** a confirmé sa présence ! (via Discord)`,
                        // We could potentially update the Embed here, but it's complex.
                        // A simple message is safer for now.
                    }
                });
            } else if (action === "decline_call") {
                await prisma.callResponse.upsert({
                    where: { callId_userId: { callId, userId } },
                    create: { callId, userId, status: "DECLINED" },
                    update: { status: "DECLINED" }
                });

                return NextResponse.json({
                    type: 4,
                    data: {
                        content: `❌ **${discordUserName}** ne sera pas là.`,
                    }
                });
            }
        }

        return NextResponse.json({ error: "Unknown Type" }, { status: 400 });

    } catch (error) {
        console.error("Interaction Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
