import { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial } from '@react-three/drei/core/MeshDistortMaterial';
import { Environment } from '@react-three/drei/core/Environment';
import * as THREE from 'three';

const OrganicOrb = ({ isSpeaking }: { isSpeaking: boolean }) => {
  const materialRef = useRef<any>(null);

  // Smoothly interpolate distortion and speed based on the voice state
  useFrame((_, delta) => {
    if (materialRef.current) {
      // When speaking: high distortion, fast morphing
      // When idle: calm, breathing neural mass
      const targetDistort = isSpeaking ? 0.55 : 0.15;
      const targetSpeed = isSpeaking ? 4.5 : 0.8;
      
      materialRef.current.distort = THREE.MathUtils.lerp(
        materialRef.current.distort || 0.15, 
        targetDistort, 
        delta * 4 // Interpolation speed
      );
      
      materialRef.current.speed = THREE.MathUtils.lerp(
        materialRef.current.speed || 0.8, 
        targetSpeed, 
        delta * 4
      );
    }
  });

  return (
    <group>
      {/* 
        INNER CORE: The morphing neural mass.
        Using MeshDistortMaterial (which extends MeshPhysicalMaterial) 
        for gorgeous, premium Gold/Amber PBR reflections.
      */}
      <mesh>
        {/* High detail geometry for smooth distortion */}
        <icosahedronGeometry args={[1, 64]} />
        <MeshDistortMaterial
          ref={materialRef}
          color="#D4AF37" // Premium Gold
          emissive="#523903" // Subtle inner warmth
          envMapIntensity={2.0} // Hyper-reacts to the Environment map
          clearcoat={1.0} // Glassy sheen
          clearcoatRoughness={0.1}
          metalness={0.6}
          roughness={0.2}
          distort={0.15} // Starting values
          speed={0.8}
        />
      </mesh>
      
      {/* 
        OUTER CORONA: A subtle, additive-blending halo that gives the orb
        a bleeding glow onto the beige background without darkening the canvas.
      */}
      <mesh scale={1.22}>
        <icosahedronGeometry args={[1, 32]} />
        <meshBasicMaterial
          color="#D97706"
          transparent={true}
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

export function AICore({ isSpeaking = false }: { isSpeaking?: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
      <Canvas 
        camera={{ position: [0, 0, 4.5], fov: 45 }} 
        gl={{ alpha: true, antialias: true }} 
        dpr={typeof window !== 'undefined' ? window.devicePixelRatio : 1}
      >
        <Suspense fallback={null}>
          {/* Warm studio lighting setup */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 10, 5]} intensity={1.5} color="#FFD700" />
          <directionalLight position={[-5, -10, -5]} intensity={0.5} color="#FFF8DC" />
          
          {/* Provides the reflections necessary for metalness/clearcoat to look premium */}
          <Environment preset="city" />
          
          {/* The orb itself */}
          <OrganicOrb isSpeaking={isSpeaking} />
        </Suspense>
      </Canvas>
    </div>
  );
}
