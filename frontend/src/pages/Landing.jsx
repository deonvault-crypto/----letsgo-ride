import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowRight,
    BadgeCheck,
    CalendarCheck,
    Car,
    CircleDollarSign,
    Headphones,
    MapPin,
    MessageSquareWarning,
    ReceiptText,
    Route,
    Search,
    ShieldCheck,
    UserCheck,
    Users,
} from "lucide-react";

const navLinks = [
    { href: "#how", label: "How it works" },
    { href: "#safety", label: "Safety" },
    { href: "#routes", label: "Routes" },
    { href: "#drivers", label: "Drivers" },
    { href: "#pricing", label: "Pricing" },
];

const cities = ["Harare", "Bulawayo", "Mutare", "Gweru", "Masvingo"];

const passengerSteps = [
    {
        icon: Search,
        title: "Search your route",
        body: "Choose an intercity journey, city ride, or errand run with pickup and drop-off clarity.",
    },
    {
        icon: UserCheck,
        title: "Choose a driver",
        body: "Review vehicle details, route timing, seat count, and driver verification signals.",
    },
    {
        icon: CalendarCheck,
        title: "Reserve your seat",
        body: "Send a booking request and confirm the ride details before travel day.",
    },
    {
        icon: ShieldCheck,
        title: "Travel safely",
        body: "Keep trip records, support directions, and reporting tools close for every journey.",
    },
];

const driverSteps = [
    {
        icon: Route,
        title: "Post a planned trip",
        body: "Share where you are going, departure time, available seats, luggage notes, and price.",
    },
    {
        icon: Users,
        title: "Accept passengers",
        body: "Review requests before confirming who rides with you and where they join.",
    },
    {
        icon: CircleDollarSign,
        title: "Earn from empty seats",
        body: "Turn routes you already drive into practical income without changing your destination.",
    },
];

const safetyItems = [
    {
        icon: BadgeCheck,
        title: "Driver profile checks",
        body: "Profiles are designed around ID, licence, vehicle, route, and rating signals before public activation.",
    },
    {
        icon: MessageSquareWarning,
        title: "Passenger reports",
        body: "Riders need a direct way to report unsafe conduct, route changes, missed pickups, or payment disputes.",
    },
    {
        icon: Headphones,
        title: "Emergency support direction",
        body: "The product is structured to guide users toward support and emergency contacts when something feels wrong.",
    },
    {
        icon: ReceiptText,
        title: "Trip records",
        body: "Requests, confirmations, pickup notes, drop-off notes, and driver details should remain traceable.",
    },
    {
        icon: MapPin,
        title: "Clear meeting points",
        body: "Each trip should state pickup, drop-off, timing, luggage expectations, and passenger count.",
    },
];

const routes = [
    {
        from: "Harare",
        to: "Bulawayo",
        type: "Intercity",
        detail: "Morning and weekend seat-sharing corridor",
    },
    {
        from: "Harare",
        to: "Mutare",
        type: "Intercity",
        detail: "Eastern route for families, workers, and students",
    },
    {
        from: "Gweru",
        to: "Harare",
        type: "Intercity",
        detail: "Central link with predictable pickup points",
    },
    {
        from: "Masvingo",
        to: "Harare",
        type: "Intercity",
        detail: "Reliable route matching for planned travel",
    },
    {
        from: "City errands",
        to: "Local rides",
        type: "Urban",
        detail: "Short trips, parcel errands, and everyday city movement",
    },
];

const paymentNotes = [
    "Cash payment can remain available where it is practical and agreed by driver and passenger.",
    "Deposit proof support can help drivers confirm serious bookings before departure.",
    "Online payments and service fees should be introduced only when the platform backend supports them safely.",
];

const footerLinks = [
    { label: "Support", href: "#support" },
    { label: "Safety", href: "#safety" },
    { label: "Terms", href: "#legal" },
    { label: "Privacy", href: "#legal" },
];

function Nav() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 16);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header
            data-testid="site-nav"
            className={`site-nav ${scrolled ? "site-nav--solid" : ""}`}
        >
            <div className="site-shell site-nav__inner">
                <a href="#top" className="brand-mark" data-testid="nav-logo">
                    <span className="brand-mark__glyph">LR</span>
                    <span>LetsGo Ride</span>
                </a>
                <nav className="site-nav__links" aria-label="Primary">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            data-testid={`nav-link-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>
                <div className="site-nav__actions">
                    <a
                        href="#access"
                        className="button button--quiet nav-login"
                        data-testid="nav-login-btn"
                    >
                        Log in
                    </a>
                    <a
                        href="#access"
                        className="button button--primary"
                        data-testid="nav-get-app-btn"
                    >
                        Get the app
                    </a>
                </div>
            </div>
        </header>
    );
}

function Hero() {
    return (
        <section id="top" className="hero-section" data-testid="hero-section">
            <div className="hero-map" aria-hidden>
                <span className="route-node route-node--harare" />
                <span className="route-node route-node--bulawayo" />
                <span className="route-node route-node--mutare" />
                <span className="route-node route-node--gweru" />
                <span className="route-node route-node--masvingo" />
                <span className="route-line route-line--one" />
                <span className="route-line route-line--two" />
                <span className="route-line route-line--three" />
            </div>
            <div className="site-shell hero-section__content">
                <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="hero-copy"
                >
                    <p className="eyebrow">Zimbabwe transport, rebuilt around trust</p>
                    <h1 data-testid="hero-headline">
                        Book a seat. Move across Zimbabwe safely.
                    </h1>
                    <p className="hero-sub" data-testid="hero-sub">
                        LetsGo Ride connects passengers and verified drivers for
                        intercity shared rides, local city trips, and everyday errands
                        with clear routes, honest pricing, and practical payment
                        support.
                    </p>
                    <div className="hero-actions">
                        <a
                            href="#routes"
                            className="button button--primary button--large"
                            data-testid="hero-cta-find-ride"
                        >
                            Find a Ride <ArrowRight size={18} />
                        </a>
                        <a
                            href="#drivers"
                            className="button button--quiet button--large"
                            data-testid="hero-cta-offer-ride"
                        >
                            Offer a Ride & Earn
                        </a>
                    </div>
                    <div className="trust-line" data-testid="hero-social-proof">
                        {cities.map((city) => (
                            <span key={city}>{city}</span>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

function PhonePreview() {
    return (
        <section
            id="app-preview"
            className="section section--preview"
            data-testid="app-preview"
        >
            <div className="site-shell preview-grid">
                <div className="section-kicker">
                    <p className="eyebrow">Live product direction</p>
                    <h2>Premium trip matching that feels built for real roads.</h2>
                    <p>
                        The app experience should make route, price, safety, and driver
                        context obvious before a passenger commits. No mystery pickup
                        points. No vague trip status.
                    </p>
                </div>
                <motion.div
                    initial={{ opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.55 }}
                    className="phone-stage"
                    data-testid="hero-phone-mockup"
                    aria-label="LetsGo Ride app preview"
                >
                    <div className="phone-device">
                        <div className="phone-top">
                            <span>9:41</span>
                            <span>5G 86%</span>
                        </div>
                        <div className="phone-brand">
                            <span className="status-dot" />
                            LetsGo Ride
                        </div>
                        <div className="phone-title">Harare to Bulawayo</div>
                        <div className="trip-card trip-card--route">
                            <div className="trip-track">
                                <span />
                                <i />
                                <span />
                            </div>
                            <div>
                                <small>Pickup</small>
                                <strong>Harare CBD, Fourth Street</strong>
                                <small>Drop-off</small>
                                <strong>Bulawayo City Hall</strong>
                            </div>
                        </div>
                        <div className="trip-metrics">
                            <div>
                                <small>Seats</small>
                                <strong>3 left</strong>
                            </div>
                            <div>
                                <small>Seat price</small>
                                <strong>US$12</strong>
                            </div>
                        </div>
                        <div className="driver-card">
                            <div className="driver-avatar">TM</div>
                            <div>
                                <strong>Tafadzwa M.</strong>
                                <span>Toyota Wish - verified profile</span>
                            </div>
                            <BadgeCheck size={20} />
                        </div>
                        <div className="status-panel">
                            <div>
                                <small>Status</small>
                                <strong>Accepting requests</strong>
                            </div>
                            <div>
                                <small>Departure</small>
                                <strong>06:30 tomorrow</strong>
                            </div>
                        </div>
                        <button type="button" className="phone-cta">
                            Request seat
                        </button>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

function StepList({ title, body, steps, variant }) {
    return (
        <div className={`workflow-panel workflow-panel--${variant}`}>
            <div>
                <p className="eyebrow">{variant === "passenger" ? "Passengers" : "Drivers"}</p>
                <h3>{title}</h3>
                <p>{body}</p>
            </div>
            <div className="workflow-list">
                {steps.map((step) => (
                    <div className="workflow-item" key={step.title}>
                        <div className="icon-box">
                            <step.icon size={20} />
                        </div>
                        <div>
                            <h4>{step.title}</h4>
                            <p>{step.body}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function HowItWorks() {
    return (
        <section id="how" className="section" data-testid="how-it-works">
            <div className="site-shell">
                <div className="section-heading">
                    <p className="eyebrow">How it works</p>
                    <h2>Two sides of one transport network.</h2>
                    <p>
                        Passengers need confidence before they reserve. Drivers need
                        control over who joins them and how much each planned trip can
                        earn.
                    </p>
                </div>
                <div className="workflow-grid">
                    <StepList
                        title="Reserve with confidence"
                        body="Search routes, compare details, request a seat, and keep the trip record close."
                        steps={passengerSteps}
                        variant="passenger"
                    />
                    <StepList
                        title="Earn from trips you already drive"
                        body="Post planned travel, approve passengers, and make unused seats work harder."
                        steps={driverSteps}
                        variant="driver"
                    />
                </div>
            </div>
        </section>
    );
}

function Safety() {
    return (
        <section
            id="safety"
            className="section section--band"
            data-testid="safety-section"
        >
            <div className="site-shell safety-grid">
                <div className="section-kicker">
                    <p className="eyebrow">Safety and trust</p>
                    <h2>Built around records, visibility, and accountable travel.</h2>
                    <p>
                        LetsGo Ride should be useful for passengers, drivers,
                        families, operators, and regulators because every key trip
                        detail is structured and easy to review.
                    </p>
                </div>
                <div className="safety-list">
                    {safetyItems.map((item) => (
                        <div className="safety-item" key={item.title}>
                            <div className="icon-box">
                                <item.icon size={20} />
                            </div>
                            <div>
                                <h3>{item.title}</h3>
                                <p>{item.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function RoutesSection() {
    return (
        <section id="routes" className="section" data-testid="routes-section">
            <div className="site-shell">
                <div className="section-heading section-heading--split">
                    <div>
                        <p className="eyebrow">Zimbabwe routes</p>
                        <h2>Start with the corridors people already travel.</h2>
                    </div>
                    <p>
                        The launch network focuses on practical movement: major
                        intercity routes first, then local city rides and errands
                        where shared transport solves daily friction.
                    </p>
                </div>
                <div className="route-grid">
                    {routes.map((route) => (
                        <article className="route-card" key={`${route.from}-${route.to}`}>
                            <span>{route.type}</span>
                            <h3>
                                {route.from} <ArrowRight size={18} /> {route.to}
                            </h3>
                            <p>{route.detail}</p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

function DriverEarning() {
    return (
        <section
            id="drivers"
            className="section section--driver"
            data-testid="drivers-section"
        >
            <div className="site-shell driver-grid">
                <div className="driver-copy">
                    <p className="eyebrow">For drivers</p>
                    <h2>Turn planned trips into trusted passenger income.</h2>
                    <p>
                        A driver already heading from Harare to Bulawayo should be
                        able to list available seats, approve passengers, and recover
                        fuel costs without losing control of the trip.
                    </p>
                    <a href="#access" className="button button--primary button--large">
                        Become a Driver <ArrowRight size={18} />
                    </a>
                </div>
                <div className="earning-board" aria-label="Driver earning model">
                    <div className="earning-board__header">
                        <div>
                            <small>Example trip</small>
                            <strong>Harare to Bulawayo</strong>
                        </div>
                        <Car size={24} />
                    </div>
                    <div className="earning-bars">
                        <div style={{ "--height": "44%" }}>
                            <span />
                            <small>1 seat</small>
                        </div>
                        <div style={{ "--height": "68%" }}>
                            <span />
                            <small>2 seats</small>
                        </div>
                        <div style={{ "--height": "88%" }}>
                            <span />
                            <small>3 seats</small>
                        </div>
                    </div>
                    <p>
                        Earnings depend on actual route, price, vehicle capacity,
                        passenger acceptance, and local operating costs.
                    </p>
                </div>
            </div>
        </section>
    );
}

function Pricing() {
    return (
        <section id="pricing" className="section" data-testid="pricing-section">
            <div className="site-shell pricing-grid">
                <div className="section-kicker">
                    <p className="eyebrow">Pricing and payment clarity</p>
                    <h2>Honest payment support before advanced payments go live.</h2>
                    <p>
                        LetsGo Ride should never pretend a payment feature exists
                        before the product can support it. The launch language stays
                        clear: agree the fare, confirm the seat, keep proof where
                        useful.
                    </p>
                </div>
                <div className="payment-list">
                    {paymentNotes.map((note, index) => (
                        <div className="payment-item" key={note}>
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <p>{note}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function Vision() {
    return (
        <section id="vision" className="section section--vision" data-testid="vision-section">
            <div className="site-shell vision-panel">
                <p className="eyebrow">Long-term vision</p>
                <h2>Built for Zimbabwe. Ready for Africa.</h2>
                <p>
                    The first mission is simple: help Zimbabweans move with more
                    trust, better information, and safer passenger-driver matching.
                    The same operating model can later support regional routes,
                    formal partnerships, transparent service fees, and stronger
                    transport data across African markets.
                </p>
                <div className="vision-stats">
                    <div>
                        <strong>Intercity</strong>
                        <span>Shared seats on planned routes</span>
                    </div>
                    <div>
                        <strong>Local</strong>
                        <span>City rides and errand movement</span>
                    </div>
                    <div>
                        <strong>Trust</strong>
                        <span>Profiles, records, and reporting</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Access() {
    return (
        <section id="access" className="section section--access" data-testid="access-section">
            <div className="site-shell access-grid">
                <div>
                    <p className="eyebrow">Launch access</p>
                    <h2>Passenger and driver access is being prepared.</h2>
                    <p>
                        The login, driver onboarding, and app download actions route
                        here until production pages are ready. That keeps every
                        website action intentional and avoids dead links.
                    </p>
                </div>
                <div className="access-actions">
                    <a href="#routes" className="button button--primary">
                        Explore routes
                    </a>
                    <a href="#drivers" className="button button--quiet">
                        Driver overview
                    </a>
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer id="support" className="site-footer" data-testid="footer">
            <div className="site-shell footer-grid">
                <div>
                    <a href="#top" className="brand-mark">
                        <span className="brand-mark__glyph">LR</span>
                        <span>LetsGo Ride</span>
                    </a>
                    <p>
                        Zimbabwe-first ride-sharing for intercity trips, local
                        city rides, errands, and safe passenger-driver matching.
                    </p>
                    <a className="domain-link" href="https://letsgoride.site">
                        letsgoride.site
                    </a>
                </div>
                <nav aria-label="Footer">
                    {footerLinks.map((link) => (
                        <a key={link.label} href={link.href}>
                            {link.label}
                        </a>
                    ))}
                </nav>
                <div id="legal" className="legal-block">
                    <strong>Terms and privacy</strong>
                    <p>
                        Formal terms, privacy policy, support channels, and regulator
                        notices should be published before public passenger and driver
                        transactions are enabled.
                    </p>
                </div>
            </div>
        </footer>
    );
}

export default function Landing() {
    return (
        <main className="landing-page" data-testid="landing-page">
            <Nav />
            <Hero />
            <PhonePreview />
            <HowItWorks />
            <Safety />
            <RoutesSection />
            <DriverEarning />
            <Pricing />
            <Vision />
            <Access />
            <Footer />
        </main>
    );
}
