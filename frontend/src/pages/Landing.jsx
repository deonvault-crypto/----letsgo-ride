import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowRight,
    BadgeCheck,
    Banknote,
    Bus,
    Phone,
    Search,
    UserCheck,
    Wallet,
    Signpost,
    MapPin,
    Shield,
    Car,
    Star,
    LifeBuoy,
    Apple,
    Play,
    Plus,
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

/* ────────────────────────────────────────────────────────────── */
/* NAV                                                            */
/* ────────────────────────────────────────────────────────────── */
const Nav = () => {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const links = [
        { href: "#how", label: "How it works" },
        { href: "#drivers", label: "For Drivers" },
        { href: "#safety", label: "Safety" },
        { href: "#faq", label: "FAQ" },
    ];

    return (
        <header
            data-testid="site-nav"
            className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
                scrolled
                    ? "bg-[#0F1115]/85 backdrop-blur-md border-b border-white/5"
                    : "bg-transparent"
            }`}
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
                <a
                    href="#top"
                    data-testid="nav-logo"
                    className="flex items-center gap-2 font-display font-extrabold tracking-tight text-white text-lg"
                >
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#22C55E] shadow-[0_0_14px_rgba(34,197,94,0.8)]" />
                    LetsGo Ride
                </a>
                <nav className="hidden md:flex items-center gap-8">
                    {links.map((l) => (
                        <a
                            key={l.href}
                            href={l.href}
                            data-testid={`nav-link-${l.label.replace(/\s/g, "-").toLowerCase()}`}
                            className="text-sm text-white/75 hover:text-white transition-colors"
                        >
                            {l.label}
                        </a>
                    ))}
                </nav>
                <div className="flex items-center gap-2">
                    <button
                        data-testid="nav-login-btn"
                        className="hidden sm:inline-flex btn-ghost text-sm !py-2 !px-4"
                    >
                        Log in
                    </button>
                    <button
                        data-testid="nav-get-app-btn"
                        className="btn-primary text-sm !py-2 !px-4"
                    >
                        Get the app
                    </button>
                </div>
            </div>
        </header>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* HERO                                                           */
/* ────────────────────────────────────────────────────────────── */
const Hero = () => (
    <section
        id="top"
        data-testid="hero-section"
        className="relative overflow-hidden hero-glow grain pt-28 md:pt-32 pb-20 md:pb-28"
    >
        <div className="max-w-7xl mx-auto px-5 md:px-8 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
            <div>
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#22C55E]/40 bg-[#22C55E]/5 text-[#22C55E] text-xs font-semibold tracking-wide"
                    data-testid="hero-chip"
                >
                    <span aria-hidden>🇿🇼</span> Made in Zimbabwe
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.05 }}
                    className="font-display font-black tracking-tight-xl mt-6 text-5xl sm:text-6xl lg:text-7xl leading-[0.95]"
                    data-testid="hero-headline"
                >
                    Book a seat.
                    <br />
                    <span className="text-[#22C55E]">
                        Anywhere in Zimbabwe.
                    </span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                    className="mt-6 text-base md:text-lg text-[#9CA3AF] max-w-xl leading-relaxed"
                    data-testid="hero-sub"
                >
                    Affordable intercity travel and local shared rides — with
                    verified drivers, clear pricing, and cash or deposit
                    payment.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.25 }}
                    className="mt-8 flex flex-wrap gap-3"
                >
                    <button
                        data-testid="hero-cta-find-ride"
                        className="btn-primary"
                    >
                        Find a Ride <ArrowRight size={18} />
                    </button>
                    <button
                        data-testid="hero-cta-offer-ride"
                        className="btn-ghost"
                    >
                        Offer a Ride & Earn
                    </button>
                </motion.div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.35 }}
                    className="mt-10 text-xs md:text-sm text-white/55"
                    data-testid="hero-social-proof"
                >
                    Trusted by passengers in{" "}
                    <span className="text-white/85 font-semibold">Harare</span>{" "}
                    ·{" "}
                    <span className="text-white/85 font-semibold">
                        Bulawayo
                    </span>{" "}
                    ·{" "}
                    <span className="text-white/85 font-semibold">Mutare</span>{" "}
                    · <span className="text-white/85 font-semibold">Gweru</span>{" "}
                    ·{" "}
                    <span className="text-white/85 font-semibold">
                        Masvingo
                    </span>
                </motion.p>
            </div>

            {/* Phone mockup */}
            <motion.div
                initial={{ opacity: 0, y: 30, rotate: -2 }}
                animate={{ opacity: 1, y: 0, rotate: -4 }}
                transition={{ duration: 0.9, delay: 0.2 }}
                className="relative justify-self-center lg:justify-self-end"
                aria-hidden
                data-testid="hero-phone-mockup"
            >
                <div className="phone-frame">
                    <div className="phone-notch" />
                    <div className="pt-12 px-5 pb-6 h-full flex flex-col">
                        <div className="flex items-center justify-between text-[11px] text-white/60">
                            <span>9:41</span>
                            <span className="tracking-widest">
                                ▮▮▮▮ · 5G · 86%
                            </span>
                        </div>

                        <div className="mt-5 flex items-center gap-2 text-[11px] text-[#22C55E] font-semibold">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                            LetsGo Ride
                        </div>
                        <div className="mt-1 font-display text-[22px] font-extrabold tracking-tight leading-tight">
                            Where to,
                            <br /> today?
                        </div>

                        <div className="mt-5 rounded-2xl border border-white/8 bg-[#0F1115]/80 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="pt-1 flex flex-col items-center">
                                    <span className="route-dot" />
                                    <span className="route-line h-8" />
                                    <span className="route-dot !bg-white/80 !shadow-none" />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <div className="text-[10px] text-white/50 uppercase tracking-wider">
                                            From
                                        </div>
                                        <div className="text-sm font-semibold text-white">
                                            Harare CBD
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-white/50 uppercase tracking-wider">
                                            To
                                        </div>
                                        <div className="text-sm font-semibold text-white">
                                            Bulawayo
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl bg-[#22C55E] text-[#06210F] p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider">
                                        Next ride
                                    </div>
                                    <div className="text-base font-extrabold font-display">
                                        Tomorrow · 06:30
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[11px] font-bold uppercase tracking-wider">
                                        Seat
                                    </div>
                                    <div className="text-base font-extrabold font-display">
                                        US$12
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 space-y-2">
                            {[
                                { d: "Tafadzwa M.", car: "Toyota Wish · ABJ 1209", rating: "4.9" },
                                { d: "Nyasha K.", car: "Honda Fit · ADX 3341", rating: "4.8" },
                            ].map((r) => (
                                <div
                                    key={r.d}
                                    className="rounded-xl border border-white/8 bg-white/[0.02] p-3 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E] text-xs font-bold">
                                            {r.d[0]}
                                        </div>
                                        <div>
                                            <div className="text-xs font-semibold text-white">
                                                {r.d}
                                            </div>
                                            <div className="text-[10px] text-white/55">
                                                {r.car}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-white/70 flex items-center gap-1">
                                        <Star size={10} className="text-[#22C55E] fill-[#22C55E]" />
                                        {r.rating}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* floating badge */}
                <div className="absolute -left-6 top-10 rotate-[6deg] hidden sm:flex items-center gap-2 bg-[#171A1F] border border-white/10 rounded-full px-3 py-1.5 text-[11px] font-semibold">
                    <BadgeCheck size={14} className="text-[#22C55E]" /> Verified driver
                </div>
                <div className="absolute -right-6 bottom-14 -rotate-[5deg] hidden sm:flex items-center gap-2 bg-[#171A1F] border border-white/10 rounded-full px-3 py-1.5 text-[11px] font-semibold">
                    <Banknote size={14} className="text-[#22C55E]" /> Cash OK
                </div>
            </motion.div>
        </div>
    </section>
);

/* ────────────────────────────────────────────────────────────── */
/* TRUST STRIP                                                    */
/* ────────────────────────────────────────────────────────────── */
const TrustStrip = () => {
    const items = [
        {
            icon: UserCheck,
            title: "Verified Drivers",
            body: "ID + license + vehicle reviewed by our team",
        },
        {
            icon: Wallet,
            title: "Cash or Deposit",
            body: "Pay on the ride or upload proof of deposit",
        },
        {
            icon: Bus,
            title: "Intercity + Local",
            body: "Long distance routes and in-town shared rides",
        },
        {
            icon: Phone,
            title: "Call / SMS / WhatsApp",
            body: "Tap once to reach your driver",
        },
    ];
    return (
        <section
            data-testid="trust-strip"
            className="py-16 md:py-20 border-y border-white/5 bg-[#0F1115]"
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {items.map((it, i) => (
                    <motion.div
                        key={it.title}
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-60px" }}
                        transition={{ duration: 0.5, delay: i * 0.07 }}
                        className="surface rounded-2xl p-5"
                        data-testid={`trust-card-${i}`}
                    >
                        <div className="icon-tile">
                            <it.icon size={20} strokeWidth={2.2} />
                        </div>
                        <h3 className="mt-4 font-display font-extrabold text-lg tracking-tight">
                            {it.title}
                        </h3>
                        <p className="mt-1.5 text-sm text-[#9CA3AF] leading-relaxed">
                            {it.body}
                        </p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* HOW IT WORKS                                                   */
/* ────────────────────────────────────────────────────────────── */
const HowItWorks = () => {
    const steps = [
        {
            n: "01",
            icon: Search,
            title: "Search your route + date",
            body: "From CBD to Bulawayo, Mutare or anywhere across Zimbabwe.",
        },
        {
            n: "02",
            icon: Car,
            title: "Pick a seat with a verified driver",
            body: "See ratings, vehicle, and exact departure before you book.",
        },
        {
            n: "03",
            icon: Wallet,
            title: "Pay cash or upload deposit proof",
            body: "Your seat is locked. Just show up on time — we send reminders.",
        },
    ];
    return (
        <section
            id="how"
            data-testid="how-it-works"
            className="py-24 md:py-32"
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                        How it works
                    </p>
                    <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl leading-[1]">
                        Three steps and you’re on the road.
                    </h2>
                </div>

                <div className="mt-14 grid md:grid-cols-3 gap-5">
                    {steps.map((s, i) => (
                        <motion.div
                            key={s.n}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.55, delay: i * 0.08 }}
                            className="surface rounded-2xl p-6 md:p-7"
                            data-testid={`how-step-${i + 1}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="icon-tile">
                                    <s.icon size={22} strokeWidth={2.2} />
                                </div>
                                <span className="font-display font-black text-3xl text-white/10">
                                    {s.n}
                                </span>
                            </div>
                            <h3 className="mt-6 font-display font-extrabold text-xl tracking-tight">
                                {s.title}
                            </h3>
                            <p className="mt-2 text-sm text-[#9CA3AF] leading-relaxed">
                                {s.body}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* LOCAL vs INTERCITY                                             */
/* ────────────────────────────────────────────────────────────── */
const RouteSplit = () => (
    <section
        data-testid="route-split"
        className="py-24 md:py-28 bg-[#0F1115]"
    >
        <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                    Two ways to ride
                </p>
                <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl leading-[1]">
                    Long distance or across town.
                </h2>
            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-5">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.55 }}
                    className="surface rounded-2xl p-7 md:p-8 relative overflow-hidden"
                    data-testid="route-intercity-card"
                >
                    <div
                        className="absolute -right-16 -top-16 w-60 h-60 rounded-full blur-3xl opacity-50"
                        style={{ background: "rgba(245, 158, 11, 0.18)" }}
                        aria-hidden
                    />
                    <div className="flex items-center gap-3">
                        <div
                            className="icon-tile"
                            style={{
                                background: "rgba(245, 158, 11, 0.12)",
                                color: "#F59E0B",
                                borderColor: "rgba(245, 158, 11, 0.35)",
                            }}
                        >
                            <Signpost size={22} strokeWidth={2.2} />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest text-[#F59E0B]">
                            Intercity
                        </span>
                    </div>
                    <h3 className="mt-5 font-display font-black text-2xl md:text-3xl tracking-tight">
                        Harare → Bulawayo, Mutare, Gweru, Masvingo, Victoria
                        Falls.
                    </h3>
                    <p className="mt-3 text-[#9CA3AF]">
                        5h 30m from{" "}
                        <span className="text-white font-semibold">
                            US$12
                        </span>
                        . Daily departures, confirmed seats, no overbooking.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {[
                            "HRE → BYO",
                            "HRE → MUT",
                            "HRE → GWE",
                            "HRE → MSV",
                            "HRE → VFA",
                        ].map((r) => (
                            <span
                                key={r}
                                className="text-xs font-semibold px-2.5 py-1 rounded-full border border-white/10 text-white/80"
                            >
                                {r}
                            </span>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.55, delay: 0.08 }}
                    className="surface rounded-2xl p-7 md:p-8 relative overflow-hidden"
                    data-testid="route-local-card"
                >
                    <div
                        className="absolute -right-16 -top-16 w-60 h-60 rounded-full blur-3xl opacity-50"
                        style={{ background: "rgba(99, 102, 241, 0.22)" }}
                        aria-hidden
                    />
                    <div className="flex items-center gap-3">
                        <div
                            className="icon-tile"
                            style={{
                                background: "rgba(99, 102, 241, 0.12)",
                                color: "#818CF8",
                                borderColor: "rgba(99, 102, 241, 0.35)",
                            }}
                        >
                            <MapPin size={22} strokeWidth={2.2} />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest text-[#818CF8]">
                            Local
                        </span>
                    </div>
                    <h3 className="mt-5 font-display font-black text-2xl md:text-3xl tracking-tight">
                        CBD ↔ Avondale, Borrowdale, Chitungwiza, Norton.
                    </h3>
                    <p className="mt-3 text-[#9CA3AF]">
                        20–40 min from{" "}
                        <span className="text-white font-semibold">US$2</span>.
                        Shared rides that run on your commute schedule.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {[
                            "CBD ↔ Avondale",
                            "CBD ↔ Borrowdale",
                            "CBD ↔ Chitungwiza",
                            "CBD ↔ Norton",
                        ].map((r) => (
                            <span
                                key={r}
                                className="text-xs font-semibold px-2.5 py-1 rounded-full border border-white/10 text-white/80"
                            >
                                {r}
                            </span>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    </section>
);

/* ────────────────────────────────────────────────────────────── */
/* FOR DRIVERS                                                    */
/* ────────────────────────────────────────────────────────────── */
const ForDrivers = () => (
    <section
        id="drivers"
        data-testid="for-drivers"
        className="py-24 md:py-32 bg-[#0F1115] relative overflow-hidden"
    >
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                background:
                    "radial-gradient(600px 400px at 80% 30%, rgba(34, 197, 94, 0.15), transparent 60%)",
            }}
            aria-hidden
        />
        <div className="max-w-7xl mx-auto px-5 md:px-8 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center relative">
            <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                    For Drivers
                </p>
                <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl lg:text-6xl leading-[1]">
                    Offer a Ride &{" "}
                    <span className="text-[#22C55E]">Earn</span>.
                </h2>
                <p className="mt-5 text-[#9CA3AF] max-w-lg">
                    Turn empty seats into income. Set your route, your price,
                    your schedule. We handle the bookings.
                </p>

                <ul className="mt-8 space-y-4 max-w-md">
                    {[
                        {
                            t: "Verified in 24h",
                            d: "Submit ID, license and vehicle once.",
                        },
                        {
                            t: "Keep 100% of seat fares",
                            d: "We don’t take a cut from your earnings.",
                        },
                        {
                            t: "Build reputation with reviews",
                            d: "Good drivers get booked first, every time.",
                        },
                    ].map((b, i) => (
                        <li
                            key={b.t}
                            className="flex items-start gap-3"
                            data-testid={`driver-benefit-${i}`}
                        >
                            <span className="icon-tile !w-9 !h-9 shrink-0">
                                <BadgeCheck size={18} strokeWidth={2.4} />
                            </span>
                            <div>
                                <div className="font-display font-extrabold text-base tracking-tight">
                                    {b.t}
                                </div>
                                <div className="text-sm text-[#9CA3AF]">
                                    {b.d}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>

                <button
                    data-testid="driver-cta"
                    className="btn-primary mt-10"
                >
                    Become a Driver <ArrowRight size={18} />
                </button>
            </div>

            <div className="justify-self-center lg:justify-self-end">
                <div className="surface rounded-3xl p-6 w-[320px]">
                    <div className="text-xs text-white/55 uppercase tracking-widest">
                        Weekly earnings
                    </div>
                    <div className="font-display font-black text-5xl tracking-tight-xl mt-2">
                        US$ <span className="text-[#22C55E]">284</span>
                    </div>
                    <div className="text-xs text-[#9CA3AF] mt-1">
                        Based on 6 intercity seats + 8 local seats
                    </div>
                    <div className="mt-6 grid grid-cols-7 gap-1.5 h-24 items-end">
                        {[40, 60, 35, 80, 55, 90, 70].map((h, i) => (
                            <div
                                key={i}
                                className="rounded-md bg-[#22C55E]/25 border border-[#22C55E]/40"
                                style={{ height: `${h}%` }}
                            />
                        ))}
                    </div>
                    <div className="mt-3 flex justify-between text-[10px] text-white/45 uppercase tracking-widest">
                        <span>Mon</span>
                        <span>Tue</span>
                        <span>Wed</span>
                        <span>Thu</span>
                        <span>Fri</span>
                        <span>Sat</span>
                        <span>Sun</span>
                    </div>

                    <div className="mt-5 pt-5 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-white/70">
                            <Star
                                size={14}
                                className="text-[#22C55E] fill-[#22C55E]"
                            />
                            4.92 driver rating
                        </div>
                        <span className="text-[11px] px-2 py-1 rounded-full bg-[#22C55E]/15 text-[#22C55E] font-bold">
                            Verified
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </section>
);

/* ────────────────────────────────────────────────────────────── */
/* SAFETY                                                         */
/* ────────────────────────────────────────────────────────────── */
const Safety = () => {
    const badges = [
        { icon: UserCheck, label: "Verified IDs" },
        { icon: Car, label: "Vehicle checks" },
        { icon: Star, label: "Review system" },
        { icon: LifeBuoy, label: "Emergency contact on file" },
    ];
    return (
        <section
            id="safety"
            data-testid="safety-section"
            className="py-24 md:py-32"
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                        Safety & Trust
                    </p>
                    <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl leading-[1]">
                        Rails you can count on.
                    </h2>
                </div>

                <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {badges.map((b, i) => (
                        <motion.div
                            key={b.label}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.5, delay: i * 0.06 }}
                            className="surface rounded-2xl p-6 flex flex-col items-start gap-4"
                            data-testid={`safety-badge-${i}`}
                        >
                            <div className="icon-tile">
                                <b.icon size={22} strokeWidth={2.2} />
                            </div>
                            <div className="font-display font-extrabold text-base tracking-tight">
                                {b.label}
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p
                    className="mt-10 text-xs text-white/45 max-w-3xl leading-relaxed"
                    data-testid="safety-disclaimer"
                >
                    LetsGo Ride does not mediate rides. Drivers and passengers
                    are responsible for their own journey. LetsGo Ride provides
                    the booking and safety rails.
                </p>
            </div>
        </section>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* TESTIMONIALS                                                   */
/* ────────────────────────────────────────────────────────────── */
const Testimonials = () => {
    const quotes = [
        {
            body: "I catch the 06:00 to Bulawayo every Friday. Same driver most weeks — I know his car, I know his rating. Honest price, no haggling at the rank.",
            name: "Rutendo M.",
            city: "Harare",
        },
        {
            body: "I drive to Harare twice a week anyway. Three LetsGo seats cover my fuel and then some. Verification took one day.",
            name: "Tendai S.",
            city: "Bulawayo",
        },
        {
            body: "The WhatsApp tap is what sold me. My driver pinged me when he was five minutes away. First time I didn’t stand in the sun guessing.",
            name: "Chipo N.",
            city: "Mutare",
        },
    ];
    return (
        <section
            data-testid="testimonials"
            className="py-24 md:py-28 bg-[#0F1115] border-y border-white/5"
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                        From riders
                    </p>
                    <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl leading-[1]">
                        Zimbabweans on the move.
                    </h2>
                </div>

                <div className="mt-12 grid md:grid-cols-3 gap-5">
                    {quotes.map((q, i) => (
                        <motion.figure
                            key={q.name}
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.5, delay: i * 0.08 }}
                            className="surface rounded-2xl p-6 md:p-7"
                            data-testid={`testimonial-${i}`}
                        >
                            <div className="flex gap-1 text-[#22C55E]">
                                {[0, 1, 2, 3, 4].map((n) => (
                                    <Star
                                        key={n}
                                        size={14}
                                        className="fill-[#22C55E]"
                                    />
                                ))}
                            </div>
                            <blockquote className="mt-5 text-white/90 text-[15px] leading-relaxed">
                                “{q.body}”
                            </blockquote>
                            <figcaption className="mt-6 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E] font-bold">
                                    {q.name[0]}
                                </div>
                                <div>
                                    <div className="text-sm font-semibold">
                                        {q.name}
                                    </div>
                                    <div className="text-xs text-white/50">
                                        {q.city}
                                    </div>
                                </div>
                            </figcaption>
                        </motion.figure>
                    ))}
                </div>
            </div>
        </section>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* FAQ                                                            */
/* ────────────────────────────────────────────────────────────── */
const FAQ = () => {
    const items = [
        {
            q: "Is it safe?",
            a: "Every driver submits ID, a valid license and vehicle details, which our team reviews before activation. Passengers can see driver ratings and vehicle info before booking, and every trip has an emergency contact on file.",
        },
        {
            q: "How do I pay?",
            a: "You can pay cash directly to the driver when you board, or upload proof of a bank / mobile money deposit in the app. Your seat is only confirmed once the driver accepts the payment method.",
        },
        {
            q: "Can I cancel?",
            a: "Yes. Cancel free of charge up to 6 hours before departure for intercity rides, or 30 minutes before for local shared rides. Repeat late cancellations may affect your rider rating.",
        },
        {
            q: "I'm a driver — how do I get verified?",
            a: "Tap ‘Become a Driver’, submit your ID, license and vehicle photos, and our team reviews your application within 24 hours. You keep 100% of seat fares.",
        },
        {
            q: "Which cities do you cover?",
            a: "Intercity: Harare, Bulawayo, Mutare, Gweru, Masvingo and Victoria Falls. Local shared rides: Harare CBD to Avondale, Borrowdale, Chitungwiza and Norton, with more suburbs added weekly.",
        },
        {
            q: "What if the driver is late?",
            a: "You can call, SMS or WhatsApp your driver directly from the trip screen. If a driver is over 20 minutes late without notice, cancel for a full refund and we flag the account for review.",
        },
    ];
    return (
        <section id="faq" data-testid="faq" className="py-24 md:py-32">
            <div className="max-w-3xl mx-auto px-5 md:px-8">
                <div className="text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#22C55E]">
                        FAQ
                    </p>
                    <h2 className="font-display font-black tracking-tight-xl mt-3 text-4xl sm:text-5xl leading-[1]">
                        Everything, answered.
                    </h2>
                </div>

                <Accordion
                    type="single"
                    collapsible
                    className="mt-12 space-y-3"
                >
                    {items.map((it, i) => (
                        <AccordionItem
                            key={it.q}
                            value={`q-${i}`}
                            className="surface rounded-2xl px-5 !border-white/5"
                            data-testid={`faq-item-${i}`}
                        >
                            <AccordionTrigger
                                className="font-display font-extrabold text-left text-base md:text-lg tracking-tight hover:no-underline py-5 [&>svg.lucide-chevron-down]:hidden"
                            >
                                <span className="flex-1">{it.q}</span>
                                <span className="faq-caret shrink-0 transition-transform duration-300 inline-flex">
                                    <Plus
                                        size={18}
                                        className="text-[#22C55E]"
                                        aria-hidden
                                    />
                                </span>
                            </AccordionTrigger>
                            <AccordionContent className="text-[#9CA3AF] leading-relaxed pb-5 pr-8">
                                {it.a}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* DOWNLOAD CTA                                                   */
/* ────────────────────────────────────────────────────────────── */
const DownloadCTA = () => (
    <section
        data-testid="download-cta"
        className="py-20 md:py-24"
    >
        <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div
                className="relative overflow-hidden rounded-3xl p-10 md:p-16"
                style={{
                    background:
                        "linear-gradient(135deg, #22C55E 0%, #16a34a 100%)",
                }}
            >
                <div
                    className="absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl opacity-40"
                    style={{ background: "#ffffff" }}
                    aria-hidden
                />
                <div className="relative grid md:grid-cols-[1.2fr_0.8fr] items-center gap-8">
                    <div>
                        <h2 className="font-display font-black tracking-tight-xl text-4xl sm:text-5xl lg:text-6xl leading-[1] text-[#06210F]">
                            Your seat.
                            <br />
                            Your route.
                            <br />
                            LetsGo.
                        </h2>
                        <p className="mt-5 text-[#06210F]/80 text-base md:text-lg max-w-md">
                            Free to download. Book your first seat in under 60
                            seconds.
                        </p>
                    </div>
                    <div className="flex md:justify-end flex-wrap gap-3">
                        <a
                            href="#"
                            data-testid="app-store-btn"
                            className="flex items-center gap-3 bg-[#0F1115] text-white rounded-2xl px-5 py-3.5 hover:-translate-y-0.5 transition-transform"
                        >
                            <Apple size={26} />
                            <div className="leading-tight">
                                <div className="text-[10px] uppercase tracking-widest text-white/60">
                                    Download on the
                                </div>
                                <div className="font-display font-extrabold text-lg">
                                    App Store
                                </div>
                            </div>
                        </a>
                        <a
                            href="#"
                            data-testid="play-store-btn"
                            className="flex items-center gap-3 bg-[#0F1115] text-white rounded-2xl px-5 py-3.5 hover:-translate-y-0.5 transition-transform"
                        >
                            <Play size={24} className="fill-white" />
                            <div className="leading-tight">
                                <div className="text-[10px] uppercase tracking-widest text-white/60">
                                    Get it on
                                </div>
                                <div className="font-display font-extrabold text-lg">
                                    Google Play
                                </div>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </section>
);

/* ────────────────────────────────────────────────────────────── */
/* FOOTER                                                         */
/* ────────────────────────────────────────────────────────────── */
const Footer = () => {
    const cols = [
        {
            title: "Product",
            links: ["How it works", "For Drivers", "Safety", "Pricing"],
        },
        {
            title: "Company",
            links: ["About", "Blog", "Careers", "Contact"],
        },
        {
            title: "Legal",
            links: ["Terms", "Privacy", "Cookies", "Refunds"],
        },
    ];
    return (
        <footer
            data-testid="footer"
            className="bg-[#0F1115] border-t border-white/5 pt-16 pb-10"
        >
            <div className="max-w-7xl mx-auto px-5 md:px-8 grid gap-10 md:grid-cols-4">
                <div>
                    <div className="flex items-center gap-2 font-display font-extrabold text-white text-lg">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#22C55E] shadow-[0_0_14px_rgba(34,197,94,0.8)]" />
                        LetsGo Ride
                    </div>
                    <p className="mt-3 text-sm text-[#9CA3AF] max-w-xs">
                        Zimbabwe’s ride-sharing network.
                    </p>
                </div>
                {cols.map((c) => (
                    <div key={c.title}>
                        <div className="text-xs font-bold uppercase tracking-widest text-white/55">
                            {c.title}
                        </div>
                        <ul className="mt-4 space-y-2.5">
                            {c.links.map((l) => (
                                <li key={l}>
                                    <a
                                        href="#"
                                        className="text-sm text-white/80 hover:text-[#22C55E] transition-colors"
                                        data-testid={`footer-link-${l.toLowerCase().replace(/\s/g, "-")}`}
                                    >
                                        {l}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Legal Notice */}
            <div className="max-w-7xl mx-auto px-5 md:px-8 mt-14">
                <div
                    data-testid="legal-notice"
                    className="border-t border-white/5 pt-8 text-[13px] leading-relaxed text-white/55"
                >
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
                        Operated by
                    </div>
                    <div className="mt-3 space-y-1.5">
                        <p className="text-white/80 font-semibold">
                            Wisewave Sp. z o.o. (Limited Liability Company)
                        </p>
                        <p>
                            Registered address: Chopina 41 lok. 2, 20-023
                            Lublin, Lubelskie, Poland
                        </p>
                        <p>
                            KRS: 0001063301 &nbsp;·&nbsp; NIP: 7123463089
                            &nbsp;·&nbsp; REGON: 526648917
                        </p>
                        <p>
                            Registered: 11 October 2023 &nbsp;·&nbsp; Last KRS
                            update: 27 January 2025
                        </p>
                        <p>
                            Representation: Management Board — each Board
                            member is authorised to act independently on behalf
                            of the company.
                        </p>
                    </div>

                    <p className="mt-6 text-white/45">
                        © 2025 Wisewave Sp. z o.o. All rights reserved.
                        &nbsp;“LetsGo Ride” is a service operated by Wisewave
                        Sp. z o.o.
                    </p>
                </div>
            </div>
        </footer>
    );
};

/* ────────────────────────────────────────────────────────────── */
/* PAGE                                                           */
/* ────────────────────────────────────────────────────────────── */
export default function Landing() {
    return (
        <main
            data-testid="landing-page"
            className="min-h-screen bg-[#0F1115] text-white antialiased"
        >
            <Nav />
            <Hero />
            <TrustStrip />
            <HowItWorks />
            <RouteSplit />
            <ForDrivers />
            <Safety />
            <Testimonials />
            <FAQ />
            <DownloadCTA />
            <Footer />
        </main>
    );
}
