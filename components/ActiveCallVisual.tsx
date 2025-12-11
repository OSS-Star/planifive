import React from 'react';

interface ActiveCallVisualProps {
    isSelected: boolean;
}

const ActiveCallVisual = React.memo(({ isSelected }: ActiveCallVisualProps) => {
    return (
        <>
            {/* Layer 1: Rotating Gradient Border */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-[inherit]">
                <div
                    className="absolute -inset-[50%] animate-spin"
                    style={{
                        background: 'conic-gradient(from 0deg, transparent 0 50%, #5865F2 70%, #00C7FF 90%, #5865F2 100%)',
                        animationDuration: '3s',
                        opacity: 1
                    }}
                />
            </div>
            {/* Layer 2: Inner Background Color (Masking the center) */}
            <div
                className="absolute inset-[4px] z-10 pointer-events-none transition-colors duration-200"
                style={{ backgroundColor: isSelected ? '#22c55e' : '#1A1A1A' }}
            />
        </>
    );
});

ActiveCallVisual.displayName = 'ActiveCallVisual';

export default ActiveCallVisual;
