import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px',
          background: 'radial-gradient(ellipse 90% 70% at 30% 110%, #3a2418 0%, #06070a 60%), #06070a',
          color: '#f4f4f1',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#ffd23f',
            }}
          />
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#b9bdc6' }}>
            A GT3 STUDY
          </div>
        </div>
        <div style={{ fontSize: 140, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 0.85 }}>
          Lap One
        </div>
        <div style={{ fontSize: 30, color: '#b9bdc6', marginTop: 24, maxWidth: 900 }}>
          One car, one circuit, no brakes on the page. Scroll to drive it.
        </div>
      </div>
    ),
    { ...size },
  );
}
