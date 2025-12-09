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

        // 1. Find the most popular 4H slot in the next 21 days
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const searchEnd = new Date(today);
        searchEnd.setDate(today.getDate() + 21);

        // Fetch all availabilities for the next 21 days
        const availabilities = await prisma.availability.findMany({
            where: {
                date: {
                    gte: today,
                    lt: searchEnd,
                },
            },
            select: {
                userId: true,
                date: true,
                hour: true,
            },
        });

        if (availabilities.length === 0) {
            return NextResponse.json({ message: "No active slots found" });
        }

        // Group by Date -> Hour -> Set(UserIds)
        const slotsByDate: Record<string, Record<number, Set<string>>> = {};

        availabilities.forEach((av) => {
            const dateKey = av.date.toISOString().split('T')[0]; // YYYY-MM-DD
            if (!slotsByDate[dateKey]) {
                slotsByDate[dateKey] = {};
            }
            if (!slotsByDate[dateKey][av.hour]) {
                slotsByDate[dateKey][av.hour] = new Set();
            }
            slotsByDate[dateKey][av.hour].add(av.userId);
        });

        let bestSlot = null;
        let maxCount = -1;

        // Iterate through each day and find 4-hour windows
        for (const [dateKey, hoursMap] of Object.entries(slotsByDate)) {
            // Check hours from 0 to 20 (since 20+3=23 is the last possible 4h block end)
            for (let h = 0; h <= 20; h++) {
                const u1 = hoursMap[h];
                const u2 = hoursMap[h + 1];
                const u3 = hoursMap[h + 2];
                const u4 = hoursMap[h + 3];

                // If any hour in the chain is missing, skip
                if (!u1 || !u2 || !u3 || !u4) continue;

                // Find intersection: Users present in ALL 4 hours
                const intersection = new Set(
                    [...u1].filter(x => u2.has(x) && u3.has(x) && u4.has(x))
                );

                const count = intersection.size;

                // We want the HIGHEST count.
                // If counts are equal, prefer the SOONER date/time (which naturally happens if we iterate chronologically, but object keys might be unordered. Let's strictly compare).

                const currentSlotDate = new Date(dateKey); // 00:00 of that day

                if (count > maxCount) {
                    maxCount = count;
                    bestSlot = {
                        dateStr: dateKey,
                        startHour: h,
                        count: count,
                        users: Array.from(intersection)
                    };
                } else if (count === maxCount && bestSlot) {
                    // Tie-breaker: Earlier time is better
                    const bestSlotDate = new Date(bestSlot.dateStr);
                    if (currentSlotDate < bestSlotDate || (currentSlotDate.getTime() === bestSlotDate.getTime() && h < bestSlot.startHour)) {
                        bestSlot = {
                            dateStr: dateKey,
                            startHour: h,
                            count: count,
                            users: Array.from(intersection)
                        };
                    }
                }
            }
        }

        if (!bestSlot || bestSlot.count === 0) {
            return NextResponse.json({ message: "No 4-hour slots found with common users" });
        }

        // If the best slot is already full (>= 10), we might want to skip or just say "Full".
        // Requirement was "le plus chaud ... le plus élevé". If it's 10/10 it's VERY hot.
        // But usually "prévenir" implies we need people. 
        // existing logic checked `if (count >= 10) return ...`.
        // I will keep it but maybe we want to notify even if full? 
        // "il donne un créneau qui n'est absolument pas celui le plus chaud" -> User wants the hottest.
        // I'll stick to notifying, but maybe change text if full?
        // Let's assume < 10 for "Manque des joueurs" context.

        if (bestSlot.count >= 10) {
            return NextResponse.json({ message: "Best 4-hour slot is already full", slot: bestSlot });
        }

        const missing = 10 - bestSlot.count;
        const dateObj = new Date(bestSlot.dateStr);
        const dateFormatted = dateObj.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });

        // 2. Send Discord Reminder
        const embed = {
            title: "🔥 LE CRÉNEAU CHAUD DU MOMENT",
            description: `Le meilleur créneau de 4h est le **${dateFormatted} de ${bestSlot.startHour}h à ${bestSlot.startHour + 4}h** !`,
            color: 0xEAB308, // Yellow
            fields: [
                { name: "👥 Inscrits (4h)", value: `${bestSlot.count}/10`, inline: true },
                { name: "🔥 Manquants", value: `${missing} joueurs`, inline: true },
                { name: "🔗 Rejoindre", value: "[Clique ici pour compléter le Five !](https://planifive.vercel.app/)" }
            ],
            footer: { text: "Planifive • Reminder 4h" },
            timestamp: new Date().toISOString(),
        };

        if (process.env.NODE_ENV !== 'development' || req.url.includes('dryRun')) {
            await sendDiscordWebhook(embed);
        } else {
            console.log("Dev mode: Webhook not sent", JSON.stringify(embed, null, 2));
        }

        return NextResponse.json({ success: true, slot: bestSlot, embed: embed });
    } catch (error) {
        console.error("Error sending reminder:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
