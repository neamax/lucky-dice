import { Suspense, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows, Text, useGLTF, useTexture } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Dice } from './Dice';
import { useStore } from './store';
import * as THREE from 'three';
import { BOARD_MATERIALS, BOARD_MATERIAL_REPEAT_DEFAULT } from './data/appearance';

// MARK: Table
function Table() {
    const { scene } = useGLTF('/table.gltf');
    useMemo(() => {
        scene.traverse((child) => { child.castShadow = true; });
    }, [scene]);
    return <primitive object={scene} position={[0, 0, 0]} />;
}

// MARK: Variants
function resolveVariantMaps(variant: string) {
    const prefix = variant.replace(/_1k$/, '');
    return {
        map: `/variants/${variant}/textures/${prefix}_diff_1k.jpg`,
        roughnessMap: `/variants/${variant}/textures/${prefix}_rough_1k.jpg`,
        normalMap: `/variants/${variant}/textures/${prefix}_nor_gl_1k.jpg`,
    };
}

function VariantMaterial({ variant, scene }: { variant: string; scene: THREE.Group; originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> }) {
    const maps = useTexture(resolveVariantMaps(variant));

    useMemo(() => {
        const repeat = BOARD_MATERIALS.find(m => m.value === variant)?.repeat ?? BOARD_MATERIAL_REPEAT_DEFAULT;
        scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mat = new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0 });
            Object.values(maps).forEach(t => {
                if (!(t instanceof THREE.Texture)) return;
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(...repeat);
            });
            mesh.material = mat;
        });
    }, [scene, maps, variant]);

    return null;
}


// MARK: Board
function CustomBoard({ model, variant }: { model: string; variant: string | null }) {
    const { scene } = useGLTF(model);
    const { cloned, originalMaterials } = useMemo(() => {
        const clone = scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        clone.position.sub(box.getCenter(new THREE.Vector3()));
        const origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        clone.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                origMats.set(mesh, mesh.material);
            }
        });
        return { cloned: clone, originalMaterials: origMats };
    }, [scene]);

    useMemo(() => {
        if (variant) return;
        cloned.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            const orig = originalMaterials.get(mesh);
            if (orig) mesh.material = orig;
        });
    }, [variant, cloned, originalMaterials]);

    return (
        <>
            <primitive object={cloned} />
            {variant && <VariantMaterial variant={variant} scene={cloned} originalMaterials={originalMaterials} />}
        </>
    );
}

// MARK: Lighting
const MAIN_LIGHT_PROPS = {
    position: [150, 150, 300] as [number, number, number],
    castShadow: true,
    intensity: 3,
    color: '#fdf6e3',
    'shadow-mapSize': [2048, 2048] as [number, number],
    'shadow-camera-left': -300,
    'shadow-camera-right': 300,
    'shadow-camera-top': 300,
    'shadow-camera-bottom': -300,
    'shadow-camera-far': 2000,
};

function MainDirectionalLight() {
    return <directionalLight {...MAIN_LIGHT_PROPS} />;
}

// MARK: Backdrop plane
function BackdropPlane() {
    const maps = useTexture(resolveVariantMaps('concrete_tile_facade_1k'));
    useMemo(() => {
        Object.values(maps).forEach((t) => {
            if (!(t instanceof THREE.Texture)) return;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(6, 6);
        });
    }, [maps]);
    return (
        <RigidBody type="fixed" restitution={0.3} friction={0.8} colliders={false}>
            <CuboidCollider position={[0, -9.85, 0]} args={[125, 0.1, 125]} />
            <mesh position={[0, -9.85, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[250, 250]} />
                <meshStandardMaterial {...maps} roughness={0.95} metalness={0.05} normalScale={2} />
            </mesh>
        </RigidBody>
    );
}


// Scene
export function Scene({ boardModel, boardVariant }: { boardModel: string; boardVariant: string | null }) {
    const { diceCount, cursors, broadcastCursor, isDragging } = useStore();
    const triggerFault = useStore(s => s.triggerFault);
    const lastBroadcast = useRef<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // MARK: Cursor broadcasting
    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        const now = Date.now();
        if (now - lastBroadcast.current > 50) {
            lastBroadcast.current = now;
            broadcastCursor(e.point.x, e.point.z);
        }
    };

    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full z-0">
            <Canvas shadows camera={{ position: [0, 20, 40], fov: 45 }}>
                <MainDirectionalLight />

                <Suspense fallback={null}>
                    <Physics gravity={[0, -9.81, 0]}>
                        <RigidBody type="fixed" restitution={0.2} friction={1}>
                            {/* MARK: Board */}
                            <CustomBoard model={boardModel} variant={boardVariant} />
                            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} onPointerMove={handlePointerMove}>
                                <planeGeometry args={[20, 20]} />
                                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                            </mesh>

                            <CuboidCollider position={[-10, 5, 0]} args={[0.5, 5, 10]} />
                            <CuboidCollider position={[10, 5, 0]} args={[0.5, 5, 10]} />
                            <CuboidCollider position={[0, 5, -10]} args={[10, 5, 0.5]} />
                            <CuboidCollider position={[0, 5, 10]} args={[10, 5, 0.5]} />
                        </RigidBody>

                        {Array.from({ length: diceCount }).map((_, i) => {
                            const offset = (i - (diceCount - 1) / 2) * 2;
                            return <Dice key={i} index={i} position={[offset, 3, 0]} onFloorHit={triggerFault} />;
                        })}

                        <BackdropPlane />
                    </Physics>

                    {/* MARK: Player Indi */}
                    {Object.entries(cursors).map(([id, data]) => (
                        <group key={id} position={[data.x, 0.05, data.z]}>
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                                <ringGeometry args={[0.2, 0.3, 32]} />
                                <meshBasicMaterial color="#4ade80" transparent opacity={0} />
                            </mesh>

                            <Text
                                position={[0, 0.5, 0]}
                                fontSize={0.4}
                                color="white"
                                anchorY="bottom"
                                outlineWidth={0.02}
                                outlineColor="#000000"
                            >
                                {data.tag}
                            </Text>
                        </group>
                    ))}

                    <Table />

                    <Environment preset="lobby" background blur={0.75} environmentIntensity={0.5} />

                    <ContactShadows
                        position={[0, 0.01, 0]}
                        opacity={1}
                        scale={20}
                        blur={2}
                        far={4}
                    />
                </Suspense>

                {/* MARK: Camera */}
                <OrbitControls
                    makeDefault
                    enabled={!isDragging}
                    minPolarAngle={0}
                    maxPolarAngle={Math.PI / 2.1}
                    minDistance={10}
                    maxDistance={60}
                    enableDamping
                    dampingFactor={0.025}
                    zoomSpeed={0.5}
                    rotateSpeed={0.8}
                />
            </Canvas>

        </div>
    );
}

// Preload models
useGLTF.preload('/table.gltf');
useGLTF.preload('/board.glb');
useGLTF.preload('/board-2.glb');
useGLTF.preload('/dice.glb');
useGLTF.preload('/dice-2.glb');
useGLTF.preload('/dice-3.glb');