import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { PositionalAudio, useGLTF } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import { useStore } from './store';
import { Vector3, Quaternion } from 'three';

const DRAG_Y = 4;
const DRAG_LERP = 0.18;
const THROW_SCALE = 18;
// floor Y threshold — matches BackdropPlane position
const FLOOR_Y = -9.0;
// guard so one die falling doesn't fire fault multiple times per roll
let faultFiredThisRoll = false;

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

    const {
        triggerLocalRoll,
        setDiceResult,
        rollEvent,
        isRolling,
        lockedDice,
        toggleLockDie,
        lockEnabled,
        diceModel,
        startDiceDrag,
        endDiceDrag,
    } = useStore();

    const { scene: diceScene } = useGLTF(diceModel);
    const colliderHalfExtents = useMemo<[number, number, number]>(() => {
        const box = new THREE.Box3().setFromObject(diceScene);
        const size = box.getSize(new THREE.Vector3());
        return [size.x / 2, size.y / 2, size.z / 2];
    }, [diceScene]);

    const isLocked = lockEnabled && lockedDice.includes(index);
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

            shared.fromDrag = true;
            const rollData = {
                id: Date.now(), impulses, torques,
                lockedIndices: ld, rollerTag, rollerPeerId: peerId!,
                betAmount, betMultiplier,
            };
            useStore.setState({ isRolling: true, diceResults: newResults, rollEvent: rollData });
            if (!sessionActive) connections.forEach(c => c.send({ type: 'ROLL', rollData }));
        };

        gl.domElement.addEventListener('pointermove', onMove);
        gl.domElement.addEventListener('pointerup', onUp);
        return () => {
            gl.domElement.removeEventListener('pointermove', onMove);
            gl.domElement.removeEventListener('pointerup', onUp);
        };
    }, [index, gl, endDiceDrag]);



    useFrame(() => {
        if (!shared.dragging || !rigidBodyRef.current || isLocked) return;
        const { diceCount } = useStore.getState();
        const offset = (index - (diceCount - 1) / 2) * 2;
        const target = new THREE.Vector3(shared.target.x + offset, DRAG_Y, shared.target.z);
        const cur = rigidBodyRef.current.translation();
        const next = new THREE.Vector3(cur.x, cur.y, cur.z).lerp(target, DRAG_LERP);
        rigidBodyRef.current.setTranslation({ x: next.x, y: next.y, z: next.z }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    });

    useEffect(() => {
        if (!rollEvent || !rigidBodyRef.current || isLocked) return;
        if (index === 0) faultFiredThisRoll = false;
        const impulse = rollEvent.impulses[index];
        const torque = rollEvent.torques[index];

        if (!shared.fromDrag) {
            rigidBodyRef.current.setTranslation({ x: posX, y: posY, z: posZ }, true);
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }

        if (index === useStore.getState().diceCount - 1) shared.fromDrag = false;

        rigidBodyRef.current.wakeUp();
        rigidBodyRef.current.applyImpulse(impulse, true);
        rigidBodyRef.current.applyTorqueImpulse(torque, true);
    }, [rollEvent, index, posX, posY, posZ, isLocked]);

    const calculateUpFace = () => {
        if (!rigidBodyRef.current || isLocked) return;
        const { x: tx, y: ty, z: tz } = rigidBodyRef.current.translation();
        const outOfBounds = ty < FLOOR_Y || Math.abs(tx) > 10 || Math.abs(tz) > 10;
        if (outOfBounds) {
            if (!faultFiredThisRoll && onFloorHit) { faultFiredThisRoll = true; onFloorHit(); }
            return;
        }
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
    };

    const handleCollision = () => {
        if (!rigidBodyRef.current) return;

        // fault detection: die hit something while below the table floor level
        const posY = rigidBodyRef.current.translation().y;
        if (posY < FLOOR_Y && !faultFiredThisRoll && onFloorHit) {
            faultFiredThisRoll = true;
            onFloorHit();
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
            type={isLocked ? 'fixed' : 'dynamic'}
        >
            <CuboidCollider args={colliderHalfExtents} />
            <group
                onPointerDown={handlePointerDown}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onPointerOver={() => document.body.style.cursor = isRolling ? 'default' : 'grab'}
                onPointerOut={() => document.body.style.cursor = 'default'}
            >
                <DiceMesh isLocked={isLocked} model={diceModel} />
                <PositionalAudio ref={audioRef} url="/hit.mp3" loop={false} />
            </group>
        </RigidBody>
    );
}
