"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Trophy, Medal, User as UserIcon, LogOut } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import "./leaderboard.scss";

interface User {
    id: string;
    name: string | null;
    image: string | null;
    customName: string | null;
    isBanned?: boolean;
}

interface Match {
    id: string;
    date: string;
    scoreTeam1: number;
    scoreTeam2: number;
    team1: User[];
    team2: User[];
    team1Names?: string[];
    team2Names?: string[];
}

interface PlayerStats {
    name: string;
    image?: string | null;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
}

export default function LeaderboardPage() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<PlayerStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [matchesRes, usersRes] = await Promise.all([
                fetch("/api/matches"),
                fetch("/api/users")
            ]);

            if (!matchesRes.ok) throw new Error("Failed to fetch matches");
            const matches: Match[] = await matchesRes.json();

            let users: User[] = [];
            if (usersRes.ok) {
                users = await usersRes.json();
            }

            calculateStats(matches, users);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (matches: Match[], users: User[]) => {
        const playerStats: { [key: string]: PlayerStats } = {};

        // Create a robust set of banned names (both display name and custom name)
        const bannedNames = new Set(
            users.filter(u => u.isBanned).flatMap(u => [
                u.name?.toLowerCase(),
                u.customName?.toLowerCase()
            ]).filter(Boolean)
        );

        matches.forEach(match => {
            const team1Won = match.scoreTeam1 > match.scoreTeam2;
            const team2Won = match.scoreTeam2 > match.scoreTeam1;
            const draw = match.scoreTeam1 === match.scoreTeam2;

            // Process Team 1
            const team1Players = match.team1Names && match.team1Names.length > 0
                ? match.team1Names
                : match.team1.map(u => u.name || "Inconnu");

            team1Players.forEach(name => {
                if (!name || !name.trim()) return;
                const cleanName = name.trim();
                const lowerName = cleanName.toLowerCase();

                // 1. Try to match with a Real User in DB
                const userMatch = users.find(u =>
                    (u.customName && u.customName.toLowerCase() === lowerName) ||
                    (u.name && u.name.toLowerCase() === lowerName)
                );

                if (userMatch) {
                    // If we found a real user account, trust THEIR status.
                    if (userMatch.isBanned) return;
                } else {
                    // If it's a GUEST (no account found), check the banned names list
                    // This prevents banned users from playing as "guests" with their banned name
                    if (bannedNames.has(lowerName)) return;
                }

                const playerImage = userMatch?.image || null;

                // Use the standardized name from the user record if matched, otherwise the input name
                const displayName = userMatch?.customName || cleanName;

                if (!playerStats[displayName]) {
                    playerStats[displayName] = { name: displayName, image: playerImage, matches: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
                } else if (!playerStats[displayName].image && playerImage) {
                    playerStats[displayName].image = playerImage;
                }

                playerStats[displayName].matches++;
                if (team1Won) playerStats[displayName].wins++;
                else if (team2Won) playerStats[displayName].losses++;
                else playerStats[displayName].draws++;
            });

            // Process Team 2
            const team2Players = match.team2Names && match.team2Names.length > 0
                ? match.team2Names
                : match.team2.map(u => u.name || "Inconnu");

            team2Players.forEach(name => {
                if (!name || !name.trim()) return;
                const cleanName = name.trim();
                const lowerName = cleanName.toLowerCase();

                // 1. Try to match with a Real User in DB
                const userMatch = users.find(u =>
                    (u.customName && u.customName.toLowerCase() === lowerName) ||
                    (u.name && u.name.toLowerCase() === lowerName)
                );

                if (userMatch) {
                    // If we found a real user account, trust THEIR status.
                    if (userMatch.isBanned) return;
                } else {
                    // If it's a GUEST (no account found), check the banned names list
                    // This prevents banned users from playing as "guests" with their banned name
                    if (bannedNames.has(lowerName)) return;
                }

                const playerImage = userMatch?.image || null;

                // Use the standardized name from the user record if matched, otherwise the input name
                const displayName = userMatch?.customName || cleanName;

                if (!playerStats[displayName]) {
                    playerStats[displayName] = { name: displayName, image: playerImage, matches: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
                } else if (!playerStats[displayName].image && playerImage) {
                    playerStats[displayName].image = playerImage;
                }

                playerStats[displayName].matches++;
                if (team2Won) playerStats[displayName].wins++;
                else if (team1Won) playerStats[displayName].losses++;
                else playerStats[displayName].draws++;
            });
        });

        // Calculate Win Rate and Sort
        const sortedStats = Object.values(playerStats).map(stat => ({
            ...stat,
            winRate: stat.matches > 0 ? Math.round((stat.wins / stat.matches) * 100) : 0
        })).sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins; // Sort by Wins first
            return b.winRate - a.winRate; // Then by Win Rate
        });

        setStats(sortedStats);
    };

    const topPlayer = stats.length > 0 ? stats[0] : null;

    return (
        <>
            <Navbar
                title="LEADERBOARD"
                icon={<Trophy size={20} color="#FFD700" />}
            />

            <div className="leaderboard-container">
                <div className="l-wrapper">
                    <div className="l-grid">
                        <div className="l-grid__item l-grid__item--sticky">
                            <div className="c-card u-bg--light-gradient u-text--dark" style={{ overflow: 'hidden', padding: '2rem', borderRadius: '1.5rem' }}>
                                {/* Header: TOP PLAYER */}
                                <div className="u-text--center u-mb--24">
                                    <div className="u-text--small" style={{ fontWeight: 800, opacity: 0.6, letterSpacing: '1px' }}>TOP PLAYER</div>
                                </div>

                                {/* Center: Avatar & Name */}
                                <div className="u-text--center u-mb--24">
                                    <div className="c-avatar c-avatar--lg u-mb--16" style={{ width: '8rem', height: '8rem', borderRadius: '1.5rem', border: '4px solid #ffffff', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', margin: '0 auto' }}>
                                        {topPlayer?.image ? (
                                            <img src={topPlayer.image} alt={topPlayer.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1.5rem' }} />
                                        ) : (
                                            topPlayer?.name?.charAt(0).toUpperCase() || "?"
                                        )}
                                    </div>
                                    <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{topPlayer?.name || "Aucun joueur"}</h2>
                                </div>

                                {/* Footer: Win Rate (Left) & Victories (Right) */}
                                <div className="u-display--flex u-justify--space-between u-align--center" style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1.5rem' }}>
                                    <div className="u-text--left">
                                        <div className="u-text--small" style={{ fontWeight: 600, opacity: 0.6, fontSize: '0.75rem' }}>WIN RATE</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{topPlayer?.winRate || 0}%</div>
                                    </div>
                                    <div className="u-text--right">
                                        <div className="u-text--small" style={{ fontWeight: 600, opacity: 0.6, fontSize: '0.75rem' }}>VICTOIRES</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{topPlayer?.wins || 0}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="l-grid__item">
                            <div className="c-card">
                                <div className="c-card__header">
                                    <h3>Classement</h3>
                                </div>
                                <div className="c-card__body">
                                    {loading ? (
                                        <div className="u-text--center u-p--16">Chargement...</div>
                                    ) : (
                                        <ul className="c-list" id="list">
                                            <li className="c-list__item">
                                                <div className="c-list__grid">
                                                    <div className="u-text--left u-text--small u-text--medium">Rank</div>
                                                    <div className="u-text--left u-text--small u-text--medium">Joueur</div>
                                                    <div className="u-text--right u-text--small u-text--medium">Win Rate</div>
                                                </div>
                                            </li>
                                            {stats.map((player, index) => {
                                                let rankClass = "c-flag";
                                                let textClass = "u-text--primary";

                                                if (index === 0) {
                                                    rankClass += " u-bg--yellow u-text--dark";
                                                    textClass = "u-text--yellow";
                                                } else if (index === 1) {
                                                    rankClass += " u-bg--teal u-text--dark";
                                                    textClass = "u-text--teal";
                                                } else if (index === 2) {
                                                    rankClass += " u-bg--orange u-text--dark";
                                                    textClass = "u-text--orange";
                                                }

                                                return (
                                                    <li className="c-list__item" key={player.name}>
                                                        <div className="c-list__grid">
                                                            <div className={rankClass}>{index + 1}</div>
                                                            <div className="c-media">
                                                                <div className="c-avatar c-media__img">
                                                                    {player.image ? (
                                                                        <img src={player.image} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                                                    ) : (
                                                                        player.name.charAt(0).toUpperCase()
                                                                    )}
                                                                </div>
                                                                <div className="c-media__content">
                                                                    <div className="c-media__title">{player.name}</div>
                                                                    <div className="u-text--small u-text--medium">{player.matches} Matchs ({player.wins}V - {player.losses}D)</div>
                                                                </div>
                                                            </div>
                                                            <div className={`u-text--right ${textClass}`}>
                                                                <div className="u-mt--8">
                                                                    <strong>{player.winRate}%</strong>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
