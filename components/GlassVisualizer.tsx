"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { readSpectrum } from "@/lib/visualizer/audio";
import { computeFrame, shapeSignal, sampleGradient } from "@/lib/visualizer/engine";
import { DEFAULT_PROFILES, type Profile, type VisualizerState } from "@/lib/visualizer/profile";
import { DEFAULT_GLOBALS, type GlobalConfig } from "@/lib/visualizer/config";

const PX_TO_WORLD = 0.003;
const TUBE_RADIUS = 0.035;

export function GlassVisualizer({
  state,
  profiles = DEFAULT_PROFILES,
  config = DEFAULT_GLOBALS,
}: {
  state: VisualizerState;
  profiles?: Record<VisualizerState, Profile>;
  config?: GlobalConfig;
  width?: number;
  height?: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const configRef = useRef(config);
  configRef.current = config;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let w = mount.clientWidth || 480;
    let h = mount.clientHeight || 440;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 0, 5);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    new THREE.TextureLoader().load("/china.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      const envSrc = tex.clone();
      envSrc.mapping = THREE.EquirectangularReflectionMapping;
      envSrc.needsUpdate = true;
      scene.environment = pmrem.fromEquirectangular(envSrc).texture;
      envSrc.dispose();
    });

    const glass = new THREE.MeshPhysicalMaterial({
      transmission: 1,
      thickness: 0.9,
      roughness: 0.05,
      metalness: 0,
      ior: 1.5,
      dispersion: 0.6, // chromatic refraction — the rainbow-edge "real glass" tell
      iridescence: 0.22,
      iridescenceIOR: 1.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      specularIntensity: 1,
      color: new THREE.Color(0xeef6ff),
      attenuationColor: new THREE.Color(0x9fc0ff),
      attenuationDistance: 2.5,
      envMapIntensity: 1.6,
    });

    // Solid sphere (orb / dot) — INDEXED (mergeVertices) so computeVertexNormals
    // averages across faces → smooth shading, not faceted.
    const blobGeo = mergeVertices(new THREE.IcosahedronGeometry(0.6, 32));
    const basePos = blobGeo.attributes.position.clone();
    const blob = new THREE.Mesh(blobGeo, glass);
    scene.add(blob);

    // Glass tube (line / triangle).
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), glass);
    scene.add(tube);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe0c0, 1.0);
    rim.position.set(-4, 1, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.7, 0.85);
    composer.addPass(bloom);

    const pos = blobGeo.attributes.position as THREE.BufferAttribute;

    // Per-vertex unit directions + a few fixed waves for organic, lava-lamp
    // undulation across the surface.
    const baseDir = new Float32Array(pos.count * 3);
    {
      const tmp = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        tmp.fromBufferAttribute(basePos, i).normalize();
        baseDir[i * 3] = tmp.x;
        baseDir[i * 3 + 1] = tmp.y;
        baseDir[i * 3 + 2] = tmp.z;
      }
    }
    const WAVES = Array.from({ length: 6 }, () => {
      const d = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      return { x: d.x, y: d.y, z: d.z, freq: 1.4 + Math.random() * 2.6, speed: 0.25 + Math.random() * 0.8 };
    });
    const waveNorm = 1 / WAVES.length;

    const start = performance.now();
    let blobVis = 1;
    let raf = 0;

    const ro = new ResizeObserver(() => {
      w = mount.clientWidth || w;
      h = mount.clientHeight || h;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    const animate = () => {
      const t = (performance.now() - start) / 1000;
      const profile = profilesRef.current[stateRef.current];
      const { level, bands, pitch } = readSpectrum();

      const wantBlob = profile.shape === "orb" || profile.shape === "dot" ? 1 : 0;
      blobVis += (wantBlob - blobVis) * 0.08;
      const tubeVis = 1 - blobVis;
      blob.visible = blobVis > 0.02;
      tube.visible = tubeVis > 0.02;
      // Audio + levers shared by both forms.
      const cfg = configRef.current;
      const sLevel = shapeSignal(level, cfg.gain, cfg.gamma, cfg.gate);
      const tint = sampleGradient(profile.colorStops, 0.5);
      glass.attenuationColor.setRGB(tint.r / 255, tint.g / 255, tint.b / 255);
      bloom.strength = 0.12 + sLevel * profile.glowStrength * 0.6 + (profile.glow / 60) * 0.25;

      if (blob.visible) {
        const bend = Math.max(-1, Math.min(1, (pitch - 0.5) * 2));
        const lvlGate = Math.min(1, level * 2.2);
        const R = 0.6 * (profile.size / 64);
        // Organic undulation amplified by loudness (lava-lamp push/pull), so it
        // stays malleable even when posStrength is 0. Bounded so it never balloons.
        const baseAmp = profile.motionAmp * 0.12 * (1 + sLevel * 1.2);
        const reactAmp = profile.posStrength * 0.3; // per-frequency surface bulge
        const sizePulse = 1 + sLevel * profile.sizeStrength * 0.25;
        const pitchAmp = profile.pitchStrength * 0.6;
        const mSpeed = profile.motionSpeed || 0.5;
        const B = bands.length;
        for (let i = 0; i < pos.count; i++) {
          const dx = baseDir[i * 3], dy = baseDir[i * 3 + 1], dz = baseDir[i * 3 + 2];
          let nb = 0;
          for (const wv of WAVES) nb += Math.sin((dx * wv.x + dy * wv.y + dz * wv.z) * wv.freq + t * wv.speed * mSpeed);
          nb *= waveNorm;
          const lat = dy * 0.5 + 0.5;
          const bi = B > 0 ? Math.min(B - 1, Math.max(0, Math.floor(lat * (B - 1)))) : 0;
          const be = B > 0 ? shapeSignal(bands[bi], cfg.gain, cfg.gamma, cfg.gate) : 0;
          const factor = Math.min(1.6, Math.max(0.55, sizePulse * (1 + nb * baseAmp + be * reactAmp)));
          const radial = R * factor;
          let y = dy * radial;
          const side = bend >= 0 ? Math.max(0, dy) : Math.max(0, -dy);
          y += bend * side * side * lvlGate * R * pitchAmp;
          pos.setXYZ(i, dx * radial, y, dz * radial);
        }
        pos.needsUpdate = true;
        blobGeo.computeVertexNormals();
        blob.rotation.y = t * 0.18;
        blob.rotation.x = Math.sin(t * 0.18) * 0.15;
        blob.scale.setScalar(blobVis);
      }

      if (tube.visible) {
        const frame = computeFrame({ from: profile, to: profile, k: 1, level, bands, pitch, t, config: configRef.current });
        const pts = frame.points.map((c) => new THREE.Vector3(c.x * PX_TO_WORLD, -c.y * PX_TO_WORLD, 0));
        if (pts.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(pts, frame.closed, "catmullrom", 0.5);
          const geo = new THREE.TubeGeometry(curve, Math.min(260, pts.length), TUBE_RADIUS, 16, frame.closed);
          tube.geometry.dispose();
          tube.geometry = geo;
        }
        tube.scale.setScalar(tubeVis);
      }

      composer.render();
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      composer.dispose();
      renderer.dispose();
      blobGeo.dispose();
      tube.geometry.dispose();
      glass.dispose();
      pmrem.dispose();
      scene.environment?.dispose();
      (scene.background as THREE.Texture | null)?.dispose?.();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
