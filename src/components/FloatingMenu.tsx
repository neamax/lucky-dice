import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dices, Palette, Users, QrCode, Copy, Check, X, User, Trash2, Info, Globe, Code2,
} from 'lucide-react';
import { useStore } from '../store';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from './ui/navigation-menu';
import { cn } from '../lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';
import {
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose,
} from './ui/drawer';
import { BOARD_MODELS, BOARD_MATERIALS, DICE_MODELS } from '../data/appearance';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from './ui/alert-dialog';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogAction,
} from './ui/dialog';
import { Input } from './ui/input';

function SectionLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <p className={cn('text-xs text-muted-foreground tracking-widest', !inline && 'mb-1.5')}>{children}</p>;
}

function ToggleGroup<T extends string | number>({
  options, value, onChange, disabled, label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  label?: (v: T) => string;
}) {
  return (
    <div className="flex bg-muted p-0.5 rounded-lg w-fit">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 cursor-pointer',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {label ? label(opt.value) : opt.label}
        </button>
      ))}
    </div>
  );
}

export function FloatingMenu() {
  const {
    isRolling, diceCount, setDiceCount,
    lockEnabled, toggleLockFeature,
    autoReroll, toggleAutoReroll,
    showBettingPanel, toggleBettingPanel,
    boardModel, setBoardModel, boardVariants, setBoardVariant,
    diceModel, setDiceModel,
    isHost, connections, peerId, cursors, playerNames, kickPlayer,
    gamerTag, displayName, setDisplayName,
    resetScores,
    sessionActive, turnOrder, currentTurnIndex, roundNumber,
  } = useStore();


  const [] = useState(() => {
    if (typeof window !== 'undefined' && peerId) return `${window.location.origin}?room=${peerId}`;
    return '';
  });
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const currentVariant = boardVariants[boardModel] ?? null;

  const myTag = displayName || gamerTag;
  const currentTurnPeerId = turnOrder[currentTurnIndex];
  const isMyTurn = currentTurnPeerId === peerId;
  const currentTurnName = currentTurnPeerId === peerId
    ? myTag
    : (playerNames[currentTurnPeerId] || currentTurnPeerId);


  const copyLink = () => {
    const url = `${window.location.origin}?room=${peerId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inviteUrl = `${window.location.origin}?room=${peerId}`;

  return (
    <>
      <div className="fixed z-20 top-4 left-4 md:top-4 md:left-4 bottom-auto max-md:bottom-4 max-md:top-auto max-md:left-2 max-md:right-2 max-md:translate-x-0 bg-black/40 rounded rounded-3xl border border-black/50 backdrop-blur-xl">
        <NavigationMenu className="max-w-none max-md:w-full">
          <NavigationMenuList className="gap-1 rounded-3xl p-1 max-md:justify-evenly max-md:w-full">

            {/* Brand */}
            <NavigationMenuItem className="max-md:hidden">
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <span className="text-md font-bold tracking-tight hidden sm:block">LuckyDice</span>
              </div>
            </NavigationMenuItem>

            {/* MARK: Game */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="max-md:flex-col max-md:h-auto max-md:px-3 max-md:py-1 max-md:gap-1" hideChevron={isMobile}>
                <Dices size={15} className="mr-1.5 md:inline max-md:mr-0 max-md:size-6" />
                <span className="text-xs max-md:leading-none font-normal">Game</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="p-4 min-w-[60vw] md:min-w-[220px] flex flex-col gap-4">
                <Dialog>
                  <DialogTrigger className="flex items-center gap-2 bg-muted hover:bg-accent border border-border px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer w-full">
                    <Dices size={15} /> New Game
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Start a New Game?</DialogTitle>
                      <DialogDescription>
                        This will reset all scores for every player. The current session and connected players will remain. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose>Cancel</DialogClose>
                      <DialogClose render={<DialogAction onClick={resetScores} />}>New Game</DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div>
                  <SectionLabel>Dice Count</SectionLabel>
                  <ToggleGroup
                    options={[
                      { value: 1, label: '1 Die' },
                      { value: 2, label: '2 Dice' },
                      { value: 3, label: '3 Dice' },
                    ]}
                    value={diceCount}
                    onChange={setDiceCount}
                    disabled={isRolling}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <SectionLabel inline>Dice Locking</SectionLabel>
                  <Switch
                    checked={lockEnabled}
                    onCheckedChange={toggleLockFeature}
                    disabled={isRolling}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <SectionLabel inline>Fault Auto Re-roll</SectionLabel>
                  <Switch
                    checked={autoReroll}
                    onCheckedChange={toggleAutoReroll}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <SectionLabel inline>Betting Panel</SectionLabel>
                  <Switch
                    checked={showBettingPanel}
                    onCheckedChange={toggleBettingPanel}
                  />
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* MARK: Appearance */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="max-md:flex-col max-md:h-auto max-md:px-3 max-md:py-1 max-md:gap-1" hideChevron={isMobile}>
                <Palette size={15} className="mr-1.5 md:inline max-md:mr-0 max-md:size-6" />
                <span className=" text-xs max-md:leading-none font-normal">Appearance</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="p-4 min-w-[60vw] md:min-w-[220px] flex flex-col gap-4">
                <div>
                  <SectionLabel>Dice Model</SectionLabel>
                  <Select value={diceModel} onValueChange={(v) => setDiceModel(v as typeof diceModel)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue>{DICE_MODELS.find(m => m.value === diceModel)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DICE_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <SectionLabel>Board Model</SectionLabel>
                  <Select value={boardModel} onValueChange={(v) => setBoardModel(v as typeof boardModel)}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue>{BOARD_MODELS.find(m => m.value === boardModel)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BOARD_MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <SectionLabel>Board Material</SectionLabel>
                  <Select
                    value={currentVariant ?? 'default'}
                    onValueChange={(v) => setBoardVariant(boardModel, v === 'default' ? null : v)}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue>{BOARD_MATERIALS.find(m => m.value === (currentVariant ?? 'default'))?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {BOARD_MATERIALS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* MARK: Multiplayer */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="max-md:flex-col max-md:h-auto max-md:px-3 max-md:py-1 max-md:gap-1" hideChevron={isMobile}>
                <Users size={15} className="mr-1.5 md:inline max-md:mr-0 max-md:size-6" />
                <span className=" text-xs max-md:leading-none font-normal">Multiplayer</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="p-4 min-w-[60vw] md:min-w-[220px] flex flex-col gap-3">
                <div>
                  <SectionLabel>Your Tag</SectionLabel>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">ID:</span>
                    <span className="text-green-400 font-mono text-sm font-semibold">{gamerTag || 'Loading...'}</span>
                  </div>
                  <Input
                    placeholder="Display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-7 text-sm"
                  />
                </div>
                <div>
                  <SectionLabel>Status</SectionLabel>
                  <p className="text-sm">
                    {!peerId ? 'Connecting...' : isHost ? 'Hosting' : 'Guest'}
                  </p>
                </div>
                <div>
                  <SectionLabel>Connected</SectionLabel>
                  <Drawer swipeDirection={isMobile ? 'up' : 'right'}>
                    <DrawerTrigger className="flex items-center gap-2 bg-muted hover:bg-accent border border-border px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer w-full">
                      <Users size={14} />
                      <span>{connections.length + 1} player{connections.length !== 0 ? 's' : ''}</span>
                    </DrawerTrigger>
                    <DrawerContent className={isMobile ? '[--drawer-content-height:80dvh]' : '[--drawer-content-width:30%]'}>
                      <DrawerHeader className="flex-row items-center justify-between pb-3">
                        <DrawerTitle>Players</DrawerTitle>
                        <DrawerClose className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                          <X size={18} />
                        </DrawerClose>
                      </DrawerHeader>
                      <div className="flex flex-col gap-1 px-4 py-2 overflow-y-auto">
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted">
                          <User size={15} className="text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium">{displayName || gamerTag}</span>
                          <span className="text-xs text-muted-foreground ml-auto">(you)</span>
                        </div>
                        {connections.map((conn) => (
                          <div key={conn.peer} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors group">
                            <User size={15} className="text-muted-foreground shrink-0" />
                            <span className="text-sm flex-1">{playerNames[conn.peer] || cursors[conn.peer]?.tag || conn.peer}</span>
                            {isHost && (
                              <button
                                onClick={() => kickPlayer(conn.peer)}
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-all cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </DrawerContent>
                  </Drawer>
                </div>
                {sessionActive && (
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground mb-0.5">Round {roundNumber} — {isMyTurn ? <span className="text-green-400 font-semibold">Your turn!</span> : <span>{currentTurnName}'s turn</span>}</p>
                  </div>
                )}
                {isHost && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel>Invite</SectionLabel>
                    <button
                      onClick={() => setShowQR(true)}
                      className="flex items-center gap-2 bg-muted hover:bg-accent border border-border px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer w-full"
                    >
                      <QrCode size={15} /> Show QR Code
                    </button>
                    <button
                      onClick={copyLink}
                      className="flex items-center gap-2 bg-muted hover:bg-accent border border-border px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer w-full"
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                )}
                {!isHost && (
                  <p className="text-xs text-muted-foreground">Only the host can invite players.</p>
                )}
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* MARK: About */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="max-md:flex-col max-md:h-auto max-md:px-3 max-md:py-1 max-md:gap-1" hideChevron={isMobile}>
                <Info size={15} className="mr-1.5 md:inline max-md:mr-0 max-md:size-6" />
                <span className="text-xs max-md:leading-none font-normal">About</span>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="p-2 min-w-[50vw] md:min-w-[220px] flex flex-col gap-0.5">
                <AlertDialog>
                  <AlertDialogTrigger className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors cursor-pointer w-full text-left">
                    <Info size={14} /> About LuckyDice
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex justify-center items-center"><img src="/dice.png" alt="LuckyDice" className="w-8 h-8 mr-2" /> LuckyDice</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        An open-source dice game where physics meets fun. Roll in 3D, challenge friends in real-time, and let luck decide your fate.
                        <br /><br />
                        Built with React, Three.js, and Rapier physics — because even a dice roll deserves a little drama.
                        <br /><br />
                        <span className="text-xs">Crafted by <a href="https://neama.luckygene.net" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">Neama Kazemi</a> at <a href="https://www.luckygene.net" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">LuckyGene Indie Studio</a></span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Close</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <a href="https://www.luckygene.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors w-full">
                  <Globe size={14} /> Visit Website
                </a>
                <a href="https://neama.luckygene.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors w-full">
                  <Code2 size={14} /> Developer
                </a>
                <a href="https://github.com/neamax/lucky-dice" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors w-full">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg> GitHub
                </a>
              </NavigationMenuContent>
            </NavigationMenuItem>

          </NavigationMenuList>
        </NavigationMenu>
      </div>

      {/* MARK: QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-popover border border-border rounded-xl p-6 shadow-2xl max-w-sm w-full flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Scan to Join</h2>
              <button onClick={() => setShowQR(false)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <X size={22} />
              </button>
            </div>
            <div className="bg-white p-4 rounded-lg mb-6">
              <QRCodeSVG value={inviteUrl} size={200} />
            </div>
            <div className="w-full flex gap-2">
              <input readOnly value={inviteUrl} className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none" />
              <button onClick={copyLink} className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer min-w-[40px] shrink-0">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
