import React from "react";

const routes = [
  { from: "Harare", to: "Bulawayo", time: "6h 30m", price: "US$24", seats: "3 seats left", tag: "Bestseller" },
  { from: "Harare", to: "Mutare", time: "3h 45m", price: "US$18", seats: "2 seats left", tag: "Popular" },
  { from: "Gweru", to: "Harare", time: "2h 15m", price: "US$15", seats: "4 seats left", tag: "Fast route" },
  { from: "Bulawayo", to: "Victoria Falls", time: "5h 30m", price: "US$22", seats: "3 seats left", tag: "Scenic" },
];

const stats = [
  ["10K+", "Trips planned"],
  ["30+", "Cities and towns"],
  ["4.8", "Average rating"],
  ["100%", "Verified ride focus"],
];

const steps = [
  ["01", "Search route", "Enter pickup, destination, date, and seats to find available rides instantly."],
  ["02", "Choose driver", "Compare route details, ratings, prices, seats, and vehicle information."],
  ["03", "Reserve seat", "Confirm your seat and keep clear trip records before travel."],
  ["04", "Travel safely", "Use live trip details, support, and verified ride information."],
];

const safety = [
  ["Verified drivers", "Drivers are checked before trips and linked to clear route records."],
  ["Trip history", "Every ride keeps pickup, destination, time, passenger, and driver details."],
  ["Unsafe reports", "Passengers can report unsafe driving, fraud, or suspicious behavior."],
  ["Emergency help", "Quick access to support and safety guidance during a journey."],
];

function Logo({ compact = false }) {
  return (
    <div className={compact ? "logo compact" : "logo"}>
      <div className="logo-mark">
        <span className="logo-road" />
        <span className="logo-arrow" />
      </div>
      {!compact && (
        <div className="logo-word">
          Lets<span>Go</span>Ride
        </div>
      )}
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="phone">
      <div className="phone-top" />
      <Logo compact />
      <h3>Where to?</h3>

      <div className="phone-field">
        <small>From</small>
        <strong>Harare</strong>
      </div>

      <div className="phone-field">
        <small>To</small>
        <strong>Bulawayo</strong>
      </div>

      <div className="phone-field">
        <small>Travel Date</small>
        <strong>Fri, 24 May 2024</strong>
      </div>

      <button className="phone-btn">Search Rides</button>

      <p className="phone-label">Recommended for you</p>

      <div className="mini-route">
        <span>Harare → Bulawayo</span>
        <strong>US$24</strong>
      </div>

      <div className="mini-route">
        <span>Harare → Mutare</span>
        <strong>US$18</strong>
      </div>

      <div className="phone-tabs">
        <span>Home</span>
        <span>My Rides</span>
        <span>Messages</span>
        <span>Profile</span>
      </div>
    </div>
  );
}

function ZimbabweScene() {
  return (
    <div className="zim-scene" aria-hidden="true">
      <div className="map-plate">
        <div className="city harare"><span />Harare</div>
        <div className="city bulawayo"><span />Bulawayo</div>
        <div className="city mutare"><span />Mutare</div>
        <div className="city gweru"><span />Gweru</div>
        <div className="city vicfalls"><span />Victoria Falls</div>

        <svg className="route-lines" viewBox="0 0 720 420" fill="none">
          <path d="M145 280 C240 250, 320 220, 420 185 C500 155, 560 145, 625 120" />
          <path d="M420 185 C480 230, 545 252, 650 260" />
          <path d="M315 235 C380 260, 450 285, 535 330" />
          <path d="M145 280 C120 220, 105 150, 90 95" />
        </svg>

        <div className="moving-car car-one" />
        <div className="moving-car car-two" />
        <div className="moving-car car-three" />

        <div className="route-card floating-card one">
          <small>Popular route</small>
          <strong>Harare → Bulawayo</strong>
          <span>6h 30m · 3 seats left</span>
          <b>US$24</b>
        </div>

        <div className="route-card floating-card two">
          <small>Fast route</small>
          <strong>Harare → Mutare</strong>
          <span>3h 45m · 2 seats left</span>
          <b>US$18</b>
        </div>
      </div>
    </div>
  );
}

function AppPanel() {
  return (
    <div className="app-panel">
      <div className="browser-bar">
        <Logo compact />
        <span>Find a Ride</span>
        <span>Offer a Ride</span>
        <span>Safety</span>
        <button>Sign Up / Log In</button>
      </div>
      <div className="browser-body">
        <div>
          <p className="eyebrow">Verified riders</p>
          <h3>Book a seat. Anywhere in Zimbabwe.</h3>
          <p>Search routes, compare seats, and travel with confidence.</p>
        </div>
        <div className="browser-map">
          <span>Harare</span>
          <span>Bulawayo</span>
          <span>Mutare</span>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <main className="letsgo-page">
      <header className="site-nav">
        <Logo />
        <nav>
          <a href="#routes">Find a Ride</a>
          <a href="#drivers">Offer a Ride</a>
          <a href="#how">How it Works</a>
          <a href="#safety">Safety</a>
          <a href="#vision">Vision</a>
        </nav>
        <div className="nav-actions">
          <button className="country">ZW</button>
          <button className="primary small">Sign Up / Log In</button>
        </div>
      </header>

      <section className="hero section-shell">
        <div className="hero-copy">
          <div className="pill">Zimbabwe-first mobility network</div>
          <h1>Book a seat. Anywhere in <span>Zimbabwe.</span></h1>
          <p>
            LetsGoRide connects passengers and verified drivers across intercity and local routes with clear prices, safer trip records, and a premium booking experience.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#routes">Find a Ride</a>
            <a className="secondary" href="#drivers">Offer a Ride & Earn</a>
          </div>
          <div className="trust-row">
            <span>Verified drivers</span>
            <span>Clear upfront pricing</span>
            <span>Deposit proof ready</span>
          </div>
        </div>

        <div className="hero-visual">
          <ZimbabweScene />
          <PhoneMockup />
        </div>
      </section>

      <section className="stats-strip">
        {stats.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section id="routes" className="routes-section section-shell">
        <div className="section-head center">
          <div className="pill">Route marketplace</div>
          <h2>Search, compare, and move with confidence.</h2>
          <p>Built for Harare, Bulawayo, Mutare, Gweru, Victoria Falls, and every growing route between them.</p>
        </div>

        <div className="route-grid">
          <form className="search-card">
            <label>From<input placeholder="Start city or location" /></label>
            <label>To<input placeholder="Destination city" /></label>
            <div className="split">
              <label>Date<input value="Fri, 24 May" readOnly /></label>
              <label>Seats<input value="1 seat" readOnly /></label>
            </div>
            <button type="button" className="primary full">Search routes</button>
          </form>

          <div className="route-list">
            {routes.map((route) => (
              <article className="big-route-card" key={route.from + route.to}>
                <span>{route.tag}</span>
                <h3>{route.from} → {route.to}</h3>
                <p>{route.time} · {route.seats}</p>
                <strong>{route.price}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="section-shell">
        <div className="section-head">
          <div className="pill">How LetsGoRide works</div>
          <h2>Your journey in <span>4 simple steps.</span></h2>
          <p>Search, choose, reserve, and travel safely with real people and clear trip details.</p>
        </div>

        <div className="step-grid">
          {steps.map(([number, title, text]) => (
            <article className="step-card" key={number}>
              <b>{number}</b>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="drivers" className="driver-section section-shell">
        <div className="driver-copy">
          <div className="pill">Drive & earn</div>
          <h2>Your empty seats can <span>earn.</span></h2>
          <p>
            Share planned trips, reduce travel costs, fill empty seats, and serve trusted riders across Zimbabwe.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#join">Become a Driver</a>
            <a className="secondary" href="#routes">Post a Trip</a>
          </div>
        </div>

        <div className="driver-scene">
          <div className="earning-card">
            <small>Today’s earnings</small>
            <strong>US$48.60</strong>
            <span>6 completed trips · 312 km</span>
          </div>
          <div className="car-platform">
            <div className="car-shape" />
            <div className="green-road" />
          </div>
          <div className="post-card">
            <h3>Post a Trip</h3>
            <p>Harare → Bulawayo</p>
            <strong>3 seats · US$18</strong>
            <button className="primary full">Post Trip</button>
          </div>
        </div>
      </section>

      <section id="safety" className="safety-section section-shell">
        <div className="section-head">
          <div className="pill">Safety center</div>
          <h2>Your safety. <span>Our mission.</span></h2>
          <p>LetsGoRide must feel serious, secure, and ready for real transport operations.</p>
        </div>

        <div className="safety-grid">
          <div className="shield-scene">
            <div className="shield">✓</div>
          </div>
          {safety.map(([title, text]) => (
            <article className="safety-card" key={title}>
              <div className="icon-dot" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="vision" className="ecosystem section-shell">
        <div className="section-head wide">
          <div className="pill">Web plus mobile ecosystem</div>
          <h2>One premium identity across website, iOS, Android, and admin.</h2>
          <p>
            The same logo, dark-green brand system, route marketplace, driver flows, support records, and trust layer should work across every screen.
          </p>
        </div>

        <div className="device-showcase">
          <div className="brand-tile">
            <Logo />
            <h3>Route command web</h3>
            <p>Book trips, compare prices, and view routes on a cinematic desktop layout.</p>
          </div>
          <AppPanel />
        </div>
      </section>

      <section id="join" className="final-cta section-shell">
        <Logo />
        <h2>Built for Zimbabwe. Ready for Africa.</h2>
        <p>LetsGoRide starts with Zimbabwe and grows into a trusted movement for safer shared mobility across Africa.</p>
        <a className="primary" href="#routes">Join the movement</a>
      </section>

      <footer className="site-footer">
        <div>
          <Logo />
          <p>Intercity travel made simple. Trusted rides. Transparent prices.</p>
        </div>
        <div>
          <h4>Company</h4>
          <a>About Us</a>
          <a>How it Works</a>
          <a>Safety</a>
        </div>
        <div>
          <h4>Support</h4>
          <a>Help Center</a>
          <a>Contact Us</a>
          <a>Privacy Policy</a>
        </div>
        <div>
          <h4>Contact</h4>
          <a>+263 78 123 4567</a>
          <a>support@letsgoride.co.zw</a>
          <a>Harare, Zimbabwe</a>
        </div>
      </footer>
    </main>
  );
}
