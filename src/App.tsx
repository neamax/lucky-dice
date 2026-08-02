import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { Scene } from './Scene';
import { FloatingMenu } from './components/FloatingMenu';
import { ToastContainer } from './components/ui/toast';
import { IconSquareRoundedChevronRight, IconSquareRounded } from '@tabler/icons-react';
import { LoadingScreen } from './components/LoadingScreen';

function App() {
  const [loaded, setLoaded] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const prevVariantRef = useRef<string | null | undefined>(undefined);
  type PlayerResult = { results: (number | null)[]; total: number; isPair: boolean; pairMult: number };
  const playerResultsRef = useRef<Record<string, PlayerResult>>({});
  const [, forceUpdate] = useState(0);
  const { peerId,
    initializeSession,
    initializeNetwork,
    isRolling,
    diceResults,
    boardModel,
    boardVariants,
    betAmount,
    betMultiplier,
    setBetAmount,
    setBetMultiplier,
    scores,
    showBettingPanel,
    prevRollSum,
    lastRollPair,
    turnOrder,
    currentTurnIndex,
    roundNumber,
    connections,
    displayName,
    gamerTag,
    rollEvent,
  } = useStore();

  const currentVariant = boardVariants[boardModel] ?? null;
  const myTag = displayName || gamerTag;
  const currentTurnPeerId = connections.length === 0 ? peerId : turnOrder[currentTurnIndex];
  const resultPeerId = rollEvent?.rollerPeerId ?? currentTurnPeerId;
  const soloScores: typeof scores = connections.length === 0 && peerId
    ? { [peerId]: { tag: myTag, points: scores[peerId]?.points ?? 0 } }
    : scores;

  useEffect(() => {
    if (prevVariantRef.current === undefined) { prevVariantRef.current = currentVariant; return; }
    if (currentVariant !== prevVariantRef.current) {
      prevVariantRef.current = currentVariant;
      setVariantLoading(true);
    }
  }, [currentVariant]);

  useEffect(() => {
    initializeSession();
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    initializeNetwork(roomId);
  }, [initializeSession, initializeNetwork]);

  // snapshot each player's result when they finish rolling
  useEffect(() => {
    const allFilled = diceResults.every(r => r !== null) && diceResults.length > 0;
    if (!isRolling && allFilled && rollEvent?.rollerPeerId) {
      const filled = diceResults.filter((v): v is number => v !== null);
      const isPair = filled.length >= 2 && filled.every(v => v === filled[0]);
      playerResultsRef.current = {
        ...playerResultsRef.current,
        [rollEvent.rollerPeerId]: {
          results: diceResults,
          total: filled.reduce((s, v) => s + v, 0),
          isPair,
          pairMult: isPair ? filled[0] : 1,
        },
      };
      forceUpdate(n => n + 1);
    }
  }, [diceResults, isRolling, rollEvent]);

  // clear all results when the first player of a new round starts rolling
  const prevRoundRef = useRef(roundNumber);
  useEffect(() => {
    if (isRolling && roundNumber !== prevRoundRef.current) {
      prevRoundRef.current = roundNumber;
      playerResultsRef.current = {};
      forceUpdate(n => n + 1);
    }
  }, [isRolling, roundNumber]);

  return (
    <>
      {!loaded && <LoadingScreen onDone={() => setLoaded(true)} minDuration={3000} />}
      {variantLoading && <LoadingScreen onDone={() => setVariantLoading(false)} />}
      {/* DEV: Toast Message testing */}
      {/* <div className="fixed bottom-4 left-1 z-50">
        <button
          onClick={() => useStore.getState().pushToast({ duration: 80000, variant: 'notif', title: 'Test notification', description: 'This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast This is a test toast ' })}
          className=" bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm cursor-pointer"
        >
          Notif Toast
        </button>
        <button
          onClick={() => useStore.getState().pushToast({ duration: 80000, variant: 'error', title: 'Test notification', description: 'This is a test toast' })}
          className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm cursor-pointer"
        >
          Error Toast
        </button>
        <button
          onClick={() => useStore.getState().pushToast({ duration: 80000, variant: 'warn', title: 'Test notification', description: 'This is a test toast' })}
          className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm cursor-pointer"
        >
          Warn Toast
        </button>
      </div> */}
      <FloatingMenu />
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col p-2 z-10 text-white">

        <header className="w-full flex flex-col gap-2 justify-center items-center md:items-end pointer-events-none">
          {/* MARK: bet panel */}
          <div className="flex flex-col items-end max-md:w-full gap-2 pointer-events-auto">
            {showBettingPanel && (
              <div className="flex flex-col gap-1 bg-neutral-900/50 max-md:w-full rounded rounded-3xl backdrop-blur-xl p-3 shadow-lg">
                <div className='flex justify-between gap-1'>
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-100 text-xs uppercase">Pot</span>
                    <input
                      type="number"
                      min={1}
                      value={betAmount}
                      onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
                      disabled={isRolling}
                      className="w-25 bg-black/40 rounded rounded-3xl backdrop-blur-xl px-2 py-1 text-sm text-white text-right outline-none disabled:opacity-50"
                    />
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 4, 8, 20].map((m) => (
                      <button
                        key={m}
                        onClick={() => setBetMultiplier(m)}
                        disabled={isRolling}
                        className={`px-2 py-1 border text-xs font-bold rounded transition-colors ${betMultiplier === m
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600 cursor-pointer'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {m}x
                      </button>
                    ))}
                  </div>
                </div>

                <>
                  <div className="w-full h-px bg-neutral-700" />
                  <div className="flex justify-between">
                    <div className="text-neutral-100 text-xs">Scores &mdash; Round {roundNumber}</div>
                    <div className="text-amber-400 font-bold text-xs">CURRET POT SUM: {(betAmount * betMultiplier).toLocaleString()}$</div>
                  </div>
                  {Object.entries(soloScores)
                    .sort(([, a], [, b]) => b.points - a.points)
                    .map(([pid, { tag, points }]) => (
                      <div key={pid} className="flex justify-between items-center gap-4 text-xs">
                        <div className="flex items-center justify-center gap-1 transition-all duration-1000">{pid === currentTurnPeerId ? <IconSquareRoundedChevronRight className="h-5 w-5 text-green-500" /> : <IconSquareRounded className="h-5 w-5 text-neutral-100/30" />}<span className={pid === peerId ? 'text-neutral-300 font-semibold' : 'text-neutral-300'}>{tag}</span></div>

                        {/* MARK: roll result */}
                        {(isRolling && pid === resultPeerId) && (
                          <span className="text-neutral-300 font-bold">Rolling...</span>
                        )}

                        {!(isRolling && pid === resultPeerId) && (() => {
                          const pr = playerResultsRef.current[pid];
                          if (!pr) return null;
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-neutral-100 text-xs">Total</span>
                                <span className={`text-xl font-extrabold font-mono leading-none ${prevRollSum === null ? 'text-white'
                                  : pr.total > prevRollSum ? 'text-green-400'
                                    : pr.total < prevRollSum ? 'text-red-400'
                                      : pr.isPair && !lastRollPair ? 'text-amber-400'
                                        : 'text-neutral-400'
                                  }`}>{pr.total}</span>
                              </div>

                              <div className="flex gap-1">
                                {pr.results.map((res, i) => (
                                  <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                                    pr.isPair
                                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                      : 'bg-neutral-600 border-neutral-700 text-neutral-100'
                                  }`}>
                                    <span className="text-lg font-bold font-mono">{res}</span>
                                  </div>
                                ))}
                                {pr.isPair && (
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="text-amber-300 text-xs uppercase tracking-widest font-semibold leading-none">Pair</span>
                                    <span className="text-amber-300 font-extrabold font-mono text-lg leading-none">{pr.pairMult}x</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* MARK: points */}
                        <span className="font-black text-white">{points.toLocaleString()}</span>
                      </div>
                    ))}
                </>
              </div>
            )}
          </div>

        </header>

      </div>

      <Scene boardModel={boardModel} boardVariant={currentVariant} />
      <ToastContainer />
    </>
  );
}

export default App;