import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { PositionalAudio, useGLTF } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import { useStore } from './store';
import type { RollResultData } from './store';
import { Vector3, Quaternion } from 'three';

const DRAG_Y = 4;
const DRAG_LERP = 0.18;
const THROW_SCALE = 18;

// floor Y threshold — matches BackdropPlane position
const FLOOR_Y = -9.0;

// guard so one die falling doesn't fire fault multiple times per roll
let faultFiredThisRoll = false;

// module-level rigid body registry — populated each frame, always current
const rigidBodyRegistry = new Map<number, RapierRigidBody>();

// per-die remote transform applied each frame by non-roller peers
type DiceTransform = { px: number, py: number, pz: number, rx: number, ry: number, rz: number, rw: number };

const BUFFER_DELAY = 1200;
const PLAYBACK_START_DELAY = 1000; 

const frameBuffer: { t: number; transforms: DiceTransform[] }[] = [];
let bufferStartTime = 0;

export const dragFrameBuffer: DiceTransform[] = [];

export function applyRemoteTransforms(transforms: DiceTransform[], drag = false) {
    if (drag) {
        transforms.forEach((t, i) => { dragFrameBuffer[i] = t; });
        return;
    }
    const now = performance.now();
    if (bufferStartTime === 0) bufferStartTime = now;
    frameBuffer.push({ t: now, transforms });
    // drop frames older than buffer window + some headroom
    const cutoff = now - BUFFER_DELAY - 500;
    while (frameBuffer.length > 1 && frameBuffer[0].t < cutoff) frameBuffer.shift();
}

export function clearFrameBuffer() {
    frameBuffer.length = 0;
    dragFrameBuffer.length = 0;
    bufferStartTime = 0;
}

let lastFrameBroadcast = 0;

export function getStartRotations(diceCount: number, lockedIndices: number[]) {
    return Array.from({ length: diceCount }, (_, i) => {
        if (lockedIndices.includes(i)) return { x: 0, y: 0, z: 0, w: 1 };
        const rb = rigidBodyRegistry.get(i);
        if (!rb) return { x: 0, y: 0, z: 0, w: 1 };
        const r = rb.rotation();
        return { x: r.x, y: r.y, z: r.z, w: r.w };
    });
}

// Module-level shared drag state — all Dice instances read/write these
const shared = {
    dragging: false,
    fromDrag: false,
    target: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
};

// MARK: Dice Mesh
function DiceMesh({ isLocked, model }: { isLocked: boolean, model: string }) {
    const { scene } = useGLTF(model);
    const cloned = useMemo(() => {
        const clone = scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const center = box.getCenter(new THREE.Vector3());
        clone.position.sub(center);
        clone.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                if (isLocked) {
                    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
                    mat.emissive = new THREE.Color('#d97706');
                    mat.emissiveIntensity = 0.3;
                    mesh.material = mat;
                }
            }
        });
        return clone;
    }, [scene, isLocked]);

    return <primitive object={cloned} />;
}

// MARK: Physics
export function Dice({ index, position, onFloorHit }: { index: number, position: [number, number, number], onFloorHit?: () => void }) {
    const rigidBodyRef = useRef<RapierRigidBody>(null);
    const audioRef = useRef<THREE.PositionalAudio>(null);
    const lastAppliedRollId = useRef<number | null>(null);

    const lastAppliedRollResultId = useRef<number | null>(null);

    useEffect(() => {
        return () => { rigidBodyRegistry.delete(index); };
    }, [index]);

    const {
        triggerLocalRoll,
        setDiceResult,
        rollEvent,
        rollResult,
        isRolling,
        lockedDice,
        toggleLockDie,
        lockEnabled,
        diceModel,
        startDiceDrag,
        endDiceDrag,
        peerId: myPeerId,
    } = useStore();

    const { scene: diceScene } = useGLTF(diceModel);
    const colliderHalfExtents = useMemo<[number, number, number]>(() => {
        const box = new THREE.Box3().setFromObject(diceScene);
        const size = box.getSize(new THREE.Vector3());
        return [size.x / 2, size.y / 2, size.z / 2];
    }, [diceScene]);

    const isLocked = lockEnabled && lockedDice.includes(index);
    const isRemoteRoll = isRolling && rollEvent?.rollerPeerId !== myPeerId;
    const [posX, posY, posZ] = position;

    const { camera, raycaster, gl } = useThree();
    const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y), []);
    const pointerDownTime = useRef(0);

    const getPointerWorld = (clientX: number, clientY: number): THREE.Vector3 | null => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = new THREE.Vector3();
        return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
    };

    useEffect(() => {
        if (index !== 0) return;

        const onMove = (e: PointerEvent) => {
            if (!shared.dragging) return;
            const pt = getPointerWorld(e.clientX, e.clientY);
            if (!pt) return;
            shared.velocity.copy(pt).sub(shared.target);
            shared.target.copy(pt);
        };

        const onUp = (e: PointerEvent) => {
            if (!shared.dragging) return;
            shared.dragging = false;
            endDiceDrag();
            gl.domElement.releasePointerCapture(e.pointerId);

            const vel = shared.velocity;
            const throwImpulse = {
                x: vel.x * THROW_SCALE,
                y: Math.abs(vel.x + vel.z) * THROW_SCALE * 0.4 + 6,
                z: vel.z * THROW_SCALE,
            };

            const { diceCount, lockedDice: ld, diceResults, betAmount, betMultiplier,
                gamerTag, displayName, peerId, sessionActive, connections,
                turnOrder, currentTurnIndex } = useStore.getState();

            if (sessionActive && connections.length > 0 && turnOrder[currentTurnIndex] !== peerId) return;

            const rollerTag = displayName || gamerTag;
            const impulses = [];
            const torques = [];
            const newResults = [...diceResults];
            for (let i = 0; i < diceCount; i++) {
                if (ld.includes(i)) {
                    impulses.push({ x: 0, y: 0, z: 0 });
                    torques.push({ x: 0, y: 0, z: 0 });
                } else {
                    newResults[i] = null;
                    impulses.push({ ...throwImpulse });
                    torques.push({
                        x: (Math.random() - 0.5) * 10,
                        y: (Math.random() - 0.5) * 10,
                        z: (Math.random() - 0.5) * 10,
                    });
                }
            }

            const startPositions = [];
            for (let i = 0; i < diceCount; i++) {
                const offset = (i - (diceCount - 1) / 2) * 2;
                startPositions.push({ x: shared.target.x + offset, y: DRAG_Y, z: shared.target.z });
            }

            shared.fromDrag = true;
            const rollData = {
                id: Date.now(), impulses, torques, startPositions,
                startRotations: getStartRotations(diceCount, ld),
                lockedIndices: ld, rollerTag, rollerPeerId: peerId!,
                betAmount, betMultiplier,
            };
            useStore.setState({ isRolling: true, diceResults: newResults, rollEvent: rollData });
            connections.forEach(c => c.send({ type: 'ROLL', rollData }));
        };

        gl.domElement.addEventListener('pointermove', onMove);
        gl.domElement.addEventListener('pointerup', onUp);
        return () => {
            gl.domElement.removeEventListener('pointermove', onMove);
            gl.domElement.removeEventListener('pointerup', onUp);
        };
    }, [index, gl, endDiceDrag]);



    useFrame(() => {
        if (rigidBodyRef.current) rigidBodyRegistry.set(index, rigidBodyRef.current);

        const { peerId, rollEvent: re, isRolling: rolling, connections } = useStore.getState();
        const isRoller = re?.rollerPeerId === peerId;

        // broadcast all dice transforms at ~20fps
        if (isRoller && index === 0 && (rolling || shared.dragging)) {
            const now = performance.now();
            if (now - lastFrameBroadcast > 50) {
                lastFrameBroadcast = now;
                const transforms: DiceTransform[] = [];
                rigidBodyRegistry.forEach((rb, i) => {
                    const p = rb.translation();
                    const r = rb.rotation();
                    transforms[i] = { px: p.x, py: p.y, pz: p.z, rx: r.x, ry: r.y, rz: r.z, rw: r.w };
                });
                connections.forEach(c => c.send({ type: 'DICE_FRAME', transforms, drag: shared.dragging && !rolling }));
            }
        }

        // out-of-bounds fault detection every frame
        if (rolling && isRoller && rigidBodyRef.current && !faultFiredThisRoll) {
            const { x: tx, y: ty, z: tz } = rigidBodyRef.current.translation();
            if (ty < FLOOR_Y || Math.abs(tx) > 14 || Math.abs(tz) > 14) {
                faultFiredThisRoll = true;
                onFloorHit?.();
            }
        }

        // interpolate from jitter buffer at playback time
        if (!isRoller && rigidBodyRef.current) {
            if (!rolling) {
                if (index === 0 && frameBuffer.length > 0) frameBuffer.length = 0;
                const df = dragFrameBuffer[index];
                if (df) {
                    rigidBodyRef.current.setTranslation({ x: df.px, y: df.py, z: df.pz }, false);
                    rigidBodyRef.current.setRotation({ x: df.rx, y: df.ry, z: df.rz, w: df.rw }, false);
                }
            } else {
                if (bufferStartTime === 0 || performance.now() - bufferStartTime < PLAYBACK_START_DELAY) return;
                const playbackTime = performance.now() - BUFFER_DELAY;
                let prev = frameBuffer[0];
                let next = frameBuffer[0];
                for (let i = 1; i < frameBuffer.length; i++) {
                    if (frameBuffer[i].t <= playbackTime) prev = frameBuffer[i];
                    else { next = frameBuffer[i]; break; }
                }
                if (prev && prev.transforms[index]) {
                    const a = prev.transforms[index];
                    const b = (next && next !== prev && next.transforms[index]) ? next.transforms[index] : a;
                    const span = next && next !== prev ? next.t - prev.t : 1;
                    const alpha = next && next !== prev ? Math.min(1, (playbackTime - prev.t) / span) : 0;
                    const px = a.px + (b.px - a.px) * alpha;
                    const py = a.py + (b.py - a.py) * alpha;
                    const pz = a.pz + (b.pz - a.pz) * alpha;
                    const qa = new THREE.Quaternion(a.rx, a.ry, a.rz, a.rw);
                    const qb = new THREE.Quaternion(b.rx, b.ry, b.rz, b.rw);
                    qa.slerp(qb, alpha);
                    rigidBodyRef.current.setTranslation({ x: px, y: py, z: pz }, false);
                    rigidBodyRef.current.setRotation({ x: qa.x, y: qa.y, z: qa.z, w: qa.w }, false);
                }
            }
        }

        // drag
        if (!shared.dragging || !rigidBodyRef.current || isLocked) return;
        const { diceCount } = useStore.getState();
        const offset = (index - (diceCount - 1) / 2) * 2;
        const target = new THREE.Vector3(shared.target.x + offset, DRAG_Y, shared.target.z);
        const cur = rigidBodyRef.current.translation();
        const next2 = new THREE.Vector3(cur.x, cur.y, cur.z).lerp(target, DRAG_LERP);
        rigidBodyRef.current.setTranslation({ x: next2.x, y: next2.y, z: next2.z }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    });

    useEffect(() => {
        if (!rollEvent || !rigidBodyRef.current || isLocked) return;
        if (rollEvent.id === lastAppliedRollId.current) return;
        lastAppliedRollId.current = rollEvent.id;
        if (index === 0) faultFiredThisRoll = false;
        const { peerId, diceCount } = useStore.getState();
        const isLocalRoll = rollEvent.rollerPeerId === peerId;
        if (!isLocalRoll) return;

        const impulse = rollEvent.impulses[index];
        const torque = rollEvent.torques[index];
        const skipPositionReset = shared.fromDrag && isLocalRoll;
        if (!skipPositionReset) {
            const startPos = rollEvent.startPositions?.[index] ?? { x: posX, y: posY, z: posZ };
            rigidBodyRef.current.setTranslation(startPos, true);
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        if (index === diceCount - 1) shared.fromDrag = false;
        rigidBodyRef.current.wakeUp();
        rigidBodyRef.current.applyImpulse(impulse, true);
        rigidBodyRef.current.applyTorqueImpulse(torque, true);
    }, [rollEvent, index, posX, posY, posZ, isLocked]);

    // snap remote dice to the roller's final settled state
    useEffect(() => {
        if (!rollResult || !rigidBodyRef.current) return;
        if (rollResult.rollId === lastAppliedRollResultId.current) return;
        const { peerId, rollEvent: currentRollEvent } = useStore.getState();
        if (currentRollEvent?.rollerPeerId === peerId) return;
        lastAppliedRollResultId.current = rollResult.rollId;
        const pos = rollResult.finalPositions[index];
        const rot = rollResult.finalRotations[index];
        if (!pos || !rot) return;
        rigidBodyRef.current.setTranslation(pos, true);
        rigidBodyRef.current.setRotation(rot, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        rigidBodyRef.current.sleep();
    }, [rollResult, index]);

    const calculateUpFace = () => {
        if (!rigidBodyRef.current || isLocked) return;
        const { peerId, rollEvent: currentRollEvent } = useStore.getState();
        if (currentRollEvent?.rollerPeerId !== peerId) return;
        const { x: tx, y: ty, z: tz } = rigidBodyRef.current.translation();
        if (ty < FLOOR_Y || Math.abs(tx) > 14 || Math.abs(tz) > 14) return;
        const { x, y, z, w } = rigidBodyRef.current.rotation();
        const quaternion = new Quaternion(x, y, z, w);
        const faceNormals = [
            { face: 6, vec: new Vector3(1, 0, 0) },
            { face: 1, vec: new Vector3(-1, 0, 0) },
            { face: 2, vec: new Vector3(0, 1, 0) },
            { face: 3, vec: new Vector3(0, 0, -1) },
            { face: 5, vec: new Vector3(0, -1, 0) },
            { face: 4, vec: new Vector3(0, 0, 1) },
        ];
        const worldUp = new Vector3(0, 1, 0);
        let maxDot = -Infinity;
        let topFace = 1;
        for (const normal of faceNormals) {
            const rotatedNormal = normal.vec.clone().applyQuaternion(quaternion);
            const dot = rotatedNormal.dot(worldUp);
            if (dot > maxDot) { maxDot = dot; topFace = normal.face; }
        }
        setDiceResult(index, topFace);

        // after local roller's last die settles, broadcast final state to peers
        const { diceCount, connections } = useStore.getState();
        if (connections.length > 0) {
            const newResults = [...useStore.getState().diceResults];
            newResults[index] = topFace;
            const allSettled = newResults.every((r, i) => useStore.getState().lockedDice.includes(i) || r !== null);
            if (allSettled) {
                const finalPositions: RollResultData['finalPositions'] = [];
                const finalRotations: RollResultData['finalRotations'] = [];
                for (let i = 0; i < diceCount; i++) {
                    const rb = rigidBodyRegistry.get(i);
                    if (rb) {
                        const p = rb.translation();
                        const r = rb.rotation();
                        finalPositions.push({ x: p.x, y: p.y, z: p.z });
                        finalRotations.push({ x: r.x, y: r.y, z: r.z, w: r.w });
                    } else {
                        finalPositions.push({ x: 0, y: 0, z: 0 });
                        finalRotations.push({ x: 0, y: 0, z: 0, w: 1 });
                    }
                }
                useStore.getState().broadcastRollResult({
                    rollId: currentRollEvent.id,
                    results: newResults,
                    finalPositions,
                    finalRotations,
                });
            }
        }
    };

    const handleCollision = () => {
        if (!rigidBodyRef.current) return;

        // fault detection: only the roller triggers faults
        const { peerId, rollEvent: currentRollEvent } = useStore.getState();
        if (currentRollEvent?.rollerPeerId === peerId) {
            const posY = rigidBodyRef.current.translation().y;
            if (posY < FLOOR_Y && !faultFiredThisRoll && onFloorHit) {
                faultFiredThisRoll = true;
                onFloorHit();
            }
        }

        if (!audioRef.current) return;
        const vel = rigidBodyRef.current.linvel();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        if (speed > 1.0) {
            const finalVolume = Math.min(8.0, (speed / 5) * 8.0);
            audioRef.current.setVolume(finalVolume);
            audioRef.current.setRefDistance(20);
            if (audioRef.current.isPlaying) audioRef.current.stop();
            audioRef.current.play();
            if (typeof navigator !== 'undefined' && navigator.vibrate)
                navigator.vibrate(Math.min(50, Math.round(speed * 3)));
        }
    };

    const handlePointerDown = (e: any) => {
        e.stopPropagation();
        const { sessionActive, connections, turnOrder, currentTurnIndex, peerId: pid } = useStore.getState();
        if (sessionActive && connections.length > 0 && turnOrder[currentTurnIndex] !== pid) return;
        if (isRolling || isLocked) return;
        pointerDownTime.current = performance.now();

        const clientX = e.clientX ?? e.nativeEvent?.clientX;
        const clientY = e.clientY ?? e.nativeEvent?.clientY;
        const pointerId = e.pointerId ?? e.nativeEvent?.pointerId;
        const pt = getPointerWorld(clientX, clientY);
        if (!pt) return;

        shared.target.copy(pt);
        shared.velocity.set(0, 0, 0);
        shared.dragging = true;
        shared.fromDrag = false;
        startDiceDrag();
        gl.domElement.setPointerCapture(pointerId);
    };

    const handleClick = (e: any) => {
        e.stopPropagation();
        if (e.delta > 5) return;
        const holdMs = performance.now() - pointerDownTime.current;

        if (holdMs < 200 && !shared.dragging) {
            const touchForce: number = (e.nativeEvent as any).force ?? -1;
            const strength = touchForce >= 0
                ? Math.min(1, touchForce * 2)
                : Math.min(1, holdMs / 1500);
            triggerLocalRoll(strength);
        }
    };

    const handleDoubleClick = (e: any) => {
        e.stopPropagation();
        toggleLockDie(index);
    };

    return (
        <RigidBody
            ref={rigidBodyRef}
            position={position}
            colliders={false}
            restitution={0.2}
            friction={0.9}
            onSleep={calculateUpFace}
            onCollisionEnter={handleCollision}
            type={isLocked ? 'fixed' : isRemoteRoll ? 'kinematicPosition' : 'dynamic'}
        >
            <CuboidCollider args={colliderHalfExtents} />
            <group
                onPointerDown={handlePointerDown}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onPointerOver={() => {
                    const { sessionActive, connections, turnOrder, currentTurnIndex, peerId: pid } = useStore.getState();
                    const notMyTurn = sessionActive && connections.length > 0 && turnOrder[currentTurnIndex] !== pid;
                    document.body.style.cursor = (isRolling || notMyTurn) ? 'default' : 'grab';
                }}
                onPointerOut={() => document.body.style.cursor = 'default'}
            >
                <DiceMesh isLocked={isLocked} model={diceModel} />
                <PositionalAudio ref={audioRef} url="/hit.mp3" loop={false} />
            </group>
        </RigidBody>
    );
}
