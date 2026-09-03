import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Props = {
  format: 'vertical' | 'landscape';
};

const COLORS = {
  cream: '#F5F0E7',
  ink: '#111311',
  green: '#20A464',
  deepGreen: '#123D31',
  muted: '#6D746F',
  white: '#FFFFFF',
  line: '#D7D8D2',
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const sceneOpacity = (frame: number, start: number, end: number) => {
  const fadeIn = interpolate(frame, [start, start + 14], [0, 1], clamp);
  const fadeOut = interpolate(frame, [end - 14, end], [1, 0], clamp);
  return Math.min(fadeIn, fadeOut);
};

const Wordmark: React.FC<{size: number}> = ({size}) => (
  <div
    style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 800,
      fontSize: size,
      letterSpacing: -size * 0.055,
      lineHeight: 1,
      color: COLORS.ink,
      whiteSpace: 'nowrap',
    }}
  >
    Lets<span style={{color: COLORS.green}}>Go</span>Ride
  </div>
);

const Eyebrow: React.FC<{children: React.ReactNode; compact?: boolean}> = ({children, compact}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: compact ? '9px 14px' : '11px 18px',
      border: `1px solid ${COLORS.line}`,
      borderRadius: 999,
      color: COLORS.deepGreen,
      background: 'rgba(255,255,255,0.72)',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: compact ? 20 : 24,
      fontWeight: 700,
      letterSpacing: 0.2,
    }}
  >
    {children}
  </div>
);

const PhoneMap: React.FC<{progress: number; vertical: boolean}> = ({progress, vertical}) => {
  const carX = interpolate(progress, [0, 1], [24, 72], clamp);
  const carY = interpolate(progress, [0, 1], [74, 34], clamp);
  const scale = 0.96 + progress * 0.04;

  return (
    <div
      style={{
        width: vertical ? 620 : 520,
        height: vertical ? 930 : 760,
        borderRadius: 72,
        background: COLORS.ink,
        padding: 18,
        boxShadow: '0 34px 80px rgba(20, 29, 24, 0.18)',
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 56,
          overflow: 'hidden',
          position: 'relative',
          background: '#E9E8E1',
        }}
      >
        {[18, 38, 58, 78].map((top) => (
          <div
            key={`h-${top}`}
            style={{
              position: 'absolute',
              left: '-8%',
              right: '-8%',
              top: `${top}%`,
              height: 5,
              background: '#CFD1CB',
              transform: `rotate(${top % 2 === 0 ? -5 : 4}deg)`,
              borderRadius: 99,
            }}
          />
        ))}
        {[19, 47, 73].map((left) => (
          <div
            key={`v-${left}`}
            style={{
              position: 'absolute',
              top: '-8%',
              bottom: '-8%',
              left: `${left}%`,
              width: 5,
              background: '#D8D9D3',
              transform: `rotate(${left % 2 === 0 ? 7 : -7}deg)`,
              borderRadius: 99,
            }}
          />
        ))}

        <div
          style={{
            position: 'absolute',
            left: '18%',
            top: '71%',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: COLORS.deepGreen,
            boxShadow: `0 0 0 10px ${COLORS.white}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: '16%',
            top: '22%',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: COLORS.green,
            boxShadow: `0 0 0 10px ${COLORS.white}`,
          }}
        />

        <svg
          viewBox="0 0 100 100"
          style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
        >
          <path
            d="M20 73 C34 64, 42 57, 51 51 S70 34, 82 24"
            fill="none"
            stroke={COLORS.deepGreen}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray="3 3"
            pathLength="100"
            style={{strokeDashoffset: 100 - progress * 100, strokeDasharray: '100 100'}}
          />
        </svg>

        <div
          style={{
            position: 'absolute',
            left: `${carX}%`,
            top: `${carY}%`,
            width: vertical ? 74 : 64,
            height: vertical ? 74 : 64,
            transform: 'translate(-50%, -50%)',
            borderRadius: 22,
            background: COLORS.white,
            display: 'grid',
            placeItems: 'center',
            fontSize: vertical ? 38 : 32,
            boxShadow: '0 10px 26px rgba(15, 35, 26, 0.18)',
          }}
        >
          🚗
        </div>

        <div
          style={{
            position: 'absolute',
            left: 30,
            right: 30,
            top: 30,
            borderRadius: 28,
            background: COLORS.white,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'Arial, Helvetica, sans-serif',
            boxShadow: '0 14px 34px rgba(15, 35, 26, 0.10)',
          }}
        >
          <div>
            <div style={{fontWeight: 800, fontSize: vertical ? 26 : 22, color: COLORS.ink}}>Ride Now</div>
            <div style={{fontSize: vertical ? 18 : 16, color: COLORS.muted, marginTop: 4}}>Finding nearby drivers</div>
          </div>
          <div style={{fontSize: vertical ? 34 : 30}}>🇿🇼</div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  kicker: string;
  value: string;
  body: string;
  progress: number;
  vertical: boolean;
}> = ({kicker, value, body, progress, vertical}) => {
  const rise = interpolate(progress, [0, 1], [46, 0], clamp);
  return (
    <div
      style={{
        width: vertical ? '100%' : 720,
        borderRadius: vertical ? 48 : 42,
        padding: vertical ? '58px 52px' : '48px 54px',
        background: COLORS.deepGreen,
        color: COLORS.white,
        transform: `translateY(${rise}px)`,
        boxShadow: '0 28px 72px rgba(18, 61, 49, 0.20)',
      }}
    >
      <div
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: vertical ? 23 : 20,
          fontWeight: 700,
          letterSpacing: 1.7,
          textTransform: 'uppercase',
          opacity: 0.72,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontWeight: 900,
          fontSize: vertical ? 142 : 118,
          lineHeight: 0.9,
          letterSpacing: -6,
          marginTop: 30,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: vertical ? 38 : 31,
          lineHeight: 1.18,
          fontWeight: 700,
          marginTop: 34,
          maxWidth: 620,
        }}
      >
        {body}
      </div>
    </div>
  );
};

export const LetsGoRideNoCommission: React.FC<Props> = ({format}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = format === 'vertical';
  const pad = vertical ? 72 : 92;

  const introSpring = spring({frame, fps, config: {damping: 16, stiffness: 95, mass: 0.8}});
  const phoneProgress = interpolate(frame, [18, 86], [0, 1], clamp);
  const sceneTwoProgress = interpolate(frame, [100, 148], [0, 1], clamp);
  const sceneThreeProgress = interpolate(frame, [225, 275], [0, 1], clamp);
  const finalSpring = spring({frame: frame - 340, fps, config: {damping: 17, stiffness: 90, mass: 0.9}});

  const introOpacity = sceneOpacity(frame, 0, 100);
  const commissionOpacity = sceneOpacity(frame, 90, 225);
  const passengerOpacity = sceneOpacity(frame, 210, 340);
  const finalOpacity = sceneOpacity(frame, 325, 450);

  return (
    <AbsoluteFill style={{background: COLORS.cream, overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          top: vertical ? 54 : 38,
          left: pad,
          right: pad,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20,
        }}
      >
        <Wordmark size={vertical ? 48 : 40} />
        <div style={{fontSize: vertical ? 32 : 27}}>🇿🇼</div>
      </div>

      <AbsoluteFill
        style={{
          opacity: introOpacity,
          padding: vertical ? '190px 72px 90px' : '130px 92px 70px',
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          gap: vertical ? 68 : 110,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            transform: `translateY(${(1 - introSpring) * 34}px)`,
            opacity: introSpring,
            alignSelf: vertical ? 'stretch' : 'center',
          }}
        >
          <Eyebrow compact={!vertical}>Built for Zimbabwe 🇿🇼</Eyebrow>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: COLORS.ink,
              fontWeight: 900,
              fontSize: vertical ? 98 : 92,
              lineHeight: 0.98,
              letterSpacing: vertical ? -5 : -4.5,
              marginTop: 34,
              maxWidth: vertical ? 900 : 760,
            }}
          >
            Your city. Your ride. Your move.
          </div>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: COLORS.muted,
              fontSize: vertical ? 34 : 29,
              lineHeight: 1.35,
              marginTop: 30,
              maxWidth: 720,
            }}
          >
            Ride, drive and deliver with one Zimbabwean mobility platform.
          </div>
        </div>
        <PhoneMap progress={phoneProgress} vertical={vertical} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: commissionOpacity,
          padding: vertical ? '180px 72px 92px' : '130px 92px 70px',
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: vertical ? 56 : 96,
        }}
      >
        <div style={{flex: 1, width: '100%'}}>
          <Eyebrow compact={!vertical}>For drivers</Eyebrow>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontWeight: 900,
              color: COLORS.ink,
              fontSize: vertical ? 82 : 74,
              lineHeight: 1,
              letterSpacing: -4,
              marginTop: 28,
              maxWidth: 760,
            }}
          >
            Your work should pay you.
          </div>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: COLORS.muted,
              fontSize: vertical ? 34 : 28,
              lineHeight: 1.35,
              marginTop: 24,
              maxWidth: 690,
            }}
          >
            No platform commission on the driver fare. Simple, clear and built to let drivers keep what they earn.
          </div>
        </div>
        <MetricCard
          kicker="Platform commission"
          value="0%"
          body="Drivers keep 100% of the fare."
          progress={sceneTwoProgress}
          vertical={vertical}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: passengerOpacity,
          padding: vertical ? '190px 72px 92px' : '140px 92px 80px',
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: vertical ? 54 : 110,
        }}
      >
        <div
          style={{
            width: vertical ? '100%' : 650,
            height: vertical ? 520 : 620,
            borderRadius: 52,
            background: COLORS.white,
            border: `1px solid ${COLORS.line}`,
            padding: vertical ? 50 : 54,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 24px 70px rgba(23, 32, 27, 0.09)',
          }}
        >
          <div style={{fontFamily: 'Arial, Helvetica, sans-serif', fontSize: vertical ? 24 : 21, color: COLORS.muted, fontWeight: 700}}>
            PASSENGER EXPERIENCE
          </div>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: vertical ? 66 : 58,
              lineHeight: 1.02,
              fontWeight: 900,
              color: COLORS.ink,
              letterSpacing: -3,
              marginTop: 28,
            }}
          >
            Less platform pressure on every ride.
          </div>
          <div
            style={{
              marginTop: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              transform: `translateX(${interpolate(sceneThreeProgress, [0, 1], [-34, 0], clamp)}px)`,
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                borderRadius: 22,
                background: COLORS.deepGreen,
                color: COLORS.white,
                display: 'grid',
                placeItems: 'center',
                fontSize: 34,
              }}
            >
              ✓
            </div>
            <div style={{fontFamily: 'Arial, Helvetica, sans-serif', fontSize: vertical ? 31 : 27, fontWeight: 700, color: COLORS.ink}}>
              Built to keep fares competitive
            </div>
          </div>
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              transform: `translateX(${interpolate(sceneThreeProgress, [0, 1], [-48, 0], clamp)}px)`,
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                borderRadius: 22,
                border: `2px solid ${COLORS.deepGreen}`,
                color: COLORS.deepGreen,
                display: 'grid',
                placeItems: 'center',
                fontSize: 32,
              }}
            >
              ⚡
            </div>
            <div style={{fontFamily: 'Arial, Helvetica, sans-serif', fontSize: vertical ? 31 : 27, fontWeight: 700, color: COLORS.ink}}>
              Fast, straightforward signup
            </div>
          </div>
        </div>

        <div style={{flex: 1, width: '100%'}}>
          <Eyebrow compact={!vertical}>For passengers</Eyebrow>
          <div
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontWeight: 900,
              color: COLORS.ink,
              fontSize: vertical ? 86 : 78,
              lineHeight: 0.98,
              letterSpacing: -4,
              marginTop: 28,
              maxWidth: 780,
            }}
          >
            A better ride starts with a fairer model.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          opacity: finalOpacity,
          padding: vertical ? '180px 72px 100px' : '120px 92px 70px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{transform: `scale(${0.9 + finalSpring * 0.1})`, opacity: finalSpring}}>
          <Wordmark size={vertical ? 116 : 108} />
        </div>
        <div
          style={{
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: vertical ? 58 : 48,
            lineHeight: 1.05,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: -2.5,
            marginTop: 40,
          }}
        >
          Ride. Drive. Deliver. 🇿🇼
        </div>
        <div
          style={{
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: vertical ? 31 : 26,
            color: COLORS.muted,
            lineHeight: 1.35,
            marginTop: 24,
            maxWidth: 780,
          }}
        >
          Zimbabwe moves with LetsGoRide.
        </div>
        <div
          style={{
            marginTop: 58,
            background: COLORS.deepGreen,
            color: COLORS.white,
            borderRadius: 999,
            padding: vertical ? '22px 42px' : '18px 36px',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: vertical ? 29 : 24,
            fontWeight: 800,
            letterSpacing: 0.2,
          }}
        >
          letsgoride.site
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
