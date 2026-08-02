import { useEffect, useRef, useState } from 'react';
import React from 'react';
import { X } from 'lucide-react';
import { IconInfoCircle, IconAlertTriangle, IconCancel as IconXCircle } from '@tabler/icons-react';
import { cn } from 'src/lib/utils';
import { useStore } from 'src/store';

export interface Toast {
    id: string;
    variant: 'notif' | 'error' | 'warn';
    title: string;
    description?: string;
    duration?: number;
}

const variantStyles: Record<Toast['variant'], string> = {
    notif: 'border-gray-500/80 bg-gray-900/30 text-gray-200',
    error: 'border-primary/80 bg-primary/10 text-red-100',
    warn:  'border-amber-500/80 bg-amber-500/10 text-amber-300',
};

const iconStyles: Record<Toast['variant'], string> = {
    notif: 'text-gray-100',
    error: 'text-red-100',
    warn:  'text-amber-400',
};

const icons: Record<Toast['variant'], React.ReactNode> = {
    notif: <IconInfoCircle size={24} />,
    error: <IconXCircle size={24} />,
    warn:  <IconAlertTriangle size={24} />,
};

function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useStore(s => s.dismissToast);
    const [paused, setPaused] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (paused) return;
        timerRef.current = setTimeout(() => dismiss(toast.id), toast.duration ?? 8000);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [paused, toast.id, toast.duration, dismiss]);

    return (
        <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setPaused(false)}
            className={cn(
            'flex items-start gap-3 w-full rounded-2xl border backdrop-blur-xl px-4 py-3 shadow-xl',
            'animate-in slide-in-from-bottom-2 fade-in duration-200',
            variantStyles[toast.variant],
        )}>
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold', iconStyles[toast.variant])}>
                {icons[toast.variant]}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {toast.description && (
                    <p className="mt-1 text-xs opacity-75 leading-snug">{toast.description}</p>
                )}
            </div>
            <button
                onClick={() => dismiss(toast.id)}
                className="mt-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ToastContainer() {
    const toasts = useStore(s => s.toasts);
    const containerRef = useRef<HTMLDivElement>(null);
    const [opacities, setOpacities] = useState<Record<string, number>>({});

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const fadeLimit = window.innerHeight * 0.4;
        const fadeZone = window.innerHeight * 0.08;
        const children = Array.from(container.children) as HTMLElement[];
        const next: Record<string, number> = {};
        children.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const id = toasts[i]?.id;
            if (!id) return;
            if (rect.top >= fadeLimit) {
                next[id] = 1;
            } else if (rect.top <= fadeLimit - fadeZone) {
                next[id] = 0;
            } else {
                next[id] = (rect.top - (fadeLimit - fadeZone)) / fadeZone;
            }
        });
        setOpacities(next);
    }, [toasts]);

    if (!toasts.length) return null;

    return (
        <div ref={containerRef} className="fixed bottom-25 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] md:max-w-md pointer-events-auto">
            {toasts.map(t => (
                <div key={t.id} style={{ opacity: opacities[t.id] ?? 1, transition: 'opacity 0.75s', pointerEvents: (opacities[t.id] ?? 1) < 0.1 ? 'none' : 'auto' }}>
                    <ToastItem toast={t} />
                </div>
            ))}
        </div>
    );
}
