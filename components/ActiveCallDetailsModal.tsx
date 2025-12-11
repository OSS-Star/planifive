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
            // We assume PlanningGrid might pass responses if available, 
            // but fetching fresh data is safer. 
            // Or we can create a GET route, OR just rely on what is passed?
            // "PlanningGrid" fetches calls. Does it fetch responses?
            // The current "GET /api/calls" likely doesn't include responses. 
            // We need to either update GET /api/calls or fetch here.
            // Let's create a quick fetch inside this component or assume we update GET /api/calls later.
            // For now, let's fetch specific call details (?) 
            // actually, let's assume valid data flows in or we fetch.
            // I'll implement a simple fetch to a new endpoint or query param?
            // Let's use `GET /api/calls?id=...` which implies obtaining details.
            // I'll update GET /api/calls later to include responses.
            // For now, let's pretend `call` has `responses`.
            // If not, we might need to fetch.

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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start'
                }}>
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <MapPin size={20} className="text-white" />
                            {call.location}
                        </h2>
                        <div className="flex items-center gap-4 text-gray-400 text-xs uppercase tracking-wider font-medium">
                            <div className="flex items-center gap-1.5">
                                <Clock size={14} />
                                <span>{call.hour}H - {call.hour + (call.duration === 90 ? 5 : 4)}H00</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <UserIcon size={14} />
                                <span>PAR {call.creator?.name || "???"}</span>
                            </div>
                        </div>
                    </div>
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

                {/* Content: 2 Columns */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Left: ACCEPTS */}
                    <div className="bg-[#141414] rounded-2xl p-4 border border-[#222] flex flex-col h-full shadow-inner">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <h3 className="text-green-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <Check size={14} /> Présents
                            </h3>
                            <span className="bg-green-500/10 text-green-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {responses.accepted.length}
                            </span>
                        </div>

                        <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                            {responses.accepted.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <div className="w-5 h-5 rounded-full bg-gray-700 overflow-hidden shrink-0">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-300 text-sm font-medium truncate flex-1">
                                        {u.name}
                                    </span>
                                    {u.isImplicit && (
                                        <span className="text-[10px] text-[#1ED760] font-bold bg-[#1ED760]/10 px-1.5 py-0.5 rounded-md border border-[#1ED760]/20">
                                            DISPO
                                        </span>
                                    )}
                                </div>
                            ))}
                            {responses.accepted.length === 0 && (
                                <div className="text-gray-600 italic text-xs text-center py-8">
                                    En attente de réponses...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: REFUSALS */}
                    <div className="bg-[#141414] rounded-2xl p-4 border border-[#222] flex flex-col h-full shadow-inner">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <h3 className="text-red-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <XCircle size={14} /> Absents
                            </h3>
                            <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {responses.declined.length}
                            </span>
                        </div>

                        <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                            {responses.declined.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors opacity-60">
                                    <div className="w-5 h-5 rounded-full bg-gray-700 overflow-hidden shrink-0 grayscale">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-400 text-sm font-medium line-through decoration-red-500/50 truncate">
                                        {u.name}
                                    </span>
                                </div>
                            ))}
                            {responses.declined.length === 0 && (
                                <div className="text-gray-600 italic text-xs text-center py-8">
                                    Aucun refus pour le moment
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer: Actions */}
                <div className="p-6 pt-4 bg-gradient-to-t from-[#0F0F0F] to-[#141414] border-t border-[#333] flex justify-center gap-4">
                    <button
                        onClick={() => handleRespond("ACCEPTED")}
                        disabled={loading}
                        className={`px-8 py-3 rounded-xl font-bold text-sm tracking-wide uppercase transition-all flex items-center gap-2 shadow-lg ${myStatus === "ACCEPTED"
                            ? "bg-green-500/20 text-green-500 border border-green-500/50 cursor-default"
                            : "bg-[#1ED760] text-black hover:bg-[#1fdf64] hover:scale-105 hover:shadow-green-500/20"
                            }`}
                    >
                        {myStatus === "ACCEPTED" ? <Check size={16} /> : null}
                        {myStatus === "ACCEPTED" ? "Présent" : "Accepter"}
                    </button>

                    <button
                        onClick={() => handleRespond("DECLINED")}
                        disabled={loading}
                        className={`px-8 py-3 rounded-xl font-bold text-sm tracking-wide uppercase transition-all flex items-center gap-2 shadow-lg ${myStatus === "DECLINED"
                            ? "bg-red-500/20 text-red-500 border border-red-500/50 cursor-default"
                            : "bg-[#2A2A2A] text-gray-300 hover:bg-[#333] hover:text-white border border-transparent hover:border-gray-600"
                            }`}
                    >
                        {myStatus === "DECLINED" ? <X size={16} /> : null}
                        {myStatus === "DECLINED" ? "Refusé" : "Refuser"}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
