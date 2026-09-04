import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const C = {
  paper: "#F5F3ED",
  ink: "#111512",
  green: "#118B44",
  muted: "#62685F",
  rule: "#D7DAD2",
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.75, 0.2, 1);
const motion = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing: ease });
const fonts = [400, 500, 600, 700, 800, 900]
  .map(
    (weight) =>
      `@font-face{font-family:Inter;src:url('${staticFile(`inter-latin-${weight}-normal.woff2`)}') format('woff2');font-weight:${weight};font-display:block}`,
  )
  .join("\n");

// Matches mobile/components/layout/BrandLogo.tsx: a wordmark only, Go #118B44.
// Do not use the repository's older icon-and-tagline PNG lockup for this campaign.
const Wordmark: React.FC<{ size?: number; light?: boolean }> = ({
  size = 46,
  light = false,
}) => (
  <div
    style={{
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: size,
      lineHeight: 1.1,
      fontWeight: 900,
      letterSpacing: 0,
      color: light ? "#FFFFFF" : C.ink,
      whiteSpace: "nowrap",
    }}
  >
    Lets<span style={{ color: C.green }}>Go</span>Ride
  </div>
);

const Flag: React.FC = () => (
  <Img
    src={staticFile("zimbabwe.svg")}
    aria-label="Zimbabwe flag"
    style={{ width: 60, height: 40, objectFit: "contain" }}
  />
);

const Header: React.FC<{ light?: boolean }> = ({ light = false }) => (
  <div
    style={{
      position: "absolute",
      top: 184,
      left: 82,
      right: 128,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 20,
    }}
  >
    <Wordmark light={light} />
    <Flag />
  </div>
);

const Reveal: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: motion(f, delay, delay + 15),
        transform: `translateY(${motion(f, delay, delay + 24, 35, 0)}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Arrow: React.FC<{ size?: number; color?: string }> = ({
  size = 36,
  color = C.ink,
}) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
    <path
      d="M6 18H29M20 8L30 18L20 28"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: "absolute", left: 82, right: 125, top: 325 }}>
        <Reveal
          style={{
            fontSize: 118,
            lineHeight: 0.99,
            letterSpacing: -7,
            fontWeight: 700,
          }}
        >
          Zimbabwe,
          <br />
          let’s move.
        </Reveal>
        <Reveal
          delay={10}
          style={{ fontSize: 33, fontWeight: 500, marginTop: 35 }}
        >
          Your city. Your ride.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          top: 690,
          left: 0,
          width: 1080,
          height: 1100,
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile("harare.webp")}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "46% center",
            transform: `scale(${interpolate(f, [0, 90], [1.025, 1.095], clamp)}) translateX(${interpolate(f, [0, 90], [6, -6], clamp)}px)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(transparent 58%, rgba(0,0,0,.52))",
          }}
        />
        <Reveal
          delay={15}
          style={{
            position: "absolute",
            left: 82,
            bottom: 218,
            fontSize: 24,
            letterSpacing: 3,
            fontWeight: 600,
            color: "white",
          }}
        >
          MADE FOR YOUR EVERYDAY.
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

const Driver: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = spring({
    frame: f - 4,
    fps,
    config: { damping: 22, stiffness: 110 },
    durationInFrames: 28,
  });
  return (
    <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
      <div style={{ position: "absolute", left: 82, right: 128, top: 346 }}>
        <Reveal
          style={{
            fontSize: 24,
            letterSpacing: 3,
            fontWeight: 600,
            color: "#BFC8BD",
          }}
        >
          FOR DRIVERS
        </Reveal>
        <div
          style={{
            fontSize: 363,
            fontWeight: 600,
            letterSpacing: -27,
            lineHeight: 1,
            marginTop: 87,
            transform: `translateY(${(1 - settle) * 50}px)`,
            opacity: motion(f, 1, 13),
          }}
        >
          0<span style={{ fontSize: 244, letterSpacing: -13 }}>%</span>
        </div>
        <Reveal
          delay={8}
          style={{
            fontSize: 50,
            letterSpacing: -2,
            fontWeight: 500,
            marginTop: 15,
          }}
        >
          Platform commission.
        </Reveal>
        <div
          style={{
            marginTop: 108,
            height: 2,
            background: "#FFFFFF30",
            transformOrigin: "left",
            transform: `scaleX(${motion(f, 12, 45)})`,
          }}
        />
        <Reveal
          delay={19}
          style={{
            marginTop: 70,
            fontSize: 47,
            fontWeight: 400,
            color: "#BBC4B9",
          }}
        >
          Drivers keep
        </Reveal>
        <Reveal
          delay={25}
          style={{
            fontSize: 93,
            fontWeight: 600,
            letterSpacing: -5,
            lineHeight: 1.08,
            marginTop: 20,
          }}
        >
          100%
          <br />
          of the fare.
        </Reveal>
        <Reveal
          delay={35}
          style={{ fontSize: 30, color: "#BBC4B9", marginTop: 74 }}
        >
          Your work. Your earnings.
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

// A deliberately schematic map, not a licensed basemap or live GPS feed.
const RouteMap: React.FC = () => {
  const f = useCurrentFrame();
  const p = motion(f, 14, 92);
  // Same three-segment polyline for the moving marker and the route.
  const points = [
    { x: 114, y: 322 },
    { x: 114, y: 206 },
    { x: 302, y: 206 },
    { x: 302, y: 115 },
  ];
  const lengths = [116, 188, 91];
  let distance = p * 395;
  let segment = 0;
  while (segment < 2 && distance > lengths[segment]) {
    distance -= lengths[segment];
    segment++;
  }
  const t = Math.min(1, distance / lengths[segment]);
  const a = points[segment],
    b = points[segment + 1];
  const x = a.x + (b.x - a.x) * t,
    y = a.y + (b.y - a.y) * t;
  return (
    <svg
      viewBox="0 0 470 445"
      width="470"
      height="445"
      style={{ position: "absolute", top: 53, left: 0 }}
    >
      <rect width="470" height="445" fill="#E9EBE4" />
      <path
        d="M348 0H470V160L392 153L348 95ZM0 347L70 345L70 445H0Z"
        fill="#D3DDCA"
      />
      {[30, 114, 207, 302, 410].map((x) => (
        <path key={x} d={`M${x} -20V465`} stroke="#FFFFFF" strokeWidth="16" />
      ))}
      {[43, 115, 206, 322, 419].map((y) => (
        <path key={y} d={`M-10 ${y}H480`} stroke="#FFFFFF" strokeWidth="16" />
      ))}
      <path d="M-40 255L510 18" stroke="#D7DACF" strokeWidth="26" />
      <path d="M-40 255L510 18" stroke="#FFFFFF" strokeWidth="20" />
      <text
        x="186"
        y="360"
        fill="#7E867A"
        fontSize="16"
        fontWeight="600"
        letterSpacing="3"
      >
        HARARE
      </text>
      <path
        d="M114 322V206H302V115"
        stroke={C.ink}
        strokeWidth="6"
        fill="none"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - p}
      />
      <circle
        cx="114"
        cy="322"
        r="9"
        fill={C.ink}
        stroke="white"
        strokeWidth="4"
      />
      <circle
        cx="302"
        cy="115"
        r="9"
        fill={C.ink}
        stroke="white"
        strokeWidth="4"
      />
      <g transform={`translate(${x},${y}) rotate(${segment === 1 ? 90 : 0})`}>
        <rect
          x="-13"
          y="-22"
          width="26"
          height="44"
          rx="8"
          fill="white"
          stroke="#222B25"
          strokeWidth="2"
        />
        <rect x="-8" y="-12" width="16" height="17" rx="3" fill="#39483D" />
        <path d="M-8 10H8" stroke="#BBC4B9" strokeWidth="3" />
      </g>
    </svg>
  );
};

const Phone: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 662,
        left: 264,
        width: 510,
        height: 998,
        borderRadius: 69,
        background: "#121513",
        border: "3px solid #414940",
        padding: 17,
        boxShadow: "8px 36px 60px #10151024",
        transform: `translateY(${motion(f, 0, 28, 90, 0)}px) rotate(${motion(f, 0, 60, -5, -1.5)}deg)`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 470,
          height: 958,
          background: "#F5F6F2",
          borderRadius: 51,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 30,
            right: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 2,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span>9:41</span>
          <span
            style={{
              width: 102,
              height: 25,
              borderRadius: 18,
              background: "#111512",
            }}
          />
          <svg width="39" height="13">
            <rect
              x="1"
              y="2"
              width="32"
              height="9"
              rx="3"
              fill="none"
              stroke="#111512"
              strokeWidth="1.5"
            />
            <rect x="4" y="4" width="25" height="5" rx="1" fill="#111512" />
            <path d="M36 4V9" stroke="#111512" strokeWidth="2" />
          </svg>
        </div>
        <RouteMap />
        <div
          style={{
            position: "absolute",
            top: 75,
            left: 21,
            width: 43,
            height: 43,
            borderRadius: 24,
            background: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 34,
            lineHeight: 1,
          }}
        >
          ‹
        </div>
        <div
          style={{
            position: "absolute",
            top: 86,
            left: 184,
            background: "white",
            padding: "9px 15px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            borderRadius: 20,
          }}
        >
          RIDE NOW
        </div>
        <div
          style={{
            position: "absolute",
            top: 453,
            left: 11,
            right: 11,
            background: "white",
            border: "1px solid #DDE0D7",
            borderRadius: 30,
            padding: "13px 19px 22px",
          }}
        >
          <div
            style={{
              margin: "0 auto 18px",
              width: 44,
              height: 4,
              borderRadius: 2,
              background: "#D7DAD2",
            }}
          />
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4 }}>
            RIDE NOW
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: -1,
              marginTop: 3,
            }}
          >
            Where to?
          </div>
          <div
            style={{
              background: "#F7F7F5",
              borderRadius: 18,
              marginTop: 16,
              padding: "4px 14px",
            }}
          >
            {[
              ["PICKUP", "Harare"],
              ["DESTINATION", "Your destination"],
            ].map(([label, value], i) => (
              <div
                key={label}
                style={{
                  height: 57,
                  display: "flex",
                  gap: 13,
                  alignItems: "center",
                  borderTop: i ? "1px solid #E2E4DD" : undefined,
                }}
              >
                <div
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: i ? 2 : 20,
                    border: "2px solid #111512",
                    background: i ? C.ink : "transparent",
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      color: C.muted,
                      fontWeight: 700,
                      letterSpacing: 1,
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>
                    {value}
                  </div>
                </div>
                <span
                  style={{ marginLeft: "auto", fontSize: 22, color: "#899080" }}
                >
                  ›
                </span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, margin: "17px 0 10px" }}>
            Choose your ride
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              ["Economy", "ride-economy.png"],
              ["Comfort", "ride-comfort.png"],
            ].map(([name, asset], i) => (
              <div
                key={name}
                style={{
                  flex: 1,
                  background: i ? "#F6F6F3" : "#ECEEE8",
                  border: i ? "1px solid #E6E8E0" : "2px solid #111512",
                  borderRadius: 16,
                  height: 101,
                  textAlign: "center",
                }}
              >
                <Img
                  src={staticFile(asset)}
                  style={{ width: 146, height: 69, objectFit: "contain" }}
                />
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: -4 }}>
                  {name}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 17,
              height: 51,
              background: C.ink,
              color: "white",
              borderRadius: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 18px",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Choose your ride
            <Arrow size={23} color="white" />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 15,
            left: 75,
            right: 75,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#687063",
          }}
        >
          <span>Home</span>
          <span>Activity</span>
          <span>Account</span>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 167,
            width: 136,
            height: 4,
            borderRadius: 2,
            background: C.ink,
          }}
        />
      </div>
    </div>
  );
};

const Passenger: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <div style={{ position: "absolute", left: 82, top: 331, right: 128 }}>
      <Reveal
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: 3,
          color: C.muted,
        }}
      >
        FOR PASSENGERS
      </Reveal>
      <Reveal
        delay={3}
        style={{
          fontSize: 91,
          fontWeight: 600,
          letterSpacing: -5.5,
          lineHeight: 1.04,
          marginTop: 29,
        }}
      >
        Your next ride.
        <br />A few taps away.
      </Reveal>
    </div>
    <Phone />
    <div
      style={{
        position: "absolute",
        top: 1720,
        width: "100%",
        textAlign: "center",
        fontSize: 19,
        color: C.muted,
      }}
    >
      Illustrative app view
    </div>
  </AbsoluteFill>
);

const Close: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: "absolute", left: 82, right: 128, top: 430 }}>
        <Reveal
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 3,
            color: C.muted,
          }}
        >
          YOUR MOVE.
        </Reveal>
        <Reveal
          delay={3}
          style={{
            fontSize: 121,
            fontWeight: 600,
            letterSpacing: -7,
            lineHeight: 1.01,
            marginTop: 38,
          }}
        >
          Let’s go,
          <br />
          Zimbabwe.
        </Reveal>
        <Reveal delay={8} style={{ marginTop: 83 }}>
          <Wordmark size={93} />
        </Reveal>
        <Reveal
          delay={14}
          style={{
            fontSize: 35,
            fontWeight: 500,
            marginTop: 70,
            lineHeight: 1.45,
          }}
        >
          Book a ride.
          <br />
          Join as a driver.
        </Reveal>
        <Reveal
          delay={18}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 69,
            paddingBottom: 22,
            borderBottom: "2px solid #111512",
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: -1.8,
          }}
        >
          letsgoride.site
          <Arrow size={47} />
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 82,
          right: 128,
          top: 1538,
          display: "flex",
          alignItems: "center",
          gap: 19,
          fontSize: 24,
          fontWeight: 500,
          color: C.muted,
        }}
      >
        <span
          style={{
            width: 45 * motion(f, 18, 50),
            height: 2,
            background: C.ink,
          }}
        />
        Zimbabwe on the move.
      </div>
    </AbsoluteFill>
  );
};

export const LetsGoRideZimbabweLaunch: React.FC<{ sound?: boolean }> = ({
  sound = true,
}) => {
  const f = useCurrentFrame();
  // Short directional masks at cuts; no blended headline overlap or end fade.
  const cut = [90, 210, 330].find((n) => f >= n && f < n + 12);
  const wipe = cut === undefined ? 1 : motion(f, cut, cut + 12);
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        color: C.ink,
        fontFamily: "Inter, Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{fonts}</style>
      {sound && (
        <Audio src={staticFile("launch-soundtrack.wav")} volume={0.75} />
      )}
      <Sequence from={0} durationInFrames={90} name="01 • Zimbabwe on the move">
        <Intro />
      </Sequence>
      <Sequence
        from={90}
        durationInFrames={120}
        name="02 • 0% platform commission"
      >
        <Driver />
      </Sequence>
      <Sequence from={210} durationInFrames={120} name="03 • Your next ride">
        <Passenger />
      </Sequence>
      <Sequence from={330} durationInFrames={120} name="04 • LetsGoRide / CTA">
        <Close />
      </Sequence>
      {cut !== undefined && (
        <AbsoluteFill
          style={{
            background: cut === 90 ? C.paper : C.ink,
            transform: `translateY(${-wipe * 100}%)`,
            zIndex: 30,
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
        <Header
          light={
            (f >= 90 && f < 210 && (cut !== 90 || wipe > 0.15)) ||
            (cut === 210 && wipe < 0.15) ||
            (cut === 330 && wipe < 0.15)
          }
        />
      </div>
    </AbsoluteFill>
  );
};
