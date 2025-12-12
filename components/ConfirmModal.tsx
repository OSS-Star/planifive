"use client";

import { Save, Copy, X, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    type: "save" | "apply" | "danger";
    zIndex?: number;
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    type,
    zIndex = 999999,
}: ConfirmModalProps) {
    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    if (!isOpen) return null;
    if (typeof window === 'undefined') return null;

    const modalContent = (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                zIndex: zIndex,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'linear-gradient(to bottom right, #1A1A1A, #0F0F0F)',
                    borderRadius: '32px',
                    border: '1px solid #333',
                    maxWidth: '28rem',
                    width: '100%',
                    minHeight: '26rem',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
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
                            background: type === "save" ? 'rgba(30, 215, 96, 0.1)' : type === "danger" ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                            border: type === "save" ? '1px solid rgba(30, 215, 96, 0.3)' : type === "danger" ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.3)',
                        }}>
                            {type === "save" ? (
                                <Save size={32} color="#1ED760" />
                            ) : type === "danger" ? (
                                <Trash2 size={32} color="#EF4444" />
                            ) : (
                                <Copy size={32} color="white" />
                            )}
                        </div>
                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: 'white',
                            textAlign: 'center',
                        }}>
                            {title}
                        </h2>
                    </div>
                </div>

                {/* Message */}
                <div style={{ padding: '1.5rem' }}>
                    <p style={{
                        color: '#D1D5DB',
                        textAlign: 'center',
                        fontSize: '1rem',
                        lineHeight: '1.75',
                    }}>
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="px-6 pt-8 pb-24 flex justify-center" style={{ gap: '2rem' }}>
                    <button
                        onClick={onClose}
                        className="btn-secondary btn-md uppercase tracking-wider font-bold"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`btn-md uppercase tracking-wider font-bold ${type === "save"
                            ? 'btn-primary'
                            : type === "danger"
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'btn-accent'
                            }`}
                    >
                        Confirmer
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
