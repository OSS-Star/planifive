import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendDiscordWebhook } from "@/lib/discord";

const prisma = new PrismaClient();

export async function GET(req: Request) {
    try {
        // Security Check
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Find the most popular slot in the next 3 days that is NOT full (< 10)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const threeDaysLater = new Date(today);
        threeDaysLater.setDate(today.getDate() + 3);

        const slots = await prisma.availability.groupBy({
            by: ['date', 'hour'],
            where: {
                date: {
                    gte: today,
                    lt: threeDaysLater,
                },
            },
            _count: {
                userId: true,
            },
            orderBy: {
                _count: {
                    userId: 'desc',
                },
            },
            take: 1,
        });

        if (slots.length === 0) {
            return NextResponse.json({ message: "No active slots found" });
        }

        const popularSlot = slots[0];
        const count = popularSlot._count.userId;

        if (count >= 10) {
            return NextResponse.json({ message: "Most popular slot is already full" });
        }

        const missing = 10 - count;
        const dateStr = new Date(popularSlot.date).toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });

        // 2. Send Discord Reminder
        const embed = {
            title: "⚠️ IL MANQUE DES JOUEURS !",
            description: `Le créneau le plus chaud est celui du **${dateStr} à ${popularSlot.hour}h** !`,
            color: 0xEAB308, // Yellow
            fields: [
                { name: "👥 Inscrits", value: `${count}/10`, inline: true },
                { name: "🔥 Manquants", value: `${missing} joueurs`, inline: true },
                { name: "🔗 Rejoindre", value: "[Clique ici pour compléter le Five !](https://planifive.vercel.app/)" }
            ],
            footer: { text: "Planifive • Reminder" },
            timestamp: new Date().toISOString(),
        };

        await sendDiscordWebhook(embed);

        return NextResponse.json({ success: true, slot: popularSlot });
    } catch (error) {
        console.error("Error sending reminder:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
