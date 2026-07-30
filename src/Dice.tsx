import * as THREE from 'three';
import { useEffect, useRef, useMemo } from 'react';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { PositionalAudio, useGLTF } from '@react-three/drei';
import { useStore } from './store';
import { Vector3, Quaternion } from 'three';

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

export function Dice({ index, position }: { index: number, position: [number, number, number] }) {
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
    } = useStore();

    const isLocked = lockEnabled && lockedDice.includes(index);


    const [posX, posY, posZ] = position;

    useEffect(() => {
        if (rollEvent && rigidBodyRef.current && !isLocked) {
            const impulse = rollEvent.impulses[index];
            const torque = rollEvent.torques[index];

            rigidBodyRef.current.setTranslation({ x: posX, y: posY, z: posZ }, true);
            rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);

            rigidBodyRef.current.wakeUp();
            rigidBodyRef.current.applyImpulse(impulse, true);
            rigidBodyRef.current.applyTorqueImpulse(torque, true);
        }
    }, [rollEvent, index, posX, posY, posZ, isLocked]);

    const calculateUpFace = () => {
        if (!rigidBodyRef.current || isLocked) return;

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
            const dotProduct = rotatedNormal.dot(worldUp);

            if (dotProduct > maxDot) {
                maxDot = dotProduct;
                topFace = normal.face;
            }
        }

        setDiceResult(index, topFace);
    };

    const handleCollision = () => {
        if (!rigidBodyRef.current || !audioRef.current) return;

        const vel = rigidBodyRef.current.linvel();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

        if (speed > 1.0) {
            const baseVolume = speed / 5;
            const volumeMultiplier = 8.0;
            const finalVolume = Math.min(volumeMultiplier, baseVolume * volumeMultiplier);

            audioRef.current.setVolume(finalVolume);
            audioRef.current.setRefDistance(20);

            if (audioRef.current.isPlaying) {
                audioRef.current.stop();
            }
            audioRef.current.play();

            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                const hapticDuration = Math.min(50, Math.round(speed * 3));
                navigator.vibrate(hapticDuration);
            }
        }
    };

    // single click rolls, double click locks/unlocks
    const handleDieClick = (e: any) => {
        e.stopPropagation();
        if (e.delta <= 5) {
            triggerLocalRoll();
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
            colliders="cuboid"
            restitution={0.6}
            friction={0.4}
            onSleep={calculateUpFace}
            onCollisionEnter={handleCollision}
            type={isLocked ? "fixed" : "dynamic"}
        >
            <group
                onClick={handleDieClick}
                onDoubleClick={handleDoubleClick}
                onPointerOver={() => document.body.style.cursor = isRolling ? 'default' : 'pointer'}
                onPointerOut={() => document.body.style.cursor = 'default'}
            >
                {/* MARK: physics collider */}
                <mesh visible={false}>
                    <boxGeometry args={[1, 1, 1]} />
                </mesh>

                {/* visible GLB model */}
                <DiceMesh isLocked={isLocked} model={diceModel} />

                <PositionalAudio
                    ref={audioRef}
                    url="/hit.mp3"
                    loop={false}
                />
            </group>
        </RigidBody>
    );
}