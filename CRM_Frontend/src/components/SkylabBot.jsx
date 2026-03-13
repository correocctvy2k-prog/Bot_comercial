import React, { useRef, useEffect, useState } from 'react';
import './SkylabBot.css';

/**
 * SkylabBot — réplica exacta del ícono Lucide <Bot> con animaciones sutiles:
 *   1. Cabeceo leve del SVG completo (CSS @keyframes)
 *   2. Parpadeo de los ojos (scaleY 1→0→1 via estado)
 *   3. Rotación lenta de la antena alrededor de la base (CSS @keyframes)
 *   4. Hover: escala 1.08 limpia, sin glows
 */
const SkylabBot = ({ size = 28, className = '' }) => {
    const blinkRef = useRef(null);
    const [isBlinking, setIsBlinking] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    /* Ciclo de parpadeo aleatorio */
    useEffect(() => {
        const schedule = () => {
            blinkRef.current = setTimeout(() => {
                setIsBlinking(true);
                setTimeout(() => {
                    setIsBlinking(false);
                    schedule();
                }, 160);
            }, 3000 + Math.random() * 4000);
        };
        schedule();
        return () => clearTimeout(blinkRef.current);
    }, []);

    return (
        /* Wrapper div: aplica el cabeceo para no interferir con el scale del hover */
        <div
            className={`skylab-bot-wrap ${isHovered ? 'hovered' : ''} ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ display: 'inline-block', lineHeight: 0 }}
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {/* ── Antena: path idéntico a Lucide Bot, rota alrededor de (12,8) ── */}
                <path
                    d="M12 8V4H8"
                    className="bot-antenna"
                />

                {/* ── Cabeza ── */}
                <rect x="4" y="8" width="16" height="12" rx="2" />

                {/* ── Orejas laterales ── */}
                <path d="M2 14h2" />
                <path d="M20 14h2" />

                {/* ── Ojos: líneas verticales (alargadas) que parpadean ── */}
                <path
                    d="M9 13v2"
                    style={{
                        transformOrigin: '9px 14px',   /* centro del ojo izquierdo */
                        transform: isBlinking ? 'scaleY(0)' : 'scaleY(1)',
                        transition: 'transform 0.14s ease',
                    }}
                />
                <path
                    d="M15 13v2"
                    style={{
                        transformOrigin: '15px 14px',  /* centro del ojo derecho  */
                        transform: isBlinking ? 'scaleY(0)' : 'scaleY(1)',
                        transition: 'transform 0.14s ease',
                    }}
                />
            </svg>
        </div>
    );
};

export default SkylabBot;
