"use client";

import { useState, useEffect } from "react";
import { X, Check, XCircle, MapPin, Clock, User as UserIcon, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";

interface ActiveCallDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    call: any; // The call object from PlanningGrid
    onResponseUpdate?: () => void; // Callback to refresh grid/call data
    implicitAttendees?: any[]; // Users present in the 4h slots
}

export default function ActiveCallDetailsModal({ isOpen, onClose, call, onResponseUpdate, implicitAttendees = [] }: ActiveCallDetailsModalProps) {
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

    if (!call) return null;

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 0, 0, 0.5)', // Transparent red to verify visibility
                zIndex: 9999999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            onClick={onClose}
        >
            <div
                className="bg-[#181818] border border-[#333] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-[#333] flex justify-between items-start bg-[#222]">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">{call.location}</h2>
                        <div className="flex items-center gap-4 text-gray-400 text-sm">
                            <div className="flex items-center gap-1">
                                <Clock size={16} />
                                <span>{call.hour}h00 - {call.hour + (call.duration === 90 ? 1 : 1)}h{call.duration === 90 ? "30" : "00"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <UserIcon size={16} />
                                <span>Lancé par {call.creator?.name || "???"}</span>
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
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Content: 2 Columns */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6">

                    {/* Left: ACCEPTS */}
                    <div className="bg-[#1A1A1A] rounded-xl p-4 border border-green-900/30">
                        <h3 className="text-green-500 font-bold mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                            <Check size={16} /> Présents ({responses.accepted.length})
                        </h3>
                        <div className="space-y-3">
                            {responses.accepted.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-300 font-medium">
                                        {u.name}
                                        {u.isImplicit && <span className="text-xs text-[#1ED760] ml-2 font-normal italic">(Dispo)</span>}
                                    </span>
                                </div>
                            ))}
                            {responses.accepted.length === 0 && (
                                <span className="text-gray-600 italic text-sm">Personne... pour l'instant.</span>
                            )}
                        </div>
                    </div>

                    {/* Right: REFUSALS */}
                    <div className="bg-[#1A1A1A] rounded-xl p-4 border border-red-900/30">
                        <h3 className="text-red-500 font-bold mb-4 flex items-center gap-2 uppercase text-sm tracking-wider">
                            <XCircle size={16} /> Absents ({responses.declined.length})
                        </h3>
                        <div className="space-y-3">
                            {responses.declined.map((u: any, idx) => (
                                <div key={idx} className="flex items-center gap-3 opacity-60">
                                    <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                        {u.image ? <img src={u.image} className="w-full h-full object-cover" /> : null}
                                    </div>
                                    <span className="text-gray-400 font-medium line-through decoration-red-500/50">{u.name}</span>
                                </div>
                            ))}
                            {responses.declined.length === 0 && (
                                <span className="text-gray-600 italic text-sm">Aucun refus.</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer: Actions */}
                <div className="p-6 border-t border-[#333] bg-[#222] flex justify-center gap-4">
                    <button
                        onClick={() => handleRespond("ACCEPTED")}
                        disabled={loading}
                        className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${myStatus === "ACCEPTED"
                            ? "bg-green-600/20 text-green-500 border border-green-500 cursor-default"
                            : "bg-green-600 text-white hover:bg-green-500 shadow-lg hover:shadow-green-500/20"
                            }`}
                    >
                        {myStatus === "ACCEPTED" ? <Check size={18} /> : null}
                        {myStatus === "ACCEPTED" ? "Présent" : "Accepter"}
                    </button>

                    <button
                        onClick={() => handleRespond("DECLINED")}
                        disabled={loading}
                        className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${myStatus === "DECLINED"
                            ? "bg-red-600/20 text-red-500 border border-red-500 cursor-default"
                            : "bg-[#2A2A2A] text-gray-300 hover:bg-red-900/50 hover:text-red-400 border border-transparent hover:border-red-900"
                            }`}
                    >
                        {myStatus === "DECLINED" ? <X size={18} /> : null}
                        {myStatus === "DECLINED" ? "Refusé" : "Refuser"}
                    </button>
                </div>
            </div>
        </div>
    )
}
