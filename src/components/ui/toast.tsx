import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from 'src/lib/utils';
import { useStore } from 'src/store';

export interface Toast {
    id: string;
    variant: 'notif' | 'alert' | 'warn';
    title: string;
    description?: string;
    duration?: number;
}

const variantStyles: Record<Toast['variant'], string> = {
    notif: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
    alert: 'border-red-500/40 bg-red-500/10 text-red-200',
    warn:  'border-amber-500/40 bg-amber-500/10 text-amber-200',
};

const iconStyles: Record<Toast['variant'], string> = {
    notif: 'bg-blue-500/20 text-blue-300',
    alert: 'bg-red-500/20 text-red-300',
    warn:  'bg-amber-500/20 text-amber-300',
};

const icons: Record<Toast['variant'], string> = {
    notif: 'ℹ',
    alert: '✕',
    warn:  '⚠',
};

function ToastItem({ toast }: { toast: Toast }) {
    const dismiss = useStore(s => s.dismissToast);

    useEffect(() => {
        const t = setTimeout(() => dismiss(toast.id), toast.duration ?? 5000);
        return () => clearTimeout(t);
    }, [toast.id, toast.duration, dismiss]);

    return (
        <div className={cn(
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
                    <p className="mt-0.5 text-xs opacity-75 leading-snug">{toast.description}</p>
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
    if (!toasts.length) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] md:max-w-7xl pointer-events-auto">
            {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
        </div>
    );
}
