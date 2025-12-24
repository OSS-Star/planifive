import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import nacl from "tweetnacl";

const prisma = new PrismaClient();
const PUB_KEY = process.env.DISCORD_PUBLIC_KEY;

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
            const token = body.token;
            const [action, callId] = customId.split(":");

            if (!discordUserId || !callId) return NextResponse.json({ type: 4, data: { content: "Erreur params", flags: 64 } });

            // 1. Identify User (Fast Check)
            const userAccount = await prisma.account.findFirst({
                where: { provider: 'discord', providerAccountId: discordUserId },
                include: { user: true }
            });

            if (!userAccount) {
                return NextResponse.json({ type: 4, data: { content: "🚫 Connecte-toi sur le site d'abord !", flags: 64 } });
            }

            // 2. Delegate to Worker (Fire and Forget)
            const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "localhost:3000";
            const protocol = domain.includes("localhost") ? "http" : "https";
            const baseUrl = `${protocol}://${domain}`;

            console.log(`[Interactions] Delegating to worker at ${baseUrl}/api/discord/worker`);

            // Fire worker without awaiting
            fetch(`${baseUrl}/api/discord/worker`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    callId,
                    userId: userAccount.userId,
                    token,
                    userAccountName: userAccount.user.name
                })
            }).catch(e => console.error(`Failed to spawn worker at ${baseUrl}`, e));

            // 3. Immediate Response (Deferred Update)
            return NextResponse.json({ type: 6 });
        }

        return NextResponse.json({ error: "Unknown Type" }, { status: 400 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal" }, { status: 500 });
    }
}
