import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        // Security Check
        const authHeader = req.headers.get('authorization');
        if (process.env.NODE_ENV !== 'development' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const users = await prisma.user.findMany({
            where: {
                isBanned: false,
                accounts: { some: { provider: 'discord' } }
            },
            include: {
                accounts: { where: { provider: 'discord' } }
            }
        } as any) as any;

        if (!process.env.DISCORD_BOT_TOKEN) {
            console.error("CRITICAL: DISCORD_BOT_TOKEN is missing from environment variables.");
            return NextResponse.json({ error: "DISCORD_BOT_TOKEN missing" }, { status: 500 });
        }

        let updatedCount = 0;

        for (const user of users) {
            const discordId = user.accounts[0]?.providerAccountId;
            if (!discordId) continue;

            try {
                const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
                    headers: {
                        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
                    }
                });

                if (res.ok) {
                    const discordUser = await res.json();
                    let imageUrl = user.image;

                    if (discordUser.avatar) {
                        const format = discordUser.avatar.startsWith("a_") ? "gif" : "png";
                        imageUrl = `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${format}`;
                    } else {
                        // Default Avatar logic
                        const discriminator = parseInt(discordUser.discriminator ?? "0");
                        if (discriminator === 0) {
                            const defaultId = Number(BigInt(discordId) >> BigInt(22)) % 6;
                            imageUrl = `https://cdn.discordapp.com/embed/avatars/${defaultId}.png`;
                        } else {
                            imageUrl = `https://cdn.discordapp.com/embed/avatars/${discriminator % 5}.png`;
                        }
                    }

                    // Only update if changed
                    if (imageUrl !== user.image) {
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { image: imageUrl }
                        });
                        updatedCount++;
                    }
                }
            } catch (err) {
                console.error(`Failed to sync user ${user.name}`, err);
            }
        }

        return NextResponse.json({ success: true, updated: updatedCount });

    } catch (error) {
        console.error("Error syncing avatars:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
