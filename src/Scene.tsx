import { Suspense, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows, Text, useGLTF, useTexture } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Dice } from './Dice';
import { useStore } from './store';
import * as THREE from 'three';

function Table() {
    const { scene } = useGLTF('/table.gltf');
    useMemo(() => {
        scene.traverse((child) => { child.castShadow = true; });
    }, [scene]);
    return <primitive object={scene} position={[0, 0, 0]} />;
}

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
        scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.material = new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0 });
        });
    }, [scene, maps]);

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

const MAIN_LIGHT_PROPS = {
    position: [150, 150, 300] as [number, number, number],
    castShadow: true,
    intensity: 2.5,
    color: '#fdf6e3',
    'shadow-mapSize': [2048, 2048] as [number, number],
    'shadow-camera-left': -200,
    'shadow-camera-right': 200,
    'shadow-camera-top': 200,
    'shadow-camera-bottom': -200,
    'shadow-camera-far': 1000,
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
            t.repeat.set(5, 5);
        });
    }, [maps]);
    return (
        <mesh position={[0, -9.85, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[150, 150]} />
            <meshStandardMaterial {...maps} roughness={0.9} metalness={0.1} normalScale={1.5} />
        </mesh>
    );
}
export function Scene({ boardModel, boardVariant }: { boardModel: string; boardVariant: string | null }) {
    const { diceCount, cursors, broadcastCursor } = useStore();
    const lastBroadcast = useRef<number>(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        const now = Date.now();
        if (now - lastBroadcast.current > 50) {
            lastBroadcast.current = now;
            broadcastCursor(e.point.x, e.point.z);
        }
    };

    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full z-0">
            <Canvas shadows camera={{ position: [0, 20, 20], fov: 45 }}>
                <MainDirectionalLight />

                <Suspense fallback={null}>
                    <Physics gravity={[0, -9.81, 0]}>
                        <RigidBody type="fixed" restitution={0.2} friction={1}>
                            {/* MARK: Board */}
                            <CustomBoard model={boardModel} variant={boardVariant} />
                            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} onPointerMove={handlePointerMove}>
                                <planeGeometry args={[20, 20]} />
                                <meshBasicMaterial transparent opacity={0} depthWrite={false}/>
                            </mesh>

                            <CuboidCollider position={[-10, 5, 0]} args={[0.5, 5, 10]} />
                            <CuboidCollider position={[10, 5, 0]} args={[0.5, 5, 10]} />
                            <CuboidCollider position={[0, 5, -10]} args={[10, 5, 0.5]} />
                            <CuboidCollider position={[0, 5, 10]} args={[10, 5, 0.5]} />
                        </RigidBody>

                        {Array.from({ length: diceCount }).map((_, i) => {
                            const offset = (i - (diceCount - 1) / 2) * 2;
                            return <Dice key={i} index={i} position={[offset, 3, 0]} />;
                        })}
                    </Physics>

                    {/* MARK: remote cursors */}
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

                    <BackdropPlane />

                    <Environment preset="lobby" background blur={0.75} environmentIntensity={0.5} />

                    <ContactShadows
                        position={[0, 0.01, 0]}
                        opacity={1}
                        scale={20}
                        blur={2}
                        far={4}
                    />
                </Suspense>

                <OrbitControls
                        makeDefault
                        minPolarAngle={0}
                        maxPolarAngle={Math.PI / 2.1}
                        minDistance={5}
                        maxDistance={40}
                        enableDamping
                        dampingFactor={0.05}
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