import { create } from 'zustand';
import Cookies from 'js-cookie';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Toast } from './components/ui/toast';

let peerInitialized = false;

interface RollData {
    id: number;
    impulses: { x: number, y: number, z: number }[];
    torques: { x: number, y: number, z: number }[];
    lockedIndices: number[];
    rollerTag: string;
    rollerPeerId: string;
    betAmount: number;
    betMultiplier: number;
}

interface CursorData {
    x: number;
    z: number;
    tag: string;
}

interface GameState {
    gamerTag: string;
    displayName: string;
    setDisplayName: (name: string) => void;
    peerId: string | null;
    isHost: boolean;
    connections: DataConnection[];

    diceCount: number;
    diceResults: (number | null)[];
    isRolling: boolean;
    rollEvent: RollData | null;

    cursors: Record<string, CursorData>;
    playerNames: Record<string, string>;
    lockedDice: number[];

    betAmount: number;
    betMultiplier: number;
    scores: Record<string, { tag: string; points: number }>;
    setBetAmount: (amount: number) => void;
    setBetMultiplier: (multiplier: number) => void;
    updateScore: (peerId: string, tag: string, delta: number) => void;
    resetScores: () => void;

    boardModel: string;
    setBoardModel: (model: string) => void;
    boardVariants: Record<string, string | null>;
    setBoardVariant: (model: string, variant: string | null) => void;

    diceModel: string;
    setDiceModel: (model: string) => void;

    lockEnabled: boolean;
    toggleLockFeature: () => void;
    showBettingPanel: boolean;
    toggleBettingPanel: () => void;

    initializeSession: () => void;
    initializeNetwork: (roomId: string | null) => void;

    triggerLocalRoll: () => void;
    setDiceResult: (index: number, result: number) => void;
    receiveRemoteRoll: (data: RollData) => void;
    setDiceCount: (count: number) => void;
    toggleLockDie: (index: number) => void;

    updateCursor: (id: string, data: CursorData) => void;
    removeCursor: (id: string) => void;
    broadcastCursor: (x: number, z: number) => void;
    kickPlayer: (peerId: string) => void;

    toasts: Toast[];
    pushToast: (toast: Omit<Toast, 'id'>) => void;
    dismissToast: (id: string) => void;
}

export const useStore = create<GameState>((set, get) => ({
    gamerTag: '',
    displayName: Cookies.get('displayName') || '',
    peerId: null,
    isHost: false,
    connections: [],

    boardModel: Cookies.get('boardModel') || '/board.glb',
    boardVariants: JSON.parse(Cookies.get('boardVariants') || 'null') ?? { '/board.glb': null, '/board-2.glb': null },
    diceModel: Cookies.get('diceModel') || '/dice.glb',
    diceCount: Number(Cookies.get('diceCount')) || 2,
    diceResults: Array(Number(Cookies.get('diceCount')) || 2).fill(null),
    isRolling: false,
    rollEvent: null,
    cursors: {},
    playerNames: {},
    lockedDice: [],
    betAmount: 100,
    betMultiplier: 1,
    scores: {},
    lockEnabled: Cookies.get('lockEnabled') !== 'false',
    showBettingPanel: false,
    toasts: [],

    setDisplayName: (name) => {
        Cookies.set('displayName', name, { expires: 365, sameSite: 'strict' });
        set({ displayName: name });
    },

    initializeSession: () => {
        let tag = Cookies.get('gamerTag');
        if (!tag) {
            tag = `Player_${Math.floor(Math.random() * 10000)}`;
            Cookies.set('gamerTag', tag, { expires: 365, sameSite: 'strict' });
        }
        set({ gamerTag: tag });
    },

    setBetAmount: (amount) => set({ betAmount: amount }),
    setBetMultiplier: (multiplier) => set({ betMultiplier: multiplier }),

    resetScores: () => {
        set({ scores: {} });
        get().connections.forEach((conn) => conn.send({ type: 'RESET_SCORES' }));
    },

    updateScore: (peerId, tag, delta) => {
        set((state) => ({
            scores: {
                ...state.scores,
                [peerId]: {
                    tag,
                    points: (state.scores[peerId]?.points ?? 0) + delta,
                },
            },
        }));
    },

    setBoardModel: (model) => {
        Cookies.set('boardModel', model, { expires: 365, sameSite: 'strict' });
        set({ boardModel: model });
    },

    setBoardVariant: (model, variant) => {
        const next = { ...get().boardVariants, [model]: variant };
        Cookies.set('boardVariants', JSON.stringify(next), { expires: 365, sameSite: 'strict' });
        set({ boardVariants: next });
    },

    setDiceModel: (model) => {
        Cookies.set('diceModel', model, { expires: 365, sameSite: 'strict' });
        set({ diceModel: model });
    },

    toggleBettingPanel: () => {
        const next = !get().showBettingPanel;
        Cookies.set('showBettingPanel', String(next), { expires: 365, sameSite: 'strict' });
        set({ showBettingPanel: next });
    },

    toggleLockFeature: () => {
        if (get().isRolling) return;
        const newState = !get().lockEnabled;
        Cookies.set('lockEnabled', String(newState), { expires: 365, sameSite: 'strict' });

        set({
            lockEnabled: newState,
            lockedDice: []
        });

        const data = { type: 'TOGGLE_LOCK_FEATURE', lockEnabled: newState };
        get().connections.forEach((conn) => conn.send(data));
    },

    toggleLockDie: (index) => {
        if (!get().lockEnabled || get().isRolling || get().diceResults[index] === null) return;

        const currentLocked = get().lockedDice;
        const newLocked = currentLocked.includes(index)
            ? currentLocked.filter(i => i !== index)
            : [...currentLocked, index];

        set({ lockedDice: newLocked });

        const data = { type: 'TOGGLE_LOCK', lockedDice: newLocked };
        get().connections.forEach((conn) => conn.send(data));
    },

    kickPlayer: (pid) => {
        const conn = get().connections.find(c => c.peer === pid);
        conn?.send({ type: 'KICKED' });
        conn?.close();
    },

    pushToast: (toast) => {
        const id = `${Date.now()}-${Math.random()}`;
        set(state => ({ toasts: [...state.toasts, { ...toast, id }] }));
    },

    dismissToast: (id) => {
        set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    },

    updateCursor: (id, data) => {
        set((state) => ({ cursors: { ...state.cursors, [id]: data } }));
    },

    removeCursor: (id) => {
        set((state) => {
            const newCursors = { ...state.cursors };
            delete newCursors[id];
            return { cursors: newCursors };
        });
    },

    broadcastCursor: (x, z) => {
        const data = { type: 'CURSOR', id: get().peerId, tag: get().displayName || get().gamerTag, x, z };
        get().connections.forEach((conn) => conn.send(data));
    },

    setDiceCount: (count) => {
        if (get().isRolling) return;
        Cookies.set('diceCount', String(count), { expires: 365, sameSite: 'strict' });

        set({
            diceCount: count,
            diceResults: Array(count).fill(null),
            rollEvent: null,
            lockedDice: []
        });

        get().connections.forEach((conn) => conn.send({ type: 'SETTING_DICE_COUNT', count }));
    },

    initializeNetwork: (roomId) => {
        if (peerInitialized) return;
        peerInitialized = true;

        const peer = new Peer();

        const setupConnectionListeners = (conn: DataConnection) => {
            conn.on('open', () => {
                const wasEmpty = get().connections.length === 0;
                set((state) => ({ connections: [...state.connections, conn] }));
                if (wasEmpty) set({ showBettingPanel: true });
                // introduce ourselves
                conn.send({ type: 'HELLO', tag: get().displayName || get().gamerTag });
            });

            conn.on('close', () => {
                const tag = get().playerNames[conn.peer] ?? conn.peer;
                set((state) => ({
                    connections: state.connections.filter(c => c.peer !== conn.peer),
                    playerNames: Object.fromEntries(Object.entries(state.playerNames).filter(([k]) => k !== conn.peer)),
                }));
                get().removeCursor(conn.peer);
                get().pushToast({ variant: 'warn', title: 'Player left', description: `${tag} has left the session.` });
            });

            conn.on('data', (data: any) => {
                if (data.type === 'HELLO') {
                    set((state) => ({ playerNames: { ...state.playerNames, [conn.peer]: data.tag } }));
                    get().pushToast({ variant: 'notif', title: 'Player joined', description: `${data.tag} has joined the session.` });
                } else if (data.type === 'KICKED') {
                    get().connections.forEach(c => c.close());
                    set({ connections: [], cursors: {}, playerNames: {} });
                } else if (data.type === 'ROLL') {
                    get().receiveRemoteRoll(data.rollData);
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                } else if (data.type === 'SETTING_DICE_COUNT') {
                    set({ diceCount: data.count, diceResults: Array(data.count).fill(null), rollEvent: null, lockedDice: [] });
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                } else if (data.type === 'TOGGLE_LOCK_FEATURE') {
                    set({ lockEnabled: data.lockEnabled, lockedDice: [] });
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                } else if (data.type === 'TOGGLE_LOCK') {
                    set({ lockedDice: data.lockedDice });
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                } else if (data.type === 'RESET_SCORES') {
                    set({ scores: {} });
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                } else if (data.type === 'SCORE_UPDATE') {
                    set({ scores: data.scores });
                } else if (data.type === 'CURSOR') {
                    get().updateCursor(data.id, { x: data.x, z: data.z, tag: data.tag });
                    if (get().isHost) {
                        get().connections.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }
                }
            });
        };

        peer.on('open', (id) => {
            set({ peerId: id, isHost: !roomId });
            if (roomId) {
                const conn = peer.connect(roomId);
                setupConnectionListeners(conn);
            }
        });

        peer.on('connection', (conn) => {
            setupConnectionListeners(conn);
        });
    },

    receiveRemoteRoll: (rollData) => {
        const { diceCount, lockedDice, diceResults } = get();
        const newResults = [...diceResults];

        for (let i = 0; i < diceCount; i++) {
            if (!lockedDice.includes(i)) {
                newResults[i] = null;
            }
        }

        set({
            isRolling: true,
            diceResults: newResults,
            rollEvent: rollData
        });
    },

    triggerLocalRoll: () => {
        if (get().isRolling) return;

        const { diceCount, lockedDice, diceResults, betAmount, betMultiplier, gamerTag, displayName, peerId } = get();
        const rollerTag = displayName || gamerTag;
        const impulses = [];
        const torques = [];
        const newResults = [...diceResults];

        for (let i = 0; i < diceCount; i++) {
            if (lockedDice.includes(i)) {
                impulses.push({ x: 0, y: 0, z: 0 });
                torques.push({ x: 0, y: 0, z: 0 });
            } else {
                newResults[i] = null;
                impulses.push({
                    x: (Math.random() - 0.5) * 8,
                    y: 8 + Math.random() * 4,
                    z: (Math.random() - 0.5) * 8,
                });
                torques.push({
                    x: (Math.random() - 0.5) * 10,
                    y: (Math.random() - 0.5) * 10,
                    z: (Math.random() - 0.5) * 10,
                });
            }
        }

        const rollData: RollData = {
            id: Date.now(),
            impulses,
            torques,
            lockedIndices: lockedDice,
            rollerTag: rollerTag,
            rollerPeerId: peerId!,
            betAmount,
            betMultiplier,
        };

        set({ isRolling: true, diceResults: newResults, rollEvent: rollData });
        get().connections.forEach((conn) => conn.send({ type: 'ROLL', rollData }));
    },

    setDiceResult: (index, result) => {
        if (!get().isRolling) return;

        const { lockedDice, diceResults, rollEvent, peerId, gamerTag, updateScore, connections, isHost } = get();
        if (lockedDice.includes(index)) return;

        const newResults = [...diceResults];
        newResults[index] = result;

        const finished = newResults.every((r, i) => lockedDice.includes(i) || r !== null);

        set({ diceResults: newResults, isRolling: !finished });

        if (finished && rollEvent) {
            const prize = rollEvent.betAmount * rollEvent.betMultiplier;

            if (connections.length === 0) {
                updateScore(peerId!, gamerTag, prize);
                return;
            }

            if (!isHost) return;

            const allPeers: { peerId: string; tag: string }[] = [
                { peerId: rollEvent.rollerPeerId, tag: rollEvent.rollerTag },
            ];
            connections.forEach((c) => {
                if (c.peer !== rollEvent.rollerPeerId) {
                    const cursorData = get().cursors[c.peer];
                    allPeers.push({ peerId: c.peer, tag: cursorData?.tag ?? c.peer });
                }
            });

            // highest total wins; ties go to the roller
            // for now with dice sum: roller wins if their total is highest
            // (in multiplayer each player rolls independently — roller's result is what we have)
            // award roller the prize, others lose their bet
            const loserPenalty = -(rollEvent.betAmount);
            allPeers.forEach(({ peerId: pid, tag }) => {
                const delta = pid === rollEvent.rollerPeerId ? prize : loserPenalty;
                updateScore(pid, tag, delta);
            });

            // broadcast updated scores
            const scoreUpdate = { type: 'SCORE_UPDATE', scores: get().scores };
            connections.forEach((c) => c.send(scoreUpdate));
        }
    },
}));