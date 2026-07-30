import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Scene } from './Scene';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, X, Lock, Unlock } from 'lucide-react'; // imported icons

function App() {
  const {
    gamerTag,
    peerId,
    isHost,
    connections,
    initializeSession,
    initializeNetwork,
    isRolling,
    diceResults,
    diceCount,
    setDiceCount,
    lockedDice,
    toggleLockDie,
    lockEnabled,
    toggleLockFeature,
    boardModel,
    setBoardModel,
    boardVariants,
    setBoardVariant,
    diceModel,
    setDiceModel,
    betAmount,
    betMultiplier,
    setBetAmount,
    setBetMultiplier,
    scores,
  } = useStore();

  const [shareUrl, setShareUrl] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const VARIANTS = [
    'blue_metal_plate_1k',
    'corrugated_iron_02_1k',
    'exterior_wall_cladding_03_1k',
    'green_metal_rust_1k',
    'interior_tiles_1k',
    'old_linoleum_flooring_01_1k',
    'plank_flooring_04_1k',
    'plastered_wall_02_1k',
    'plastered_wall_05_1k',
    'rubber_tiles_1k',
  ] as const;

  const currentVariant = boardVariants[boardModel] ?? null;

  useEffect(() => {
    initializeSession();

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    initializeNetwork(roomId);
  }, [initializeSession, initializeNetwork]);

  useEffect(() => {
    if (peerId && isHost) {
      setShareUrl(`${window.location.origin}?room=${peerId}`);
    }
  }, [peerId, isHost]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasResults = diceResults.every(r => r !== null) && diceResults.length > 0;
  const totalSum = diceResults.reduce((sum, val) => (sum || 0) + (val || 0), 0);

  return (
    <>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col p-6 z-10 text-white">
        <header className="w-full flex justify-between items-start pointer-events-none">
          <div className="flex flex-col gap-3 pointer-events-auto">
            <div className='flex items-center justify-center'>
              <img src="/dice.png" alt="dice" className="w-15 h-15" />
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tighter drop-shadow-xl">
                LuckyDice
              </h1>
            </div>

            {/* MARK: board selector */}
            <div className="flex bg-neutral-800/80 p-1 rounded-lg border border-neutral-600 backdrop-blur-sm w-fit">
              {(['/board.glb', '/board-2.glb'] as const).map((model) => (
                <button
                  key={model}
                  onClick={() => setBoardModel(model)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${boardModel === model
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-700/50 cursor-pointer'
                    }`}
                >
                  {model === '/board.glb' ? 'Board 1' : 'Board 2'}
                </button>
              ))}
            </div>

            {/* board material variant picker */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-neutral-400 uppercase tracking-widest">Board Material</span>
              <div className="flex flex-wrap gap-1 max-w-xs">
                <button
                  onClick={() => setBoardVariant(boardModel, null)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${currentVariant === null
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-neutral-800/80 border-neutral-600 text-neutral-400 hover:text-white hover:bg-neutral-700/50 cursor-pointer'
                    }`}
                >
                  Default
                </button>
                {VARIANTS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setBoardVariant(boardModel, v)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${currentVariant === v
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-neutral-800/80 border-neutral-600 text-neutral-400 hover:text-white hover:bg-neutral-700/50 cursor-pointer'
                      }`}
                  >
                    {v.replace(/_1k$/, '').replaceAll('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* MARK: dice model */}
            <div className="flex bg-neutral-800/80 p-1 rounded-lg border border-neutral-600 backdrop-blur-sm w-fit">
              {(['/dice.glb', '/dice-2.glb'] as const).map((model) => (
                <button
                  key={model}
                  onClick={() => setDiceModel(model)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${diceModel === model
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-700/50 cursor-pointer'
                    }`}
                >
                  {model === '/dice.glb' ? 'Dice 1' : 'Dice 2'}
                </button>
              ))}
            </div>

            {/* dice selection toggle group */}
            <div className="flex bg-neutral-800/80 p-1 rounded-lg border border-neutral-600 backdrop-blur-sm w-fit">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  onClick={() => setDiceCount(num)}
                  disabled={isRolling}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${diceCount === num
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-700/50 cursor-pointer'
                    } ${isRolling ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {num} {num === 1 ? 'Die' : 'Dice'}
                </button>
              ))}
            </div>

            {/* lock dice configuration toggle button */}
            <button
              onClick={toggleLockFeature}
              disabled={isRolling}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium backdrop-blur-sm w-fit transition-colors cursor-pointer ${lockEnabled
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 hover:bg-amber-500/20'
                : 'bg-neutral-800/80 border-neutral-600 text-neutral-400 hover:text-white'
                } ${isRolling ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {lockEnabled ? <Lock size={15} /> : <Unlock size={15} />}
              <span>Dice Locking: {lockEnabled ? 'Enabled' : 'Disabled'}</span>
            </button>

            {isHost && shareUrl && (
              <div className="flex flex-col gap-2 items-start mt-1">
                <button
                  onClick={() => setShowQR(true)}
                  className="flex items-center gap-2 bg-neutral-800/80 hover:bg-neutral-700/80 backdrop-blur-sm border border-neutral-600 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <QrCode size={18} />
                  <span className="text-sm font-medium">Invite Players</span>
                </button>
                <div className="text-sm text-neutral-300 drop-shadow-md font-medium">
                  Players connected: {connections.length}
                </div>
              </div>
            )}
          </div>

          {/* MARK: tag/scores */}
          <div className="flex flex-col items-end gap-3 pointer-events-auto">
            <div className="bg-neutral-800/80 backdrop-blur-sm border border-neutral-700 px-4 py-2 rounded-lg shadow-lg">
              <span className="text-neutral-400 text-sm mr-2">Tag:</span>
              <span className="text-green-400 font-mono font-semibold">{gamerTag || 'Loading...'}</span>
            </div>

            {/* MARK: bet controls */}
            <div className="flex flex-col gap-2 bg-neutral-800/80 backdrop-blur-sm border border-neutral-700 px-4 py-3 rounded-lg shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400 text-xs uppercase tracking-widest">Bet</span>
                <input
                  type="number"
                  min={1}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
                  disabled={isRolling}
                  className="w-20 bg-neutral-700 border border-neutral-600 rounded px-2 py-1 text-sm text-white text-right outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex gap-1">
                {[1, 2, 4, 8, 20].map((m) => (
                  <button
                    key={m}
                    onClick={() => setBetMultiplier(m)}
                    disabled={isRolling}
                    className={`px-2 py-1 text-xs font-bold rounded transition-colors ${betMultiplier === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600 cursor-pointer'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {m}x
                  </button>
                ))}
              </div>
              <div className="text-xs text-neutral-400 text-right">
                Prize: <span className="text-white font-semibold">{betAmount * betMultiplier}</span> pts
              </div>
            </div>

            {/* MARK: scores */}
            {Object.keys(scores).length > 0 && (
              <div className="bg-neutral-800/80 backdrop-blur-sm border border-neutral-700 px-4 py-3 rounded-lg shadow-lg min-w-[160px]">
                <div className="text-neutral-400 text-xs uppercase tracking-widest mb-2">Scores</div>
                {Object.entries(scores)
                  .sort(([, a], [, b]) => b.points - a.points)
                  .map(([pid, { tag, points }]) => (
                    <div key={pid} className="flex justify-between items-center gap-4 text-sm">
                      <span className={pid === peerId ? 'text-green-400 font-semibold' : 'text-neutral-300'}>{tag}</span>
                      <span className="font-mono text-white">{points}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </header>

        {/* MARK: roll result */}
        <div className="w-full flex justify-center mt-auto pointer-events-auto pb-8">
          {isRolling && (
            <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-700 px-6 py-3 rounded-full shadow-xl animate-pulse">
              <span className="text-neutral-300 font-medium tracking-wide">Rolling...</span>
            </div>
          )}

          {!isRolling && hasResults && (
            <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-700 px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-neutral-400 text-xs uppercase tracking-widest font-semibold mb-1">Total</span>
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
                        ? 'bg-neutral-800 border-neutral-700 text-neutral-400 cursor-default'
                        : isLocked
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer'
                          : 'bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-neutral-400 cursor-pointer'
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

      {showQR && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-2xl max-w-sm w-full flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Scan to Join</h2>
              <button
                onClick={() => setShowQR(false)}
                className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            <div className="bg-white p-4 rounded-lg mb-6">
              <QRCodeSVG value={shareUrl} size={200} />
            </div>

            <div className="w-full flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-300 outline-none"
              />
              <button
                onClick={copyToClipboard}
                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer min-w-[40px]"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <Scene boardModel={boardModel} boardVariant={currentVariant} />
    </>
  );
}

export default App;