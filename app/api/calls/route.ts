import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sendDiscordWebhook } from "@/lib/discord";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { date, hour, location, duration = 60 } = await req.json();

    if (!date || hour === undefined || !location) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    try {
        // Logic: 1h -> 4 slots (h, h+1, h+2, h+3) | 1h30 -> 5 slots (h, h+1, h+2, h+3, h+4)
        const slotsCount = duration === 90 ? 5 : 4;
        const slots = Array.from({ length: slotsCount }, (_, i) => parseInt(hour) + i);

        // 1. Create Call in DB
        const call = await prisma.call.create({
            data: {
                creatorId: user.id,
                date: new Date(date),
                hour: parseInt(hour),
                location,
                duration: parseInt(duration),
            },
        });

        // 2. Auto-register creator for the duration + buffer
        for (const h of slots) {
            if (h <= 23) {
                const existing = await prisma.availability.findFirst({
                    where: {
                        userId: user.id,
                        date: new Date(date),
                        hour: h,
                    },
                });

                if (!existing) {
                    await prisma.availability.create({
                        data: {
                            userId: user.id,
                            date: new Date(date),
                            hour: h,
                        },
                    });
                }
            }
        }

        // 3. Send Discord Notification
        const dateObj = new Date(date);
        const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });
        const durationStr = duration === 90 ? "1h30" : "1h00";

        const embed = {
            title: "📢 NOUVEL APPEL FIVE !",
            description: `**${user.name || "Un joueur"}** lance un appel pour un Five !\n\n📅 **${dateStr}**\n⏰ **${hour}h00**\n⏱️ **Durée : ${durationStr}**\n📍 **${location}**\n\n👉 Connectez-vous pour rejoindre !`,
            color: 5763719, // #57F287 (Green)
            url: "https://planifive.vercel.app/",
            fields: [
                {
                    name: "Créneau réservé",
                    value: `${hour}h - ${(parseInt(hour) + slotsCount) % 24 === 0 ? "00" : (parseInt(hour) + slotsCount) % 24}h`,
                    inline: true
                }
            ],
            thumbnail: { url: user.image || "" },
            footer: { text: "Planifive • Let's play!" },
            timestamp: new Date().toISOString(),
        };

        await sendDiscordWebhook(embed, "@everyone 📢 NOUVEL APPEL !");

        return NextResponse.json({ success: true, call });
    } catch (error) {
        console.error("Error creating call:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        // Fetch calls for the next 7 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const calls = await prisma.call.findMany({
            where: {
                date: {
                    gte: today,
                },
            },
            include: {
                creator: {
                    select: { name: true, image: true },
                },
                responses: {
                    include: {
                        user: {
                            select: { id: true, name: true, image: true }
                        }
                    }
                }
            },
            orderBy: { date: 'asc' },
        });

        return NextResponse.json(calls);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch calls" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ADMIN_EMAILS = ["sheizeracc@gmail.com"];
    const userEmail = session.user.email.toLowerCase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    try {
        // 1. Fetch the call to check ownership and get details for notification
        const call = await prisma.call.findUnique({
            where: { id },
            include: { creator: true }
        });

        if (!call) {
            return NextResponse.json({ error: "Call not found" }, { status: 404 });
        }

        // 2. Check permissions: Admin OR Creator
        const isCreator = call.creator.email?.toLowerCase() === userEmail;
        const isAdmin = ADMIN_EMAILS.includes(userEmail);

        if (!isCreator && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 3. Delete the call
        await prisma.call.delete({
            where: { id },
        });

        // 4. Send Discord Notification
        const dateObj = new Date(call.date);
        const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });

        const embed = {
            title: "❌ APPEL ANNULÉ",
            description: `**${call.creator.name || "Un joueur"}** a annulé son appel.\n\n📅 **${dateStr}**\n⏰ **${call.hour}h00**\n📍 **${call.location}**`,
            color: 15548997, // Red
            footer: { text: "Planifive" },
            timestamp: new Date().toISOString(),
        };

        await sendDiscordWebhook(embed, "❌ UN APPEL A ÉTÉ ANNULÉ !");

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting call:", error);
        return NextResponse.json({ error: "Failed to delete call" }, { status: 500 });
    }
}
