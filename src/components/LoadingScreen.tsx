import { useEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { ProgressTrack, ProgressIndicator } from './ui/progress';
import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

export function LoadingScreen({ onDone, minDuration = 1000 }: { onDone: () => void; minDuration?: number }) {
    const { progress } = useProgress();
    const [fading, setFading] = useState(false);
    const [gone, setGone] = useState(false);
    const minTimerDone = useRef(minDuration === 0);
    const r3fDone = useRef(false);

    const tryFinish = () => {
        if (minTimerDone.current && r3fDone.current && !fading) {
            setFading(true);
            setTimeout(() => { setGone(true); onDone(); }, 500);
        }
    };

    useEffect(() => {
        if (minDuration === 0) return;
        const t = setTimeout(() => { minTimerDone.current = true; tryFinish(); }, minDuration);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (progress >= 100) { r3fDone.current = true; tryFinish(); }
    }, [progress]);

    if (gone) return null;

    return (
        <div
            className={`fixed inset-0 z-150 flex flex-col items-center justify-center transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}
            style={{ backgroundColor: '#1a1a1a' }}
        >
            <div className="flex flex-col items-center justify-center gap-4 w-64">
                <div className="flex items-center justify-center gap-2">
                    <img src="/favicon.png" alt="Lucky Dice" className="w-10 h-10" />
                    <span className="text-2xl font-bold tracking-tight text-white/80">Lucky Dice</span>
                </div>
                <ProgressPrimitive.Root value={progress} className="w-full">
                    <ProgressTrack>
                        <ProgressIndicator />
                    </ProgressTrack>
                </ProgressPrimitive.Root>
                <div className="flex flex-col items-center justify-center gap-0">
                    <span className="text-sm font-medium tracking-tight text-white/80">Developed by LuckyGene Indie Studio</span>
                    <span className="text-xs font-normal text-white/80">https://www.luckygene.net</span>
                </div>
            </div>
        </div>
    );
}
