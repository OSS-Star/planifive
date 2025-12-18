"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Shield } from "lucide-react";
import Navbar from "@/components/Navbar";

interface User {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    customName: string | null;
    isBanned: boolean;
}

interface Call {
    id: string;
    date: string;
    hour: number;
    location: string;
    duration: number; // Added duration
    creator: {
        name: string | null;
        image: string | null;
    };
}

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [calls, setCalls] = useState<Call[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"users" | "calls">("users"); // Tab state

    const ADMIN_EMAILS = ["sheizeracc@gmail.com"];
    const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);

    useEffect(() => {
        if (status === "loading") return;
        if (!isAdmin) {
            router.push("/");
            return;
        }
        fetchAllData();
    }, [session, status, router]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [usersRes, callsRes] = await Promise.all([
                fetch("/api/users"),
                fetch("/api/calls")
            ]);

            if (usersRes.ok) setUsers(await usersRes.json());
            if (callsRes.ok) setCalls(await callsRes.json());
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateName = async (userId: string, newName: string) => {
        setSaving(userId);
        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customName: newName }),
            });

            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, customName: newName } : u));
            } else {
                const errorData = await res.json();
                alert(`Erreur: ${errorData.error || "Mise à jour échouée"}`);
            }
        } catch (error) {
            console.error("Error updating user:", error);
            alert("Erreur réseau: Vérifiez votre connexion ou la base de données.");
        } finally {
            setSaving(null);
        }
    };

    const handleDeleteCall = async (callId: string) => {
        if (!confirm("Voulez-vous vraiment supprimer cet appel ?")) return;
        try {
            const res = await fetch(`/api/calls?id=${callId}`, { method: "DELETE" });
            if (res.ok) {
                setCalls(calls.filter(c => c.id !== callId));
            } else {
                alert("Erreur lors de la suppression");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleBanUser = async (user: User) => {
        const isBanned = user.isBanned;
        const action = isBanned ? "RESTAURER" : "BANNIR";
        const confirmMessage = isBanned
            ? "Voulez-vous réactiver ce joueur ? Il pourra de nouveau se connecter."
            : "ATTENTION : Vous êtes sur le point de BANNIR ce joueur.\n\nIl ne pourra plus se connecter.\n\nÊtes-vous sûr ?";

        if (!confirm(confirmMessage)) return;

        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isBanned: !isBanned })
            });

            if (res.ok) {
                setUsers(users.map(u => u.id === user.id ? { ...u, isBanned: !isBanned } : u));
            } else {
                const data = await res.json();
                alert(`Erreur: ${data.error || "Action échouée"}`);
            }
        } catch (error) {
            console.error("Error updated user:", error);
            alert("Erreur réseau");
        }
    };

    if (status === "loading" || !isAdmin) {
        return (
            <div className="min-h-screen bg-[#121212] flex items-center justify-center text-white">
                Chargement...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#121212] text-white">
            {/* Navbar */}
            <Navbar
                title="ADMIN"
                icon={<ShieldAlert size={20} className="text-violet-500" color="#8B5CF6" />}
            />

            {/* Content */}
            <div className="max-w-4xl mx-auto p-8 flex flex-col gap-8">

                {/* Tab Navigation */}
                <div className="flex justify-center gap-4 mb-4">
                    <button
                        onClick={() => setActiveTab("users")}
                        className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === "users"
                            ? "bg-violet-600 text-white shadow-lg scale-105"
                            : "bg-[#1A1A1A] text-gray-400 hover:bg-[#252525] hover:text-white"
                            }`}
                    >
                        Gestion Joueurs
                    </button>
                    <button
                        onClick={() => setActiveTab("calls")}
                        className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === "calls"
                            ? "bg-blue-600 text-white shadow-lg scale-105"
                            : "bg-[#1A1A1A] text-gray-400 hover:bg-[#252525] hover:text-white"
                            }`}
                    >
                        Gestion Appels
                    </button>
                </div>

                {/* Call Management Container */}
                {activeTab === "calls" && (
                    <div style={{
                        background: 'linear-gradient(to bottom right, #1A1A1A, #0F0F0F)',
                        borderRadius: '32px',
                        border: '1px solid #333',
                        width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(to bottom right, #222, #181818)',
                            padding: '1.5rem 1.5rem',
                            borderBottom: '1px solid #333',
                            borderTopLeftRadius: '32px',
                            borderTopRightRadius: '32px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <div style={{
                                padding: '0.5rem',
                                borderRadius: '0.75rem',
                                background: 'rgba(59, 130, 246, 0.1)', // Blue tint
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                            }}>
                                <Shield size={24} color="#3B82F6" />
                            </div>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                color: 'white',
                                textAlign: 'center',
                            }}>
                                Gestion des Appels Actifs
                            </h2>
                        </div>

                        {/* Table Content */}
                        <div className="p-6 overflow-x-auto">
                            {calls.length === 0 ? (
                                <div className="text-center text-gray-500 py-8 italic">Aucun appel en cours</div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-[#333]">
                                            <th className="p-4 font-medium">Date</th>
                                            <th className="p-4 font-medium">Heure</th>
                                            <th className="p-4 font-medium">Durée</th>
                                            <th className="p-4 font-medium">Créateur</th>
                                            <th className="p-4 font-medium">Lieu</th>
                                            <th className="p-4 font-medium text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#333]">
                                        {calls.map((call) => {
                                            const dateObj = new Date(call.date);
                                            const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: 'short', day: 'numeric', month: 'short' });
                                            return (
                                                <tr key={call.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="p-4 text-sm font-medium capitalize">{dateStr}</td>
                                                    <td className="p-4 text-sm text-blue-400 font-bold">{call.hour}h</td>
                                                    <td className="p-4 text-sm text-gray-300">
                                                        {call.duration === 90 ? "1h30" : "1h"}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-2">
                                                            {call.creator.image && (
                                                                <img
                                                                    src={call.creator.image}
                                                                    alt=""
                                                                    className="rounded-full object-cover"
                                                                    style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
                                                                />
                                                            )}
                                                            <span className="text-sm">{call.creator.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-sm text-gray-400">{call.location}</td>
                                                    <td className="p-4 text-right">
                                                        <button
                                                            onClick={() => handleDeleteCall(call.id)}
                                                            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 px-3 py-1 rounded text-xs font-bold transition-colors uppercase tracking-wider border border-red-500/30"
                                                        >
                                                            Supprimer
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {/* User Management Container */}
                {activeTab === "users" && (
                    <div style={{
                        background: 'linear-gradient(to bottom right, #1A1A1A, #0F0F0F)',
                        borderRadius: '32px',
                        border: '1px solid #333',
                        width: '100%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(to bottom right, #222, #181818)',
                            padding: '1.5rem 1.5rem',
                            borderBottom: '1px solid #333',
                            borderTopLeftRadius: '32px',
                            borderTopRightRadius: '32px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <div style={{
                                padding: '0.5rem',
                                borderRadius: '0.75rem',
                                background: 'rgba(139, 92, 246, 0.1)', // Violet tint
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                            }}>
                                <Shield size={24} color="#8B5CF6" />
                            </div>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: 'bold',
                                color: 'white',
                                textAlign: 'center',
                            }}>
                                Gestion des Utilisateurs
                            </h2>
                        </div>

                        {/* Table Content */}
                        <div className="p-6 pb-16 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-[#333]">
                                        <th className="p-4 font-medium">Pseudo</th>
                                        <th className="p-4 font-medium">Email</th>
                                        <th className="p-4 font-medium">Prénom</th>
                                        <th className="p-4 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#333]">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="rounded-full bg-[#333] overflow-hidden border border-[#555] flex-shrink-0"
                                                        style={{ width: '56px', height: '56px', minWidth: '56px' }}
                                                    >
                                                        {user.image ? (
                                                            <img src={user.image} alt={user.name || ""} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-bold text-gray-500 text-[14px]">
                                                                {user.name?.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="font-medium text-sm">{user.name}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-400 text-xs">
                                                {user.email}
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    defaultValue={user.customName || ""}
                                                    placeholder="Prénom..."
                                                    className="bg-[#2A2A2A] border border-[#444] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500 w-full transition-colors"
                                                    onBlur={(e) => {
                                                        if (e.target.value !== user.customName) {
                                                            handleUpdateName(user.id, e.target.value);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        }
                                                    }}
                                                />
                                            </td>
                                            <td className="p-4 text-right">
                                                {saving === user.id ? (
                                                    <span className="text-xs text-yellow-500 animate-pulse">...</span>
                                                ) : user.customName ? (
                                                    <span className="text-xs text-green-500">OK</span>
                                                ) : (
                                                    <span className="text-xs text-gray-600">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleBanUser(user)}
                                                    className={`px-3 py-1 rounded text-xs font-bold transition-colors uppercase tracking-wider border ${user.isBanned
                                                        ? "text-green-500 hover:text-green-400 hover:bg-green-500/10 border-green-500/30"
                                                        : "text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/30"
                                                        }`}
                                                >
                                                    {user.isBanned ? "Restaurer" : "Bannir"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
