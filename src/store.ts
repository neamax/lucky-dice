import { create } from 'zustand';
import Cookies from 'js-cookie';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { Toast } from './components/ui/toast';
import { getStartRotations, applyRemoteTransforms, dragFrameBuffer } from './Dice';

const MAX_PLAYERS = 10;
let peerInitialized = false;

interface RollData {
    id: number;
    impulses: { x: number, y: number, z: number }[];
    torques: { x: number, y: number, z: number }[];
    startPositions?: { x: number, y: number, z: number }[];
    startRotations?: { x: number, y: number, z: number, w: number }[];
    lockedIndices: number[];
    rollerTag: string;
    rollerPeerId: string;
    betAmount: number;
    betMultiplier: number;
}

export interface RollResultData {
    rollId: number;
    results: (number | null)[];
    finalPositions: { x: number, y: number, z: number }[];
    finalRotations: { x: number, y: number, z: number, w: number }[];
}

interface CursorData {
    x: number;
    z: number;
    tag: string;
}

export interface RoundResult {
    peerId: string;
    tag: string;
    sum: number;
    delta: number;
    hasPair?: boolean;
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
    rollResult: RollResultData | null;

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
    autoReroll: boolean;
    toggleAutoReroll: () => void;
    lastRollSum: number | null;
    prevRollSum: number | null;
    lastRollPair: boolean;
    showBettingPanel: boolean;
    toggleBettingPanel: () => void;

    // turn-based
    sessionActive: boolean;
    turnOrder: string[];
    currentTurnIndex: number;
    roundNumber: number;
    roundResults: RoundResult[];
    lastRoundResults: RoundResult[] | null;
    startSession: () => void;
    advanceTurn: (results: RoundResult[], nextIndex: number, roundNumber: number) => void;

    initializeSession: () => void;
    initializeNetwork: (roomId: string | null) => void;

    triggerLocalRoll: (strength?: number) => void;
    triggerFault: () => void;
    isDragging: boolean;
    startDiceDrag: () => void;
    endDiceDrag: () => void;
    setDiceResult: (index: number, result: number) => void;
    receiveRemoteRoll: (data: RollData) => void;
    receiveDiceFrame: (transforms: { px: number, py: number, pz: number, rx: number, ry: number, rz: number, rw: number }[], drag?: boolean) => void;
    receiveRollResult: (data: RollResultData) => void;
    broadcastRollResult: (data: RollResultData) => void;
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

function getPairMultiplier(results: (number | null)[]): number {
    const vals = results.filter((v): v is number => v !== null);
    if (vals.length < 2) return 1;
    const allSame = vals.every(v => v === vals[0]);
    return allSame ? vals[0] : 1;
}

function buildRoundEnd(results: RoundResult[], betAmount: number, betMultiplier: number, pairMult: number) {
    // sort: higher sum wins; on tie, hasPair wins
    const sorted = [...results].sort((a, b) =>
        b.sum !== a.sum ? b.sum - a.sum : (b.hasPair ? 1 : 0) - (a.hasPair ? 1 : 0)
    );
    const winner = sorted[0];
    const isTrueTie = sorted.length > 1 && sorted[1].sum === winner.sum && !!sorted[1].hasPair === !!winner.hasPair;
    const stake = betAmount * betMultiplier * pairMult;
    const pot = stake * results.length;
    return results.map(r => ({
        ...r,
        delta: isTrueTie ? 0 : r.peerId === winner.peerId ? pot - stake : -stake,
    }));
}

// MARK: Store
export const useStore = create<GameState>((set, get) => ({
    gamerTag: '',
    displayName: Cookies.get('displayName') || '',
    peerId: null,
    isHost: false,
    connections: [],

    boardModel: Cookies.get('boardModel') || '/board.glb',
    boardVariants: JSON.parse(Cookies.get('boardVariants') || 'null') ?? { '/board.glb': 'concrete_tile_facade_1k', '/board-2.glb': 'concrete_tile_facade_1k' },
    diceModel: Cookies.get('diceModel') || '/dice.glb',
    diceCount: Number(Cookies.get('diceCount')) || 2,
    diceResults: Array(Number(Cookies.get('diceCount')) || 2).fill(null),
    isRolling: false,
    rollEvent: null,
    rollResult: null,
    cursors: {},
    playerNames: {},
    lockedDice: [],
    betAmount: 100,
    betMultiplier: 1,
    scores: {},
    lockEnabled: Cookies.get('lockEnabled') === 'true',
    autoReroll: Cookies.get('autoReroll') === 'true',
    lastRollSum: null,
    prevRollSum: null,
    lastRollPair: false,
    showBettingPanel: Cookies.get('showBettingPanel') !== 'false',
    isDragging: false,
    toasts: [],

    sessionActive: false,
    turnOrder: [],
    currentTurnIndex: 0,
    roundNumber: 0,
    roundResults: [],
    lastRoundResults: null,

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
        set({ scores: {}, sessionActive: false, turnOrder: [], currentTurnIndex: 0, roundNumber: 0, roundResults: [], lastRoundResults: null });
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
        const data = { type: 'APPEARANCE', boardModel: model, boardVariants: get().boardVariants, diceModel: get().diceModel };
        get().connections.forEach((conn) => conn.send(data));
    },

    setBoardVariant: (model, variant) => {
        const next = { ...get().boardVariants, [model]: variant };
        Cookies.set('boardVariants', JSON.stringify(next), { expires: 365, sameSite: 'strict' });
        set({ boardVariants: next });
        const data = { type: 'APPEARANCE', boardModel: get().boardModel, boardVariants: next, diceModel: get().diceModel };
        get().connections.forEach((conn) => conn.send(data));
    },

    setDiceModel: (model) => {
        Cookies.set('diceModel', model, { expires: 365, sameSite: 'strict' });
        set({ diceModel: model });
        const data = { type: 'APPEARANCE', boardModel: get().boardModel, boardVariants: get().boardVariants, diceModel: model };
        get().connections.forEach((conn) => conn.send(data));
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
        set({ lockEnabled: newState, lockedDice: [] });
        const data = { type: 'TOGGLE_LOCK_FEATURE', lockEnabled: newState };
        get().connections.forEach((conn) => conn.send(data));
    },

    toggleAutoReroll: () => {
        const newState = !get().autoReroll;
        Cookies.set('autoReroll', String(newState), { expires: 365, sameSite: 'strict' });
        set({ autoReroll: newState });
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
        set({ diceCount: count, diceResults: Array(count).fill(null), rollEvent: null, lockedDice: [] });
        get().connections.forEach((conn) => conn.send({ type: 'SETTING_DICE_COUNT', count }));
    },

    startSession: () => {
        const { peerId, connections, displayName, gamerTag, playerNames } = get();
        if (!peerId) return;
        const order = [peerId, ...connections.map(c => c.peer)];
        // reset scores for all players in the session
        const freshScores: Record<string, { tag: string; points: number }> = {};
        order.forEach(id => {
            const tag = id === peerId ? (displayName || gamerTag) : (playerNames[id] || id);
            freshScores[id] = { tag, points: 0 };
        });
        set({
            sessionActive: true,
            turnOrder: order,
            currentTurnIndex: 0,
            roundNumber: 1,
            roundResults: [],
            lastRoundResults: null,
            scores: freshScores,
            diceResults: Array(get().diceCount).fill(null),
            rollEvent: null,
            lockedDice: [],
            isRolling: false,
            showBettingPanel: true,
        });
        const msg = { type: 'SESSION_START', turnOrder: order, roundNumber: 1, scores: freshScores };
        connections.forEach(c => c.send(msg));
        const currentTag = playerNames[order[0]] || displayName || gamerTag;
        get().pushToast({ variant: 'notif', title: 'Session started', description: `${currentTag}'s turn` });
    },

    advanceTurn: (results, nextIndex, roundNumber) => {
        set({ roundResults: [], currentTurnIndex: nextIndex, roundNumber, lastRoundResults: results });
    },

    initializeNetwork: (roomId) => {
        if (peerInitialized) return;
        peerInitialized = true;

        const peer = new Peer();

        const setupConnectionListeners = (conn: DataConnection) => {
            conn.on('open', () => {
                const { connections, peerId, displayName, gamerTag, boardModel, boardVariants, diceModel,
                    sessionActive, turnOrder, currentTurnIndex, roundNumber, scores, playerNames } = get();

                // enforce max players (host side)
                if (get().isHost && connections.length >= MAX_PLAYERS - 1) {
                    conn.send({ type: 'FULL' });
                    conn.close();
                    return;
                }

                // reset solo scores when first multiplayer connection opens
                if (get().isHost && connections.length === 0) {
                    set({ scores: {}, lastRollSum: null, prevRollSum: null });
                }

                set((state) => ({ connections: [...state.connections, conn] }));


                conn.send({
                    type: 'HELLO',
                    tag: displayName || gamerTag,
                    boardModel, boardVariants, diceModel,
                    sessionActive, turnOrder, currentTurnIndex, roundNumber, scores, playerNames,
                    peerId,
                });

                // auto-start session when a player joins
                if (get().isHost) {
                    setTimeout(() => get().startSession(), 100);
                }
            });

            conn.on('close', () => {
                const { playerNames, sessionActive, turnOrder, currentTurnIndex, isHost, connections: conns } = get();
                const tag = playerNames[conn.peer] ?? conn.peer;

                const newConnections = conns.filter(c => c.peer !== conn.peer);
                const newPlayerNames = Object.fromEntries(Object.entries(playerNames).filter(([k]) => k !== conn.peer));
                set({ connections: newConnections, playerNames: newPlayerNames });
                get().removeCursor(conn.peer);
                get().pushToast({ variant: 'warn', title: 'Player left', description: `${tag} has left the session.` });

                // if session active and it was their turn, skip to next
                if (isHost && sessionActive) {
                    const newOrder = turnOrder.filter(id => id !== conn.peer);
                    if (newOrder.length === 0) {
                        set({ sessionActive: false, turnOrder: [] });
                        return;
                    }
                    const nextIndex = currentTurnIndex >= newOrder.length ? 0 : currentTurnIndex;
                    set({ turnOrder: newOrder, currentTurnIndex: nextIndex });
                    newConnections.forEach(c => c.send({ type: 'TURN_STATE', turnOrder: newOrder, currentTurnIndex: nextIndex, roundNumber: get().roundNumber }));
                }
            });

            conn.on('data', (data: any) => {
                const { isHost, connections: conns, peerId, displayName, gamerTag } = get();

                if (data.type === 'HELLO') {
                    set((state) => ({ playerNames: { ...state.playerNames, [conn.peer]: data.tag } }));
                    get().pushToast({ variant: 'notif', title: 'Player joined', description: `${data.tag} has joined the session.` });
                    // guest syncs from host's HELLO
                    if (!get().isHost && data.boardModel) {
                        set({
                            boardModel: data.boardModel,
                            boardVariants: data.boardVariants,
                            diceModel: data.diceModel,
                            sessionActive: data.sessionActive,
                            turnOrder: data.turnOrder ?? [],
                            currentTurnIndex: data.currentTurnIndex ?? 0,
                            roundNumber: data.roundNumber ?? 1,
                            scores: data.scores ?? {},
                            playerNames: { ...get().playerNames, ...data.playerNames },
                        });
                    }

                } else if (data.type === 'FULL') {
                    get().pushToast({ variant: 'warn', title: 'Session full', description: 'This session has reached the maximum of 10 players.' });
                    conn.close();
                    set({ connections: [], isHost: true });

                } else if (data.type === 'APPEARANCE') {
                    if (!get().isHost) {
                        set({ boardModel: data.boardModel, boardVariants: data.boardVariants, diceModel: data.diceModel });
                    }

                } else if (data.type === 'SESSION_START') {
                    set({
                        sessionActive: true,
                        turnOrder: data.turnOrder,
                        currentTurnIndex: 0,
                        roundNumber: data.roundNumber,
                        roundResults: [],
                        lastRoundResults: null,
                        scores: data.scores ?? {},
                        diceResults: Array(get().diceCount).fill(null),
                        rollEvent: null,
                        lockedDice: [],
                        isRolling: false,
                        showBettingPanel: true,
                    });
                    const firstId = data.turnOrder[0];
                    const firstName = get().playerNames[firstId] || (firstId === peerId ? (displayName || gamerTag) : firstId);
                    get().pushToast({ variant: 'notif', title: 'Session started', description: `${firstName}'s turn` });

                } else if (data.type === 'TURN_STATE') {
                    set({ turnOrder: data.turnOrder, currentTurnIndex: data.currentTurnIndex, roundNumber: data.roundNumber });

                } else if (data.type === 'ROUND_RESULT') {
                    if (isHost) {
                        const { roundResults: rr, turnOrder: to, currentTurnIndex: cti,
                            roundNumber: rn, betAmount: ba, betMultiplier: bm } = get();
                        const isFault = !!data.fault;
                        const newResults = [...rr, { peerId: data.peerId, tag: data.tag, sum: isFault ? 0 : data.sum, delta: 0, hasPair: !isFault && !!data.hasPair }];
                        if (isFault) get().updateScore(data.peerId, data.tag, -(ba * bm));

                        if (newResults.length === to.length) {
                            const pairMult = 1; // multiplayer: host doesn't have individual dice results per player here
                            const finalResults = buildRoundEnd(newResults, ba, bm, pairMult);
                            finalResults.forEach(r => get().updateScore(r.peerId, r.tag, r.delta));
                            const nextRound = rn + 1;
                            set({ roundResults: [], currentTurnIndex: 0, roundNumber: nextRound, lastRoundResults: finalResults });
                            const msg = { type: 'ROUND_END', results: finalResults, scores: get().scores, nextTurnIndex: 0, roundNumber: nextRound };
                            conns.forEach(c => c.send(msg));
                        } else {
                            const nextIdx = (cti + 1) % to.length;
                            set({ roundResults: newResults, currentTurnIndex: nextIdx });
                            conns.forEach(c => c.send({ type: 'TURN_STATE', turnOrder: to, currentTurnIndex: nextIdx, roundNumber: rn }));
                        }
                    }

                } else if (data.type === 'ROUND_END') {
                    set({
                        scores: data.scores,
                        lastRoundResults: data.results,
                        roundResults: [],
                        currentTurnIndex: data.nextTurnIndex,
                        roundNumber: data.roundNumber,
                    });
                    if (isHost) {
                        conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }

                } else if (data.type === 'KICKED') {
                    get().connections.forEach(c => c.close());
                    set({ connections: [], cursors: {}, playerNames: {}, sessionActive: false, turnOrder: [] });

                } else if (data.type === 'FAULT') {
                    get().pushToast({ variant: 'error', title: '⚠️ Fault!', description: `${data.tag}'s dice left the table.` });
                    set({ isRolling: false, diceResults: Array(get().diceCount).fill(null), rollEvent: null, lockedDice: [] });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });

                } else if (data.type === 'ROLL') {
                    get().receiveRemoteRoll(data.rollData);
                    if (isHost) {
                        conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }

                } else if (data.type === 'DICE_FRAME') {
                    get().receiveDiceFrame(data.transforms, data.drag);
                    if (isHost) {
                        conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }

                } else if (data.type === 'ROLL_RESULT') {
                    get().receiveRollResult(data.rollResultData);
                    if (isHost) {
                        conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
                    }

                } else if (data.type === 'SETTING_DICE_COUNT') {
                    set({ diceCount: data.count, diceResults: Array(data.count).fill(null), rollEvent: null, lockedDice: [] });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });

                } else if (data.type === 'TOGGLE_LOCK_FEATURE') {
                    set({ lockEnabled: data.lockEnabled, lockedDice: [] });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });

                } else if (data.type === 'TOGGLE_LOCK') {
                    set({ lockedDice: data.lockedDice });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });

                } else if (data.type === 'RESET_SCORES') {
                    set({ scores: {}, sessionActive: false, turnOrder: [], currentTurnIndex: 0, roundNumber: 0, roundResults: [], lastRoundResults: null });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });

                } else if (data.type === 'SCORE_UPDATE') {
                    set({ scores: data.scores });

                } else if (data.type === 'CURSOR') {
                    get().updateCursor(data.id, { x: data.x, z: data.z, tag: data.tag });
                    if (isHost) conns.forEach((c) => { if (c.peer !== conn.peer) c.send(data); });
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

    startDiceDrag: () => set({ isDragging: true }),
    endDiceDrag: () => set({ isDragging: false }),

    triggerFault: () => {
        const { peerId, gamerTag, displayName, betAmount, betMultiplier,
            connections, sessionActive, turnOrder, currentTurnIndex, roundNumber,
            roundResults, isHost, diceCount, updateScore, pushToast } = get();

        if (!peerId) return;
        const myTag = displayName || gamerTag;
        const penalty = -(betAmount * betMultiplier);

        pushToast({ variant: 'error', title: '⚠️ Fault!', description: `Dice left the table. ${Math.abs(penalty).toLocaleString()} point penalty.` });
        updateScore(peerId, myTag, penalty);

        // solo: reset dice to initial position
        if (connections.length === 0) {
            const resetRoll: RollData = {
                id: Date.now(),
                impulses: Array(diceCount).fill({ x: 0, y: 0, z: 0 }),
                torques: Array(diceCount).fill({ x: 0, y: 0, z: 0 }),
                lockedIndices: [],
                rollerTag: myTag,
                rollerPeerId: peerId!,
                betAmount,
                betMultiplier,
            };
            set({ isRolling: false, diceResults: Array(diceCount).fill(null), rollEvent: resetRoll, lockedDice: [] });
            if (get().autoReroll) setTimeout(() => get().triggerLocalRoll(), 600);
            return;
        }

        // broadcast fault to all peers so they reset rolling state
        connections.forEach(c => c.send({ type: 'FAULT', peerId, tag: myTag }));

        // multiplayer session: submit 0-sum result and advance turn
        if (sessionActive) {
            const newRoundResults = [...roundResults, { peerId, tag: myTag, sum: 0, delta: 0 }];
            set({ isRolling: false, diceResults: Array(diceCount).fill(null), rollEvent: null, lockedDice: [] });

            if (isHost) {
                if (newRoundResults.length === turnOrder.length) {
                    const finalResults = newRoundResults.map(r => ({ ...r, delta: r.peerId === peerId ? penalty : 0 }));
                    finalResults.forEach(r => { if (r.delta !== 0) updateScore(r.peerId, r.tag, r.delta); });
                    const nextRound = roundNumber + 1;
                    set({ roundResults: [], currentTurnIndex: 0, roundNumber: nextRound, lastRoundResults: finalResults });
                    const msg = { type: 'ROUND_END', results: finalResults, scores: get().scores, nextTurnIndex: 0, roundNumber: nextRound };
                    connections.forEach(c => c.send(msg));
                } else {
                    const nextIdx = (currentTurnIndex + 1) % turnOrder.length;
                    set({ roundResults: newRoundResults, currentTurnIndex: nextIdx });
                    connections.forEach(c => c.send({ type: 'TURN_STATE', turnOrder, currentTurnIndex: nextIdx, roundNumber }));
                }
            } else {
                connections.forEach(c => c.send({ type: 'ROUND_RESULT', peerId, tag: myTag, sum: 0, fault: true }));
            }
        }
    },

    receiveRemoteRoll: (rollData) => {
        const { diceCount, diceResults } = get();
        const newResults = [...diceResults];
        const lockedIndices = rollData.lockedIndices ?? [];
        for (let i = 0; i < diceCount; i++) {
            if (!lockedIndices.includes(i)) newResults[i] = null;
        }
        dragFrameBuffer.length = 0;
        // sync remote roll event and locked dice state across connected peers
        set({ isRolling: true, lockedDice: lockedIndices, diceResults: newResults, rollEvent: rollData });
    },

    receiveDiceFrame: (transforms, drag = false) => {
        applyRemoteTransforms(transforms, drag);
    },

    receiveRollResult: (data) => {
        set({ rollResult: data, diceResults: data.results, isRolling: false });
    },

    broadcastRollResult: (data) => {
        set({ rollResult: data });
        get().connections.forEach(c => c.send({ type: 'ROLL_RESULT', rollResultData: data }));
    },

    triggerLocalRoll: (strength = 1) => {
        if (get().isRolling) return;

        const { sessionActive, turnOrder, currentTurnIndex, peerId, connections } = get();

        // only allow rolling on your turn
        if (sessionActive && connections.length > 0) {
            if (turnOrder[currentTurnIndex] !== peerId) return;
        }

        const { diceCount, lockedDice, diceResults, betAmount, betMultiplier, gamerTag, displayName } = get();
        const rollerTag = displayName || gamerTag;
        const impulses = [];
        const torques = [];
        const startPositions = [];
        const newResults = [...diceResults];

        for (let i = 0; i < diceCount; i++) {
            const offset = (i - (diceCount - 1) / 2) * 2;
            startPositions.push({ x: offset, y: 3, z: 0 });

            if (lockedDice.includes(i)) {
                impulses.push({ x: 0, y: 0, z: 0 });
                torques.push({ x: 0, y: 0, z: 0 });
            } else {
                newResults[i] = null;
                const s = 0.4 + strength * 0.6;
                impulses.push({
                    x: (Math.random() - 0.5) * 8 * s,
                    y: (12 + Math.random() * 5) * s,
                    z: (Math.random() - 0.5) * 8 * s,
                });
                torques.push({
                    x: (Math.random() - 0.5) * 10 * s,
                    y: (Math.random() - 0.5) * 10 * s,
                    z: (Math.random() - 0.5) * 10 * s,
                });
            }
        }

        const rollData: RollData = {
            id: Date.now(),
            impulses,
            torques,
            startPositions,
            startRotations: getStartRotations(diceCount, lockedDice),
            lockedIndices: lockedDice,
            rollerTag,
            rollerPeerId: peerId!,
            betAmount,
            betMultiplier,
        };

        set({ isRolling: true, diceResults: newResults, rollEvent: rollData });
        // broadcast roll physics data to all connected peers
        get().connections.forEach((conn) => conn.send({ type: 'ROLL', rollData }));
    },

    setDiceResult: (index, result) => {
        if (!get().isRolling) return;

        const { lockedDice, diceResults, rollEvent, peerId, gamerTag, displayName,
            updateScore, connections, isHost, sessionActive, turnOrder, currentTurnIndex,
            roundNumber, roundResults, betAmount, betMultiplier } = get();

        if (lockedDice.includes(index)) return;

        const newResults = [...diceResults];
        newResults[index] = result;
        const finished = newResults.every((r, i) => lockedDice.includes(i) || r !== null);
        set({ diceResults: newResults, isRolling: !finished });

        if (!finished || !rollEvent) return;

        const myTag = displayName || gamerTag;
        const sum = newResults.reduce<number>((acc, v) => acc + (v ?? 0), 0);

        // solo play
        if (connections.length === 0) {
            const prev = get().lastRollSum;
            const prevPair = get().lastRollPair;
            const pairMult = getPairMultiplier(newResults);
            const hasPair = pairMult > 1;
            set({ prevRollSum: prev, lastRollSum: sum, lastRollPair: hasPair });
            const stake = betAmount * betMultiplier * pairMult;
            // pair wins a tie
            const winsOnTie = hasPair && !prevPair;
            const delta = prev === null ? 0
                : sum > prev ? stake
                : sum < prev ? -stake
                : winsOnTie ? stake
                : 0;
            if (delta !== 0) updateScore(peerId!, myTag, delta);
            return;
        }

        // turn-based multiplayer
        if (sessionActive) {
            // scope round outcome submission to active roller
            const isRoller = rollEvent.rollerPeerId === peerId;
            if (!isRoller) return;

            const newRoundResults = [...roundResults, { peerId: peerId!, tag: myTag, sum, delta: 0 }];

            if (isHost) {
                if (newRoundResults.length === turnOrder.length) {
                    const pairMult = getPairMultiplier(newResults);
                    const hasPair = pairMult > 1;
                    const resultsWithPair = newRoundResults.map((r, idx) =>
                        idx === newRoundResults.length - 1 ? { ...r, hasPair } : r
                    );
                    const finalResults = buildRoundEnd(resultsWithPair, betAmount, betMultiplier, pairMult);
                    finalResults.forEach(r => updateScore(r.peerId, r.tag, r.delta));
                    const nextRound = roundNumber + 1;
                    set({ roundResults: [], currentTurnIndex: 0, roundNumber: nextRound, lastRoundResults: finalResults });
                    const msg = { type: 'ROUND_END', results: finalResults, scores: get().scores, nextTurnIndex: 0, roundNumber: nextRound };
                    connections.forEach(c => c.send(msg));
                } else {
                    const nextIdx = (currentTurnIndex + 1) % turnOrder.length;
                    set({ roundResults: newRoundResults, currentTurnIndex: nextIdx });
                    connections.forEach(c => c.send({ type: 'TURN_STATE', turnOrder, currentTurnIndex: nextIdx, roundNumber }));
                }
            } else {
                const hasPair = getPairMultiplier(newResults) > 1;
                connections.forEach(c => c.send({ type: 'ROUND_RESULT', peerId: peerId!, tag: myTag, sum, hasPair }));
            }
            return;
        }

        // non-session multiplayer (legacy free-roll)
        if (!isHost) return;
        const prize = rollEvent.betAmount * rollEvent.betMultiplier;
        const loserPenalty = -(rollEvent.betAmount);
        const allPeers = [{ peerId: rollEvent.rollerPeerId, tag: rollEvent.rollerTag }];
        connections.forEach((c) => {
            if (c.peer !== rollEvent.rollerPeerId)
                allPeers.push({ peerId: c.peer, tag: get().cursors[c.peer]?.tag ?? c.peer });
        });
        allPeers.forEach(({ peerId: pid, tag }) => updateScore(pid, tag, pid === rollEvent.rollerPeerId ? prize : loserPenalty));
        connections.forEach((c) => c.send({ type: 'SCORE_UPDATE', scores: get().scores }));
    },
}));
