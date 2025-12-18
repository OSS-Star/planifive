import { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      if (!user || !account) return false;

      // Check for Ban (Soft Ban)
      // Note: 'user' here is the subset from the provider, we might need to check the DB if the banning happened recently.
      // But initially, let's check against the DB entry if possible, or rely on the adapter to fetch it.
      // However, the adapter runs *after* this callback or *during* logic. 
      // Safest is to query the DB for the user by email or ID if we suspect they might be banned.
      // But to be performant, let's optimize.

      // We can do a quick check:
      if (user.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser?.isBanned) {
          console.log(`⛔ User ${user.email} is banned. Blocking sign in.`);
          return false; // Blocks sign in
        }
      }

      // Force update of image and name from Discord profile on every login
      if (user.id && account.provider === "discord" && profile) {
        try {
          const p = profile as any;
          let imageUrl = user.image;

          // Authenticated User's Avatar
          if (p.avatar) {
            const format = p.avatar.startsWith("a_") ? "gif" : "png";
            imageUrl = `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${format}`;
          } else {
            // Default Avatar
            const discriminator = parseInt(p.discriminator ?? "0");
            if (discriminator === 0 && p.id) {
              const defaultId = Number(BigInt(p.id) >> BigInt(22)) % 6;
              imageUrl = `https://cdn.discordapp.com/embed/avatars/${defaultId}.png`;
            } else {
              imageUrl = `https://cdn.discordapp.com/embed/avatars/${discriminator % 5}.png`;
            }
          }

          const name = p.global_name || p.username || user.name;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              image: imageUrl,
              name: name
            }
          });
          console.log(`✅ User ${name} updated with latest Discord data`);
        } catch (e) {
          console.error("⚠️ Error updating user on signin:", e);
        }
      }
      return true;
    },
    jwt: async ({ token, user, account, profile }) => {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.picture = user.image;
        token.name = user.name;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.image = token.picture;
        session.user.email = token.email;
      }
      return session;
    },
  },
};