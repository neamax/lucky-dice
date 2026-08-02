import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { Scene } from './Scene';
import { FloatingMenu } from './components/FloatingMenu';
import { ToastContainer } from './components/ui/toast';
import { LoadingScreen } from './components/LoadingScreen';

function App() {
  const [loaded, setLoaded] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const prevVariantRef = useRef<string | null | undefined>(undefined);
  const { peerId,
    initializeSession,
    initializeNetwork,
    isRolling,
    diceResults,
    lockedDice,
    toggleLockDie,
    lockEnabled,
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
    sessionActive,
    turnOrder,
    currentTurnIndex,
    roundNumber,
    playerNames,
    displayName,
    gamerTag,
    connections,
  } = useStore();

  const currentVariant = boardVariants[boardModel] ?? null;
  const myTag = displayName || gamerTag;
  const currentTurnPeerId = turnOrder[currentTurnIndex];
  const isMyTurn = currentTurnPeerId === peerId;
  const currentTurnName = currentTurnPeerId === peerId ? myTag : (playerNames[currentTurnPeerId] || currentTurnPeerId);

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

  const hasResults = diceResults.every(r => r !== null) && diceResults.length > 0;
  const totalSum = diceResults.reduce<number>((sum, val) => sum + (val ?? 0), 0);
  const filledResults = diceResults.filter((v): v is number => v !== null);
  const isPair = filledResults.length >= 2 && filledResults.every(v => v === filledResults[0]);
  const pairMult = isPair ? filledResults[0] : 1;

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
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col p-6 z-10 text-white">
        {/* MARK: turn ind */}
        {sessionActive && connections.length > 0 && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-10 px-5 py-2 rounded-full backdrop-blur-xl shadow-lg border text-sm font-semibold pointer-events-none ${isMyTurn
            ? 'bg-green-500/20 border-green-500/50 text-green-300'
            : 'bg-black/40 border-white/10 text-neutral-300'
            }`}>
            Round {roundNumber} &mdash; {isMyTurn ? '🎲 Your turn!' : `${currentTurnName}'s turn`}
          </div>
        )}

        <header className="w-full flex flex-col gap-3 justify-center items-center md:items-end pointer-events-none">
          {/* MARK: bet panel */}
          <div className="flex flex-col items-end max-md:w-full gap-3 pointer-events-auto">
            {showBettingPanel && (
              <div className="flex flex-col gap-2 bg-black/40 max-md:w-full rounded rounded-3xl backdrop-blur-xl px-4 py-3 shadow-lg">
                <div className='flex justify-between gap-1'>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-100 text-xs uppercase tracking-widest">Pot</span>
                    <input
                      type="number"
                      min={1}
                      value={betAmount}
                      onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
                      disabled={isRolling}
                      className="w-20 md:w-30 bg-black/40 rounded rounded-3xl backdrop-blur-xl px-2 py-1 text-sm text-white text-right outline-none disabled:opacity-50"
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
                {Object.keys(scores).length > 0 && (
                  <>
                    <div className="w-full h-px bg-neutral-700" />
                    <div className="flex justify-between">
                      <div className="text-neutral-100 text-xs uppercase tracking-widest">Scores</div>
                      <div className="text-amber-400 font-bold text-xs uppercase tracking-widest">Current Pot Sum: {(betAmount * betMultiplier).toLocaleString()}$</div>
                    </div>
                    {Object.entries(scores)
                      .sort(([, a], [, b]) => b.points - a.points)
                      .map(([pid, { tag, points }]) => (
                        <div key={pid} className="flex justify-between items-center gap-4 text-xs">
                          <span className={pid === peerId ? 'text-neutral-300 font-semibold' : 'text-neutral-300'}>{tag}</span>
                          <span className="font-black text-white">{points.toLocaleString()}</span>
                        </div>
                      ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* MARK: roll result */}
          <div className="md:absolute md:top-4 md:left-0 w-full">
            <div className="w-full flex justify-center items-center pointer-events-none">
              {isRolling && (
                <div className="bg-black/40 rounded rounded-3xl backdrop-blur-xl px-3 py-2 rounded-full shadow-xl animate-pulse">
                  <span className="text-neutral-300 font-medium tracking-wide">Rolling...</span>
                </div>
              )}

              {!isRolling && hasResults && (
                <div className="bg-black/40 rounded rounded-3xl backdrop-blur-xl px-4 py-2 shadow-2xl flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <span className="text-neutral-100 text-xs uppercase tracking-widest font-semibold mb-1">Total</span>
                    <span className={`text-2xl font-extrabold font-mono leading-none ${
                      prevRollSum === null ? 'text-white'
                      : totalSum > prevRollSum ? 'text-green-400'
                      : totalSum < prevRollSum ? 'text-red-400'
                      : isPair && !lastRollPair ? 'text-amber-400'
                      : 'text-neutral-400'
                    }`}>{totalSum}</span>
                  </div>

                  {prevRollSum !== null && (
                    <div className="flex flex-col items-center">
                      <span className="text-neutral-100 text-xs uppercase tracking-widest font-semibold mb-1">Last</span>
                      <span className="text-2xl font-extrabold font-mono leading-none text-neutral-400">{prevRollSum}</span>
                    </div>
                  )}

                  <div className="w-px h-12 bg-neutral-700 mx-2"></div>

                  <div className="flex gap-3">
                    {diceResults.map((res, i) => {
                      const isLocked = lockEnabled && lockedDice.includes(i);
                      return (
                        <button
                          key={i}
                          onClick={() => lockEnabled && toggleLockDie(i)}
                          disabled={!lockEnabled}
                          title={!lockEnabled ? "Dice locking is disabled" : isLocked ? "Click to unlock die" : "Click to lock die"}
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all border ${
                            isPair
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)] cursor-default'
                              : !lockEnabled
                                ? 'bg-neutral-800 border-neutral-700 text-neutral-100 cursor-default'
                                : isLocked
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer'
                                  : 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-100 cursor-pointer'
                          }`}
                        >
                          <span className="text-2xl font-bold font-mono">{res}</span>
                        </button>
                      );
                    })}
                    {isPair && (
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-amber-300 text-xs uppercase tracking-widest font-semibold leading-none">Pair</span>
                        <span className="text-amber-300 font-extrabold font-mono text-lg leading-none">{pairMult}x</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

      </div>

      <Scene boardModel={boardModel} boardVariant={currentVariant} />
      <ToastContainer />
    </>
  );
}

export default App;