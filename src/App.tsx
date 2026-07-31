import { useEffect } from 'react';
import { useStore } from './store';
import { Scene } from './Scene';
import { FloatingMenu } from './components/FloatingMenu';
import { ToastContainer } from './components/ui/toast';

function App() {
  const {
    peerId,
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
  } = useStore();

  const currentVariant = boardVariants[boardModel] ?? null;

  useEffect(() => {
    initializeSession();
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    initializeNetwork(roomId);
  }, [initializeSession, initializeNetwork]);

  const hasResults = diceResults.every(r => r !== null) && diceResults.length > 0;
  const totalSum = diceResults.reduce((sum, val) => (sum || 0) + (val || 0), 0);

  return (
    <>
      <FloatingMenu />
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col p-6 z-10 text-white">
        <header className="w-full flex justify-end items-start pointer-events-none">

          {/* MARK: bet controls */}
          <div className="flex flex-col items-end max-md:w-full gap-3 pointer-events-auto">
            {showBettingPanel && (
              <div className="flex flex-col gap-2 bg-black/40 max-md:w-full rounded rounded-3xl backdrop-blur-xl px-4 py-3 shadow-lg">
                <div className='flex justify-between'>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-100 text-xs uppercase tracking-widest">Pot</span>
                    <input
                      type="number"
                      min={1}
                      value={betAmount}
                      onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
                      disabled={isRolling}
                      className="w-20 bg-black/40 rounded rounded-3xl backdrop-blur-xl px-2 py-1 text-sm text-white text-right outline-none disabled:opacity-50"
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
        </header>

        {/* MARK: roll result */}
        <div className="w-full flex justify-center mt-auto pointer-events-auto pb-8 max-md:pb-20">
          {isRolling && (
            <div className="bg-black/40 rounded rounded-3xl backdrop-blur-xl px-6 py-3 rounded-full shadow-xl animate-pulse">
              <span className="text-neutral-300 font-medium tracking-wide">Rolling...</span>
            </div>
          )}

          {!isRolling && hasResults && (
            <div className="bg-black/40 rounded rounded-3xl backdrop-blur-xl px-8 py-4 shadow-2xl flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-neutral-100 text-xs uppercase tracking-widest font-semibold mb-1">Total</span>
                <span className="text-4xl font-extrabold text-white font-mono leading-none">{totalSum}</span>
              </div>

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
                      className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all border ${!lockEnabled
                        ? 'bg-neutral-800 border-neutral-700 text-neutral-100 cursor-default'
                        : isLocked
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer'
                          : 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-100 cursor-pointer'
                        }`}
                    >
                      <span className="text-2xl font-bold font-mono">
                        {res}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <Scene boardModel={boardModel} boardVariant={currentVariant} />
      <ToastContainer />
    </>
  );
}

export default App;