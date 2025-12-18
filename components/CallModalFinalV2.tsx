"use client";

import { useState, useEffect } from "react";
import { X, Megaphone, Clock, MapPin, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CallModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialDate?: string;
    initialHour?: string;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

export default function CallModal({ isOpen, onClose, initialDate, initialHour }: CallModalProps) {
    const [date, setDate] = useState(initialDate || "");
    const [hour, setHour] = useState(initialHour || "20");
    const [location, setLocation] = useState("");
    const [duration, setDuration] = useState(60); // 60 or 90
    const [price, setPrice] = useState("");
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset/Update state when modal opens or props change
    useEffect(() => {
        if (isOpen) {
            setDate(initialDate || "");
            setHour(initialHour || "20");
            setDuration(60);
            setPrice("");
            setComment("");
            setError(null);
            setSuccess(false);
        }
    }, [isOpen, initialDate, initialHour]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch("/api/calls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date, hour, location, duration, price, comment }),
            });

            if (res.ok) {
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    onClose();
                    setDate("");
                    setLocation("");
                    setPrice("");
                    setComment("");
                    setDuration(60);
                }, 2000);
            } else {
                const data = await res.json();
                setError(data.error || "Une erreur est survenue.");
            }
        } catch (error) {
            console.error("Error sending call:", error);
            setError("Erreur de connexion.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        zIndex: 999999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{
                            background: 'linear-gradient(to bottom right, #1A1A1A, #0F0F0F)',
                            borderRadius: '32px',
                            border: '1px solid #333',
                            maxWidth: '55rem',
                            width: '95%',
                            minHeight: '700px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header - Matches "Ajouter Match" style */}
                        <div style={{
                            background: 'linear-gradient(to bottom right, #222, #181818)',
                            padding: '2rem 1.5rem',
                            borderBottom: '1px solid #333',
                            position: 'relative',
                            borderTopLeftRadius: '32px',
                            borderTopRightRadius: '32px',
                        }}>
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-3 rounded-full bg-transparent border-none text-[#B3B3B3] cursor-pointer transition-all duration-300 hover:bg-white/10 hover:text-white flex items-center justify-center"
                            >
                                <X size={18} />
                            </button>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    padding: '1rem',
                                    borderRadius: '1rem',
                                    background: 'rgba(88, 101, 242, 0.1)', // Blue for Call
                                    border: '1px solid rgba(88, 101, 242, 0.3)',
                                }}>
                                    <Megaphone size={32} color="#5865F2" />
                                </div>
                                <h2 style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 'bold',
                                    color: 'white',
                                    textAlign: 'center',
                                }}>
                                    Lancer un Appel
                                </h2>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 150px' }}>
                            {success ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-8">
                                        <Megaphone className="text-green-500" size={48} />
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-4">Appel Envoyé !</h3>
                                    <p className="text-gray-400 text-xl">La notification est partie sur Discord.</p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                                    {error && (
                                        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm text-center font-medium mb-4">
                                            {error}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '60px', paddingTop: '40px' }}>
                                        {/* Date */}
                                        <div>
                                            <label className="block text-gray-400 text-sm font-medium mb-1">
                                                Date
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={date}
                                                onChange={(e) => setDate(e.target.value)}
                                                className="w-full bg-[#2A2A2A] text-white focus:outline-none focus:bg-[#1a1a1a] transition-all duration-300 shadow-lg border-none ring-0"
                                                style={{ borderRadius: '20px', padding: '0 1rem', height: '38px', fontSize: '1rem' }}
                                            />
                                        </div>

                                        {/* Heure & Durée */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '50px', width: '105%' }}>
                                            <div>
                                                <label className="block text-gray-400 text-sm font-medium mb-1">
                                                    Heure
                                                </label>
                                                <div className="relative">
                                                    <select
                                                        value={hour}
                                                        onChange={(e) => setHour(e.target.value)}
                                                        className="w-full bg-[#2A2A2A] text-white focus:outline-none focus:bg-[#1a1a1a] transition-all duration-300 shadow-lg border-none ring-0 appearance-none cursor-pointer"
                                                        style={{ borderRadius: '20px', padding: '0 3rem 0 1rem', height: '38px', fontSize: '1rem' }}
                                                    >
                                                        {HOURS.map((h) => (
                                                            <option key={h} value={h}>{h}h00</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" style={{ right: '1rem' }}>
                                                        <Clock size={16} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-gray-400 text-sm font-medium mb-1">
                                                    Durée
                                                </label>
                                                <div className="flex w-full bg-[#2A2A2A] rounded-full p-1 h-[38px] shadow-lg">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDuration(60)}
                                                        className={`flex-1 rounded-full text-xs font-bold transition-all cursor-pointer ${duration === 60 ? 'bg-[#5865F2] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                                    >
                                                        1h
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDuration(90)}
                                                        className={`flex-1 rounded-full text-xs font-bold transition-all cursor-pointer ${duration === 90 ? 'bg-[#5865F2] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                                    >
                                                        1h30
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Lieu & Prix */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '50px', width: '105%' }}>
                                            <div>
                                                <label className="block text-gray-400 text-sm font-medium mb-1">
                                                    Lieu
                                                </label>
                                                <div className="relative w-full">
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="Ex: Urban Soccer..."
                                                        value={location}
                                                        onChange={(e) => setLocation(e.target.value)}
                                                        className="w-full bg-[#2A2A2A] text-white placeholder:text-gray-500 focus:outline-none focus:bg-[#1a1a1a] transition-all duration-300 shadow-lg border-none ring-0"
                                                        style={{ borderRadius: '20px', padding: '0 1rem 0 2.5rem', height: '38px', fontSize: '1rem' }}
                                                    />
                                                    <MapPin size={16} className="absolute text-gray-400 pointer-events-none" style={{ left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-gray-400 text-sm font-medium mb-1">
                                                    Prix (Optionnel)
                                                </label>
                                                <div className="relative w-full">
                                                    <input
                                                        type="text"
                                                        placeholder="Ex: 10€"
                                                        value={price}
                                                        onChange={(e) => setPrice(e.target.value)}
                                                        className="w-full bg-[#2A2A2A] text-white placeholder:text-gray-500 focus:outline-none focus:bg-[#1a1a1a] transition-all duration-300 shadow-lg border-none ring-0"
                                                        style={{ borderRadius: '20px', padding: '0 1rem', height: '38px', fontSize: '1rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Commentaire */}
                                        <div style={{ paddingRight: '25px' }}>
                                            <label className="block text-gray-400 text-sm font-medium mb-1">
                                                Commentaire (Optionnel)
                                            </label>
                                            <textarea
                                                placeholder="Infos supplémentaires..."
                                                value={comment}
                                                onChange={(e) => setComment(e.target.value)}
                                                className="w-full bg-[#2A2A2A] text-white placeholder:text-gray-500 focus:outline-none focus:bg-[#1a1a1a] transition-all duration-300 shadow-lg border-none ring-0"
                                                style={{ borderRadius: '20px', padding: '1rem', minHeight: '80px', fontSize: '1rem', resize: 'none' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '30px',
                                        left: 0,
                                        right: 0,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        gap: '64px'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="text-gray-300 hover:text-white font-bold text-xs uppercase tracking-wider transition-all"
                                            style={{ padding: '0.8rem 3rem', borderRadius: '20px', background: '#2A2A2A' }}
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg hover:shadow-[#5865F2]/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            style={{ padding: '0.8rem 3rem', borderRadius: '20px' }}
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                                            {loading ? "Envoi..." : "Envoyer l'appel"}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
