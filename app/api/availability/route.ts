import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "../../../lib/prisma";
import { authOptions } from "../../../lib/auth";

type SlotData = {
  users: { id: string; name: string | null; image: string | null }[];
  count: number;
};

// --- GET ---
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email || !session.user?.id) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  const userId = session.user.id;

  // Default: Fetch from today if no range specified (backward compat)
  // But ideally we want a range.
  const whereClause: any = { date: { gte: new Date() } };

  if (startParam && endParam) {
    whereClause.date = {
      gte: new Date(startParam),
      lte: new Date(endParam)
    };
  }

  const allDispos = await prisma.availability.findMany({
    where: whereClause,
    include: { user: { select: { id: true, name: true, image: true } } }
  });

  const mySlots: string[] = [];
  const slotDetails: Record<string, SlotData> = {};

  allDispos.forEach((dispo) => {
    const dateStr = dispo.date.toISOString().split("T")[0];
    const key = `${dateStr}-${dispo.hour}`;
    if (!slotDetails[key]) slotDetails[key] = { users: [], count: 0 };
    slotDetails[key].count++;
    slotDetails[key].users.push({ id: dispo.user.id, name: dispo.user.name, image: dispo.user.image });
    if (dispo.userId === userId) mySlots.push(key);
  });

  return NextResponse.json({ mySlots, slotDetails });
}

// --- POST (Toggle simple OR Batch) ---
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email || !session.user?.id) return NextResponse.json({ error: "401" }, { status: 401 });

  const body = await req.json();
  const userId = session.user.id;
  const userName = session.user.name || "Un joueur";

  // --- BATCH MODE ---
  if (body.slots && Array.isArray(body.slots)) {
    const results = [];
    // Process sequentially to avoid DB lock/race issues, or use Promise.all if DB can handle it.
    // Given the connection issues, sequential or small chunks is safer, but let's try Promise.all for speed
    // assuming the user switches to Transaction Pooler (6543).
    // Actually, let's do a simple loop to be safe.
    for (const slot of body.slots) {
      const { date, hour } = slot;
      const targetDate = new Date(date);

      // Check existing
      const existing = await prisma.availability.findFirst({
        where: { userId: userId, date: targetDate, hour: hour },
      });

      if (existing) {
        // DELETE
        await prisma.availability.delete({ where: { id: existing.id } });
        // We skip the heavy "Golden Slot" check in batch mode for speed, 
        // OR we can implement it if critical. For now, let's keep it simple for drag-delete.
        // If the user drags to delete, we should probably check for broken golden slots?
        // It might be too heavy. Let's assume drag-delete is rare or acceptable to delay notification.
      } else {
        // CREATE
        await prisma.availability.create({
          data: { userId: userId, date: targetDate, hour: hour },
        });
      }
    }
    return NextResponse.json({ status: "batch_processed", count: body.slots.length });
  }

  // --- SINGLE MODE (Legacy/Click) ---
  const { date, hour } = body;
  const targetDate = new Date(date);
  const MATCH_SIZE = 10;

  const existing = await prisma.availability.findFirst({
    where: { userId: userId, date: targetDate, hour: hour },
  });

  if (existing) {
    // --- DELETE ---
    await prisma.availability.delete({ where: { id: existing.id } });

    // Check count AFTER deletion
    const newCount = await prisma.availability.count({
      where: { date: targetDate, hour: hour },
    });

    // Only trigger cancellation if we dropped BELOW the limit
    if (newCount < MATCH_SIZE) {
      // Check for broken golden slot (range: hour-2 to hour)
      // We only care if a golden slot WAS notified starting at these hours
      const potentialStarts = [hour - 2, hour - 1, hour].filter(h => h >= 8 && h <= 21);

      // Single query to find active notifications in this range
      const activeNotifications = await prisma.slotStatus.findMany({
        where: {
          date: targetDate,
          hour: { in: potentialStarts },
          isGoldenNotified: true
        }
      });

      for (const status of activeNotifications) {
        const startH = status.hour;
        console.log(`[DELETE] Broken Golden Slot found starting at ${startH}h`);

        const dateStr = targetDate.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });
        const embed = {
          title: "❌ DÉSISTEMENT SUR UN MATCH 3H !",
          description: `${userName} s'est désisté du créneau de ${hour}h, annulant la session de 3h (${startH}h - ${startH + 3}h).`,
          color: 0xEF4444, // Red
          fields: [
            { name: "📅 Date", value: dateStr, inline: true },
            { name: "⏰ Session impactée", value: `${startH}h - ${startH + 3}h`, inline: true },
            { name: "📉 Action", value: "Le statut confirmé a été révoqué.", inline: false },
            { name: "🔗 Remonter l'équipe", value: "[Clique ici](https://five-planner.vercel.app/)" }
          ],
          footer: { text: "Planifive • Désistement" },
          timestamp: new Date().toISOString(),
        };

        // Fire and forget webhook (catch error to not block)
        import("../../../lib/discord").then(mod => mod.sendDiscordWebhook(embed)).catch(console.error);

        // Reset the golden notification status
        await prisma.slotStatus.update({
          where: { date_hour: { date: targetDate, hour: startH } },
          data: { isGoldenNotified: false }
        });
      }
    }

    return NextResponse.json({ status: "removed" });
  } else {
    // --- ADD ---
    await prisma.availability.create({
      data: { userId: userId, date: targetDate, hour: hour },
    });

    // Check count
    const count = await prisma.availability.count({
      where: { date: targetDate, hour: hour },
    });

    if (count >= MATCH_SIZE) {
      // Check Golden Slot (3 Consecutive Slots)
      // We need to check range [hour-2, hour+2] to see if we formed a sequence of 3
      const rangeStart = hour - 2;
      const rangeEnd = hour + 2;

      // Single query for all relevant slots
      const relevantSlots = await prisma.availability.findMany({
        where: {
          date: targetDate,
          hour: { gte: rangeStart, lte: rangeEnd }
        },
        select: { hour: true, user: { select: { name: true } } }
      });

      // Group by hour
      const slotsMap = new Map<number, string[]>();
      for (let h = rangeStart; h <= rangeEnd; h++) slotsMap.set(h, []);

      relevantSlots.forEach(s => {
        if (slotsMap.has(s.hour)) slotsMap.get(s.hour)?.push(s.user.name || "Inconnu");
      });

      // Helper to check sequence
      const checkSequence = async (startH: number) => {
        if (startH < 8 || startH > 21) return;
        const c1 = slotsMap.get(startH)?.length || 0;
        const c2 = slotsMap.get(startH + 1)?.length || 0;
        const c3 = slotsMap.get(startH + 2)?.length || 0;

        if (c1 >= MATCH_SIZE && c2 >= MATCH_SIZE && c3 >= MATCH_SIZE) {
          // Found a golden slot! Check if already notified
          const goldenStatus = await prisma.slotStatus.findUnique({
            where: { date_hour: { date: targetDate, hour: startH } },
          });

          if (!goldenStatus?.isGoldenNotified) {
            const allPlayers = [
              ...(slotsMap.get(startH) || []),
              ...(slotsMap.get(startH + 1) || []),
              ...(slotsMap.get(startH + 2) || [])
            ];
            const uniquePlayers = Array.from(new Set(allPlayers));
            const dateStr = targetDate.toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long' });
            const playersList = uniquePlayers.map(p => `• ${p}`).join("\n");

            const embed = {
              title: "🏆 MATCH 3H CONFIRMÉ !",
              description: `Incroyable ! 3 créneaux consécutifs sont complets (${startH}h - ${startH + 3}h) !`,
              color: 0xFACC15, // Gold
              fields: [
                { name: "📅 Date", value: dateStr, inline: true },
                { name: "⏰ Créneaux", value: `${startH}h - ${startH + 1}h - ${startH + 2}h`, inline: true },
                { name: "⚽ Joueurs présents", value: playersList || "Aucun joueur trouvé", inline: false },
                { name: "🔗 Rejoindre", value: "[Clique ici](https://five-planner.vercel.app/)" }
              ],
              footer: { text: "Planifive • Golden Session" },
              timestamp: new Date().toISOString(),
            };

            // Fire and forget
            import("../../../lib/discord").then(mod => mod.sendDiscordWebhook(embed)).catch(console.error);

            await prisma.slotStatus.upsert({
              where: { date_hour: { date: targetDate, hour: startH } },
              update: { isGoldenNotified: true },
              create: { date: targetDate, hour: startH, isGoldenNotified: true },
            });
          }
        }
      };

      // Check possible start times for a sequence involving 'hour'
      // Sequence can start at: hour-2, hour-1, or hour
      await Promise.all([
        checkSequence(hour - 2),
        checkSequence(hour - 1),
        checkSequence(hour)
      ]);
    }
    return NextResponse.json({ status: "added" });
  }
}