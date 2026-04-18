import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  AbsoluteFill,
  Audio,
  staticFile,
} from 'remotion';

const BRAND_BLUE = '#1a3c5e';
const GOLD = '#FFD700';
const GREEN = '#1E8449';
const W = 1080;
const H = 1920;

// ─── Timing (frames @ 30fps) ─────────────────────────────────────────────────
//  0-90   Max alearga de la dreapta spre stanga
//  90-115 Max se opreste langa cutie (bounce)
// 115-130 Max ridica barosul (switch la swing.png)
// 130-145 Max loveste cutia (switch la impact.png)
// 130-165 Ecranul se scutura + flash alb
// 165-200 Fade in Scene 2
// 200+    Max se prezinta, text apare rand pe rand

export const MaxIntro = ({ audioSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ─── Scene 1: Miscare Max ──────────────────────────────────────────────────

  // Intrare alergand: spring de la dreapta spre stanga
  const runProgress = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 70 },
    durationInFrames: 88,
  });
  const maxX = interpolate(runProgress, [0, 1], [W + 300, W * 0.12]);

  // Bounce la oprire (frames 88-108)
  const bounceProgress = spring({
    frame: Math.max(0, frame - 88),
    fps,
    config: { damping: 6, stiffness: 280 },
    durationInFrames: 20,
  });
  const bounceScale = frame >= 88
    ? interpolate(bounceProgress, [0, 0.4, 1], [1, 1.15, 1])
    : 1;

  // Cutia de carton apare de jos (frames 90-108)
  const boxY = interpolate(frame, [90, 108], [H + 50, H * 0.60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Scuturare ecran la impact (frames 130-148)
  const shakeIntensity = interpolate(frame, [130, 148], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shakeX = frame >= 130 && frame < 148
    ? Math.sin((frame - 130) * 2.8) * shakeIntensity : 0;
  const shakeY = frame >= 130 && frame < 148
    ? Math.cos((frame - 130) * 3.5) * shakeIntensity * 0.6 : 0;

  // Flash alb
  const flashOpacity = interpolate(
    frame,
    [130, 136, 148, 165],
    [0, 0.95, 0.5, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Ce poza Max sa afisam in Scene 1
  const showRunning = frame < 115;
  const showSwing   = frame >= 115 && frame < 130;
  const showImpact  = frame >= 130 && frame < 165;

  // Stele la impact
  const starsOpacity = interpolate(frame, [130, 155, 165], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const starsDist = interpolate(frame, [130, 165], [0, 250], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── Scene 2: Max se prezinta ─────────────────────────────────────────────

  const scene2Opacity = interpolate(frame, [163, 190], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Max apare cu spring bounce
  const maxPresentSpring = spring({
    frame: Math.max(0, frame - 168),
    fps,
    config: { damping: 14, stiffness: 120 },
    durationInFrames: 35,
  });
  const maxPresentScale = interpolate(maxPresentSpring, [0, 1], [0, 1]);

  // Text reveals
  const text1Opacity = interpolate(frame, [200, 220], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const text2Opacity = interpolate(frame, [228, 248], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const text3Opacity = interpolate(frame, [256, 276], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ctaOpacity   = interpolate(frame, [290, 310], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const urlOpacity   = interpolate(frame, [318, 336], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Text slide-in de jos
  const textSlide = (startFrame) => ({
    transform: `translateY(${interpolate(frame, [startFrame, startFrame + 20], [40, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })}px)`,
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: BRAND_BLUE,
      fontFamily: 'Arial Black, Arial, sans-serif',
      transform: `translate(${shakeX}px, ${shakeY}px)`,
    }}>

      {/* ═══════════════════════════════════════════════════════
          SCENE 1 — Max alearga si loveste
      ═══════════════════════════════════════════════════════ */}
      {frame < 165 && (
        <>
          {/* Header */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 155,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <div style={{ color: '#fff', fontSize: 50, fontWeight: 900, letterSpacing: -1 }}>
              Perfekt Sauber Service
            </div>
            <div style={{ color: GOLD, fontSize: 32, fontWeight: 700 }}>
              Entrümpelung &amp; Reinigung
            </div>
          </div>

          {/* Cutia de carton */}
          {frame >= 90 && (
            <div style={{
              position: 'absolute', left: W * 0.07, top: boxY,
              width: 240, height: 240,
              background: '#C4922A', border: '6px solid #8B6914',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 80,
            }}>
              📦
            </div>
          )}

          {/* Max alergand */}
          {showRunning && (
            <div style={{
              position: 'absolute',
              left: maxX,
              bottom: H * 0.12,
              width: 750, height: 850,
              transform: `scaleX(-1) scale(${bounceScale})`,
              transformOrigin: 'bottom center',
              mixBlendMode: 'multiply',
            }}>
              <Img src={staticFile('max-running.png')}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {/* Max cu barosul ridicat */}
          {showSwing && (
            <div style={{
              position: 'absolute',
              left: W * 0.10, bottom: H * 0.10,
              width: 780, height: 900,
              mixBlendMode: 'multiply',
            }}>
              <Img src={staticFile('max-swing.png')}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {/* Max la impact */}
          {showImpact && (
            <div style={{
              position: 'absolute',
              left: -W * 0.05, bottom: H * 0.08,
              width: 900, height: 980,
              mixBlendMode: 'multiply',
            }}>
              <Img src={staticFile('max-impact.png')}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {/* Stele la impact */}
          {frame >= 130 && frame < 165 && (
            <div style={{ position: 'absolute', top: H * 0.48, left: W * 0.48 }}>
              {[
                { emoji: '💥', angle: 0 },
                { emoji: '⭐', angle: 1.2 },
                { emoji: '✨', angle: 2.4 },
                { emoji: '⚡', angle: 3.6 },
                { emoji: '💫', angle: 4.8 },
              ].map(({ emoji, angle }, i) => (
                <div key={i} style={{
                  position: 'absolute', fontSize: 64,
                  opacity: starsOpacity,
                  transform: `translate(${Math.cos(angle) * starsDist}px, ${Math.sin(angle) * starsDist}px)`,
                }}>
                  {emoji}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          SCENE 2 — Max se prezinta
      ═══════════════════════════════════════════════════════ */}
      {frame >= 160 && (
        <div style={{ opacity: scene2Opacity, position: 'absolute', inset: 0 }}>
          <AbsoluteFill style={{
            background: `linear-gradient(175deg, #1a3c5e 0%, #0d2235 100%)`,
          }} />

          {/* Header scene 2 */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 155,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ color: GOLD, fontSize: 44, fontWeight: 900 }}>
              ⭐ Perfekt Sauber Service ⭐
            </div>
          </div>

          {/* Max prezentare */}
          <div style={{
            position: 'absolute',
            left: (W - 720) / 2,
            top: H * 0.14,
            width: 720, height: 820,
            transform: `scale(${maxPresentScale})`,
            transformOrigin: 'bottom center',
            mixBlendMode: 'multiply',
          }}>
            <Img src={staticFile('max-present.png')}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          {/* Text area */}
          <div style={{
            position: 'absolute', top: H * 0.62,
            left: 50, right: 50, textAlign: 'center',
            overflow: 'hidden',
          }}>
            <div style={{ opacity: text1Opacity, ...textSlide(200), marginBottom: 18 }}>
              <span style={{ color: '#fff', fontSize: 60, fontWeight: 900, lineHeight: 1.1 }}>
                Hallo! Ich bin Max!
              </span>
            </div>

            <div style={{ opacity: text2Opacity, ...textSlide(228), marginBottom: 18 }}>
              <span style={{ color: GOLD, fontSize: 36, fontWeight: 700, lineHeight: 1.3 }}>
                Das Maskottchen von{'\n'}perfektsauberservice.com
              </span>
            </div>

            <div style={{ opacity: text3Opacity, ...textSlide(256), marginBottom: 32 }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 30, lineHeight: 1.5 }}>
                Wir räumen Keller, Wohnungen &amp; Dachböden{'\n'}
                schnell, gründlich &amp; zu fairen Preisen!{'\n'}
                In Rastatt, Baden-Baden &amp; Karlsruhe.
              </span>
            </div>

            {/* CTA box */}
            <div style={{
              opacity: ctaOpacity,
              background: GREEN, borderRadius: 22,
              padding: '26px 36px', marginBottom: 20,
            }}>
              <div style={{ color: '#fff', fontSize: 34, fontWeight: 900 }}>
                Kostenlose Besichtigung
              </div>
              <div style={{ color: GOLD, fontSize: 50, fontWeight: 900, marginTop: 6 }}>
                +49 163 9087197
              </div>
            </div>

            {/* URL */}
            <div style={{
              opacity: urlOpacity,
              color: 'rgba(255,255,255,0.7)', fontSize: 26,
              fontFamily: 'Arial, sans-serif', fontWeight: 400,
            }}>
              perfektsauberservice.com
            </div>
          </div>
        </div>
      )}

      {/* ─── Flash alb ──────────────────────────────────────────────────────── */}
      <AbsoluteFill style={{
        backgroundColor: 'white',
        opacity: flashOpacity,
        pointerEvents: 'none',
      }} />

      {/* ─── Audio ──────────────────────────────────────────────────────────── */}
      {audioSrc && (
        <Audio src={staticFile('max-voice.mp3')} startFrom={0} />
      )}

    </AbsoluteFill>
  );
};
