"use client";

import { useState, useEffect } from "react";
import { X, Check, XCircle, MapPin, Clock, User as UserIcon, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";

interface ActiveCallDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    call: any; // The call object from PlanningGrid
    onResponseUpdate?: () => void; // Callback to refresh grid/call data
    implicitAttendees?: any[]; // Users present in the 4h slots
}

export default function ActiveCallDetailsModal({ isOpen, onClose, call, onResponseUpdate, implicitAttendees = [] }: ActiveCallDetailsModalProps) {
    // Forced update to trigger hot reload
    if (isOpen) console.log("🟣 [MODAL] Render ActiveCallDetailsModal. IsOpen:", isOpen, "Call:", call?.id);
    const { data: session } = useSession();
    const [loading, setLoading] = useState(false);
    const [responses, setResponses] = useState<{ accepted: any[], declined: any[] }>({ accepted: [], declined: [] });
    const [myStatus, setMyStatus] = useState<string | null>(null);

    // Fetch responses when modal opens
    useEffect(() => {
        if (isOpen && call?.id) {
            fetchResponses();
        }
    }, [isOpen, call]);

    const fetchResponses = async () => {
        try {
            // Temporary: Fetch fresh call data with responses
            const res = await fetch(`/api/calls?id=${call.id}`);
            if (res.ok) {
                const fullCall = await res.json();
                processResponses(fullCall.responses || []);
            }
        } catch (e) { console.error(e); }
    };

    const processResponses = (responsesList: any[]) => {
        // 1. Identify Explicit Actions
        const explicitAccepted = responsesList.filter((r: any) => r.status === "ACCEPTED");
        const explicitDeclined = responsesList.filter((r: any) => r.status === "DECLINED");
        const declinedIds = new Set(explicitDeclined.map((r: any) => r.userId));
        const acceptedIds = new Set(explicitAccepted.map((r: any) => r.userId));

        // 2. Build Final Accepted List
        // Start with Explicit Accepted
        let finalAccepted = explicitAccepted.map((r: any) => r.user);

        // Add Implicit Attendees (if not explicitly declined AND not already added)
        implicitAttendees?.forEach(user => {
            if (!declinedIds.has(user.id) && !acceptedIds.has(user.id)) {
                finalAccepted.push({ ...user, isImplicit: true });
            }
        });

        // 3. Build Final Declined List (Just explicit declines)
        const finalDeclined = explicitDeclined.map((r: any) => r.user);

        setResponses({ accepted: finalAccepted, declined: finalDeclined });

        if (session?.user?.id) {
            const myResp = responsesList.find((r: any) => r.userId === session.user.id);
            setMyStatus(myResp ? myResp.status : null);
        }
    };

    const handleRespond = async (status: "ACCEPTED" | "DECLINED") => {
        setLoading(true);
        try {
            // 1. Send Response Status
            const res = await fetch("/api/calls/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callId: call.id, status })
            });

            if (res.ok) {
                await fetchResponses();
                if (onResponseUpdate) onResponseUpdate();
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    // Use Portal to ensure it sits on top of everything
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!isOpen || !call || !mounted) return null;
    if (typeof window === 'undefined') return null;

    const modalContent = (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                zIndex: 9999999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'linear-gradient(to bottom right, #1A1A1A, #0F0F0F)',
                    borderRadius: '32px',
                    border: '1px solid #333',
                    maxWidth: '50rem', // Wider than confirm modal to fit 2 cols
                    width: '90%',
                    maxHeight: '85vh',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(to bottom right, #222, #181818)',
                    padding: '1.5rem',
                    borderBottom: '1px solid #333',
                }}>
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-3">
                            {/* 1. Time */}
                            <div className="flex items-center gap-3 text-sm font-bold text-gray-300">
                                <Clock size={16} />
                                <span>{call.hour}H - {call.hour + (call.duration === 90 ? 5 : 4)}H00</span>
                            </div>

                            {/* 2. Creator */}
                            <div className="flex items-center gap-3 text-sm font-bold text-gray-300">
                                <UserIcon size={16} />
                                <span>PAR {call.creator?.name || "???"}</span>
                            </div>

                            {/* 3. Location */}
                            <div className="flex items-center gap-3 text-sm font-bold text-gray-300">
                                <MapPin size={16} />
                                <span>{call.location}</span>
                            </div>
                        </div>

                        {/* Close/Delete */}
                        <div className="flex items-center gap-2">
                            {session?.user?.id === call?.creatorId && (
                                <button
                                    onClick={async () => {
                                        if (!confirm("Supprimer cet appel ?")) return;
                                        setLoading(true);
                                        await fetch(`/api/calls?id=${call.id}`, { method: "DELETE" });
                                        if (onResponseUpdate) onResponseUpdate();
                                        onClose();
                                        setLoading(false);
                                    }}
                                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-full transition-colors"
                                    title="Supprimer l'appel"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content: 2 Columns */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">

                    {/* Left: ACCEPTS */}
                    <div className="bg-[#141414] rounded-3xl p-5 border border-[#1f1f1f] flex flex-col h-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <div className="mb-4 pb-2 border-b border-[#222]">
                            <h3 className="text-green-500 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                                <Check size={12} /> Présents ({responses.accepted.length})
                            </h3>
                        </div>

                        <div className="space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                            {responses.accepted.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-5 p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors group">
                                    <div style={{ width: '48px', height: '48px', minWidth: '48px' }} className="rounded-full bg-gray-800 overflow-hidden shrink-0 ring-1 ring-[#333]">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-400 group-hover:text-gray-200 text-xs font-medium truncate flex-1 transition-colors">
                                        {u.name}
                                    </span>
                                    {u.isImplicit && (
                                        <span className="text-[9px] text-[#1ED760] font-bold opacity-70">
                                            (DISPO)
                                        </span>
                                    )}
                                </div>
                            ))}
                            {responses.accepted.length === 0 && (
                                <div className="text-gray-700 italic text-[10px] text-center py-8">
                                    En attente...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: REFUSALS */}
                    <div className="bg-[#141414] rounded-3xl p-5 border border-[#1f1f1f] flex flex-col h-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                        <div className="mb-4 pb-2 border-b border-[#222]">
                            <h3 className="text-red-500 font-bold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                                <XCircle size={12} /> Absents ({responses.declined.length})
                            </h3>
                        </div>

                        <div className="space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                            {responses.declined.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-5 p-1.5 rounded-lg hover:bg-[#1a1a1a] transition-colors opacity-50 hover:opacity-100 group">
                                    <div style={{ width: '48px', height: '48px', minWidth: '48px' }} className="rounded-full bg-gray-800 overflow-hidden shrink-0 grayscale ring-1 ring-[#333]">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-500 group-hover:text-gray-400 text-xs font-medium line-through decoration-red-900 truncate">
                                        {u.name}
                                    </span>
                                </div>
                            ))}
                            {responses.declined.length === 0 && (
                                <div className="text-gray-700 italic text-[10px] text-center py-8">
                                    Personne
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer: Actions */}
                <div className="px-8 py-14 bg-gradient-to-t from-[#0a0a0a] to-[#0F0F0F] border-t border-[#1f1f1f] flex justify-center gap-4 items-center">
                    <button
                        onClick={() => handleRespond("ACCEPTED")}
                        disabled={loading}
                        className={`h-20 w-64 rounded-full font-black text-sm tracking-[0.15em] uppercase transition-all flex items-center justify-center gap-3 shadow-2xl ${myStatus === "ACCEPTED"
                            ? "bg-[#132e13] text-green-500 border border-green-900/50 cursor-default opacity-80"
                            : "bg-[#1ED760] text-black hover:bg-[#1fdf64] hover:scale-105 hover:shadow-[0_0_30px_rgba(30,215,96,0.3)]"
                            }`}
                    >
                        {myStatus === "ACCEPTED" ? <Check size={18} strokeWidth={3} /> : null}
                        {myStatus === "ACCEPTED" ? "PRÉSENT" : "ACCEPTER"}
                    </button>

                    <button
                        onClick={() => handleRespond("DECLINED")}
                        disabled={loading}
                        className={`h-20 w-64 rounded-full font-black text-sm tracking-[0.15em] uppercase transition-all flex items-center justify-center gap-3 shadow-2xl ${myStatus === "DECLINED"
                            ? "bg-[#2e1313] text-red-500 border border-red-900/50 cursor-default opacity-80"
                            : "bg-[#E50914] text-white hover:bg-[#b20710] border border-transparent shadow-[0_0_20px_rgba(229,9,20,0.4)]"
                            }`}
                    >
                        {myStatus === "DECLINED" ? <X size={18} strokeWidth={3} /> : null}
                        {myStatus === "DECLINED" ? "REFUSÉ" : "REFUSER"}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
