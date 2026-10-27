'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header, { type HeaderHandle } from './Header';
import Minimap, { type MinimapHandle } from './Minimap';
import InstrumentCluster, { type InstrumentClusterHandle } from './InstrumentCluster';
import MobileTelemetry, { type MobileTelemetryHandle } from './MobileTelemetry';
import Panels, { type PanelsHandle } from './Panels';
import Loader, { type LoaderHandle } from './Loader';
import type { EngineRefs, LoaderPhase } from '@/engine/types';
import type { Engine } from '@/engine/engine';

const CAR_GLB_URL = '/models/car.glb';

export default function LapOneEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const headerRef = useRef<HeaderHandle>(null);
  const minimapRef = useRef<MinimapHandle>(null);
  const clusterRef = useRef<InstrumentClusterHandle>(null);
  const mobileTeleRef = useRef<MobileTelemetryHandle>(null);
  const panelsRef = useRef<PanelsHandle>(null);
  const loaderRef = useRef<LoaderHandle>(null);

  const [phase, setPhase] = useState<LoaderPhase>('loading');
  const [progress, setProgress] = useState(0);
  const [loadNote, setLoadNote] = useState('Warming the tyres');
  const [soundOn, setSoundOn] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);

  const engineRef = useRef<Engine | null>(null);

  const retry = useCallback(() => {
    setFatalError(null);
    setPhase('loading');
    setProgress(0);
    setBootKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const { initEngine } = await import('@/engine/engine');
      if (disposed) return;

      const refs: EngineRefs = {
        canvas: canvasRef.current!,
        loader: loaderRef.current!.getRefs().loader,
        loaderFill: loaderRef.current!.getRefs().loaderFill,
        loaderNote: loaderRef.current!.getRefs().loaderNote,
        loaderLights: loaderRef.current!.getRefs().loaderLights,
        enterSoundBtn: loaderRef.current!.getRefs().enterSoundBtn,
        enterMuteBtn: loaderRef.current!.getRefs().enterMuteBtn,
        soundBtn: headerRef.current!.getRefs().soundBtn,
        musicBtn: headerRef.current!.getRefs().musicBtn,
        homeLink: headerRef.current!.getRefs().homeLink,
        chips: headerRef.current!.getRefs().chips,
        panels: panelsRef.current!.getPanelRefs(),
        cluster: { svg: clusterRef.current!.getSvg() },
        mobileGear: mobileTeleRef.current!.getRefs().gear,
        mobileSpeed: mobileTeleRef.current!.getRefs().speed,
        minimapEl: minimapRef.current!.getRefs().root,
        minimapPathBg: minimapRef.current!.getRefs().pathBg,
        minimapPathProgress: minimapRef.current!.getRefs().pathProgress,
        minimapDot: minimapRef.current!.getRefs().dot,
        minimapStart: minimapRef.current!.getRefs().start,
        minimapDistance: minimapRef.current!.getRefs().distance,
        loaderTrackPathBg: loaderRef.current!.getRefs().trackPathBg,
        loaderTrackPathDraw: loaderRef.current!.getRefs().trackPathDraw,
        lapTimeEl: panelsRef.current!.getLapTimeEl(),
        goLinks: panelsRef.current!.getGoLinks(),
        chipLinks: headerRef.current!.getRefs().chipLinks,
      };

      const engine = initEngine(CAR_GLB_URL, refs, {
        onLoaderPhase: (p) => setPhase(p),
        onLoadProgress: (frac) => {
          setProgress(frac);
          if (frac < 0.2) setLoadNote('Building the circuit');
          else if (frac < 0.35) setLoadNote('Lighting the pit lane');
          else if (frac < 0.7) setLoadNote('Unpacking the car');
          else if (frac < 0.92) setLoadNote('Warming the tyres');
          else setLoadNote('Almost on the grid');
        },
        onSoundChange: setSoundOn,
        onMusicChange: setMusicOn,
        onFlagReached: () => {},
        onQualityTierChange: () => {},
        onFatalError: (e) => {
          console.error(e);
          setFatalError(e instanceof Error ? e.message : 'Something went wrong loading the circuit.');
        },
      });
      engineRef.current = engine;
    })();

    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // bootKey intentionally re-runs this whole effect on retry
  }, [bootKey]);

  return (
    <>
      <canvas id="gl" aria-hidden="true" ref={canvasRef} />
      <div className="veil" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <Header ref={headerRef} soundOn={soundOn} musicOn={musicOn} />
      <Minimap ref={minimapRef} />
      <InstrumentCluster ref={clusterRef} />
      <MobileTelemetry ref={mobileTeleRef} />
      <Loader ref={loaderRef} phase={phase} progressFraction={progress} loadNote={loadNote} onRetry={retry} fatalError={fatalError} />
      <Panels ref={panelsRef} />
      <div id="track" aria-hidden="true" />
    </>
  );
}
