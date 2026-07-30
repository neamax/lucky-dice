import { create } from 'zustand';
import Cookies from 'js-cookie';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

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
    peerId: string | null;
    isHost: boolean;
    connections: DataConnection[];

    diceCount: number;
    diceResults: (number | null)[];
    isRolling: boolean;
    rollEvent: RollData | null;

    cursors: Record<string, CursorData>;
    lockedDice: number[];

    betAmount: number;
    betMultiplier: number;
    scores: Record<string, { tag: string; points: number }>;
    setBetAmount: (amount: number) => void;
    setBetMultiplier: (multiplier: number) => void;
    updateScore: (peerId: string, tag: string, delta: number) => void;

    boardModel: string;
    setBoardModel: (model: string) => void;
    boardVariants: Record<string, string | null>;
    setBoardVariant: (model: string, variant: string | null) => void;

    diceModel: string;
    setDiceModel: (model: string) => void;

    lockEnabled: boolean;
    toggleLockFeature: () => void;

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
}

export const useStore = create<GameState>((set, get) => ({
    gamerTag: '',
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
    lockedDice: [],
    betAmount: 100,
    betMultiplier: 1,
    scores: {},
    lockEnabled: Cookies.get('lockEnabled') !== 'false',

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
        const data = { type: 'CURSOR', id: get().peerId, tag: get().gamerTag, x, z };
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
        if (get().peerId) return;

        const peer = new Peer();

        const setupConnectionListeners = (conn: DataConnection) => {
            conn.on('open', () => {
                set((state) => ({ connections: [...state.connections, conn] }));
            });

            conn.on('close', () => {
                set((state) => ({ connections: state.connections.filter(c => c.peer !== conn.peer) }));
                get().removeCursor(conn.peer);
            });

            conn.on('data', (data: any) => {
                if (data.type === 'ROLL') {
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

        const { diceCount, lockedDice, diceResults, betAmount, betMultiplier, gamerTag, peerId } = get();
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
            rollerTag: gamerTag,
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