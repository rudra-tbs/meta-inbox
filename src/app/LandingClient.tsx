'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Ban,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  Database,
  FileText,
  Flame,
  History,
  MapPin,
  MoonStar,
  Settings2,
  Smartphone,
  Sparkles,
  Tag,
  User as UserIcon,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useCountUp, useCycle, useReveal, useStream } from '@/lib/use-reveal';

export default function LandingClient() {
  return (
    <div className="min-h-screen bg-elevated text-text-primary">
      <Nav />
      <Hero />
      <Stats />
      <Spotlight
        eyebrow="AI qualifies every lead"
        title="An AI agent handles the first round — in Hindi, English, or Hinglish."
        body="Every inbound WhatsApp message gets a warm, on-brand reply within seconds. The AI asks one question at a time, never spams a list, and matches whatever language the lead uses. It only hands off when the lead is ready to talk to a planner."
        bullets={[
          'Collects city, event date, budget without sounding like a form',
          'Switches language mid-conversation if the lead does',
          'Abstains and escalates when it would have to guess on pricing or contracts',
        ]}
        visual={<HinglishChatMockup />}
      />
      <Spotlight
        eyebrow="Smart handoff"
        title="Drafted replies waiting for you the moment you take over."
        body="When the lead asks for pricing, mentions a competitor, or is ready to book, the AI flags the thread and lands it in your queue with full qualification context. Even in human mode it keeps drafting the next message in the background — read it, tweak it, send it."
        bullets={[
          'AI/Human pill toggle on every conversation header',
          '"Send a test message to {your_number}" hint when the inbox is empty',
          'AI re-activates automatically after 30 days of silence',
        ]}
        visual={<HandoffMockup />}
        reverse
      />
      <Spotlight
        eyebrow="Multi-brand from one inbox"
        title="Run every brand you handle from the same place — with its own identity."
        body="Each brand maps to a CRM pipeline. Admins set a custom color, optional logo, default conversation mode, and per-brand AI system prompt. Agents only see the brands they're assigned to."
        bullets={[
          'Per-brand color and logo in the side rail',
          'Default AI/Human mode per brand for new conversations',
          'Per-brand AI prompt — same agent, different voice per brand',
        ]}
        visual={<BrandRailMockup />}
      />
      <Spotlight
        eyebrow="Push to CRM"
        title="One click sends the qualified lead straight into the right pipeline."
        body="The modal pre-fills everything the AI collected — client name, city, event date, guest count, budget — plus the last few AI messages as notes. Admins map each brand to a CRM pipeline and initial stage from the Pipelines tab, so the deal lands in exactly the right place."
        bullets={[
          'No double entry — qualification fields flow straight through',
          'Phone number auto-stripped of country code so the CRM matches existing contacts',
          'Audit-logged with who pushed, when, and which deal ID came back',
        ]}
        visual={<PushToCRMMockup />}
        reverse
      />
      <SmallerFeatures />
      <HowItWorks />
      <ClosingCTA />
      <Footer />
    </div>
  );
}

// ─── Layout: nav, hero ──────────────────────────────────────────────────────

function Nav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-elevated/80 border-b border-border-default">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-text-inverse font-bold text-sm">A</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Inbox</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="#features"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            What&apos;s inside
          </Link>
          <Link
            href="#how"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-2"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium bg-brand text-text-inverse px-3.5 py-1.5 rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
          >
            Create account
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-brand-soft/40 via-elevated to-elevated pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-12 md:pb-20">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-soft text-brand text-[11px] font-medium mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              Internal tool · Acceltancy team
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              The team inbox for every lead, every brand.
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-xl">
              Inbound WhatsApp leads land here. An AI qualifies them in their own language,
              hands them off when they&apos;re ready to talk numbers, and pushes the closed
              deal straight to the CRM. One inbox, every brand you handle.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand text-text-inverse hover:bg-brand-hover transition-colors shadow-sm"
              >
                Create your account
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold text-text-primary border border-border-default bg-elevated hover:bg-canvas transition-colors"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-5 text-[12px] text-text-muted">
              For team members across Acceltancy&apos;s brands.
            </p>
          </div>

          <InboxMockup />
        </div>
      </div>
    </section>
  );
}

const HERO_MESSAGES: Array<{ side: 'left' | 'right'; ai?: boolean; text: string }> = [
  { side: 'left',                text: "Hi! We're planning our wedding in Goa next December." },
  { side: 'right', ai: true,     text: 'Lovely — congratulations! Goa is gorgeous in December. Roughly how many guests are you expecting?' },
  { side: 'left',                text: 'Around 300, give or take.' },
  { side: 'right', ai: true,     text: 'Got it. And do you have a venue in mind, or should our planners shortlist a few?' },
  { side: 'left',                text: 'Please shortlist! Budget around 45L.' },
];

function InboxMockup() {
  const { ref, revealed } = useReveal<HTMLDivElement>({ threshold: 0.2 });
  // ~900ms between bubbles — feels like a real, slightly slow chat
  // rather than a flipbook. The next-message-is-AI peek drives the
  // "AI · drafting" indicator that fills the pause.
  const shown = useStream(HERO_MESSAGES.length, 900, revealed);
  const next = HERO_MESSAGES[shown];
  const showTyping = shown < HERO_MESSAGES.length && next?.ai;

  return (
    <div ref={ref} className="relative">
      <div className="absolute -inset-6 bg-gradient-to-br from-brand/20 via-brand-soft/30 to-transparent rounded-3xl blur-2xl" />

      <div className="relative rounded-2xl border border-border-default bg-elevated shadow-2xl overflow-hidden">
        <BrowserChrome />

        <div className="flex h-[420px] bg-elevated">
          {/* Brand rail with custom colors */}
          <div className="w-12 bg-inverse flex flex-col items-center py-2.5 gap-1.5">
            <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-[10px] font-bold text-text-inverse">A</div>
            <BrandChip color="#7c3aed" label="TBS" active />
            <BrandChip color="#ec4899" label="RD" />
            <BrandChip color="#0ea5e9" label="VL" />
          </div>

          <div className="w-[180px] border-r border-border-default bg-elevated overflow-hidden">
            <div className="px-3 py-2 border-b border-border-subtle">
              <div className="h-6 rounded bg-muted" />
            </div>
            <MockConvRow name="Priya Sharma" preview="Hi! We are looking at Goa for…" time="2m" unread={3} active />
            <MockConvRow name="Aryan Patel" preview="Sounds great — what is your bu…" time="14m" mode="HUMAN" />
            <MockConvRow name="Mehak Khanna" preview="Approx 350 guests, December 2…" time="1h" hot />
            <MockConvRow name="Rohan Sethi" preview="Will check with my fiancé and…" time="3h" />
            <MockConvRow name="Vidya Iyer" preview="₹50L is our hard upper limit." time="1d" />
          </div>

          <div className="flex-1 flex flex-col bg-warm chat-pattern">
            <div className="px-3 py-2 border-b border-border-default bg-elevated">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Priya Sharma</div>
                  <div className="text-[10px] text-text-secondary">+91 98••• ••812 · AI mode</div>
                </div>
                <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5 text-[9px]">
                  <span className="px-2 py-0.5 rounded-full bg-elevated font-semibold shadow-sm">AI</span>
                  <span className="px-2 py-0.5 text-text-muted">Human</span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-3 space-y-2">
              {HERO_MESSAGES.slice(0, shown).map((m, i) => (
                <div key={i} className="bubble-in">
                  <MockBubble side={m.side} ai={m.ai}>{m.text}</MockBubble>
                </div>
              ))}
              {showTyping && <MockTypingIndicator />}
            </div>
            <div className="border-t border-border-default px-3 py-2 bg-elevated">
              <div className="h-7 rounded-full bg-canvas border border-border-default flex items-center px-3 text-[10px] text-text-muted">
                Switch to human mode to reply
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact AI typing indicator used inside chat mockups. Mirrors the
// real inbox's AiTypingIndicator but at mockup scale.
function MockTypingIndicator() {
  return (
    <div className="flex justify-end bubble-in" aria-hidden>
      <div className="bg-brand-soft/80 rounded-lg rounded-tr-sm px-2 py-1.5 inline-flex items-center gap-1">
        <Sparkles className="w-2.5 h-2.5 text-brand" />
        <span className="text-[8px] uppercase font-semibold text-brand tracking-wide">AI · drafting</span>
        <span className="flex gap-0.5 ml-0.5">
          <span className="w-0.5 h-0.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '0ms', animationDuration: '900ms' }} />
          <span className="w-0.5 h-0.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '150ms', animationDuration: '900ms' }} />
          <span className="w-0.5 h-0.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '300ms', animationDuration: '900ms' }} />
        </span>
      </div>
    </div>
  );
}

function Stats() {
  // One observer for the whole row so all four numbers count up
  // together — the row reveals as a unit, and each Stat consumes the
  // same `revealed` flag to drive its useCountUp.
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section className="border-y border-border-default bg-canvas">
      <div
        ref={ref}
        className={`reveal max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 ${revealed ? 'is-visible' : ''}`}
      >
        <Stat value="5"    unit="data points" label="The AI collects before any planner is involved" run={revealed} />
        <Stat value="<60s"                    label="From inbound message to the AI's first reply" run={revealed} />
        <Stat value="3+"   unit="brands"      label="Run from one inbox with per-brand access" run={revealed} />
        <Stat value="100%"                    label="Audit-logged — every mode toggle, assignment, and CRM push" run={revealed} />
      </div>
    </section>
  );
}

function Stat({ value, unit, label, run }: { value: string; unit?: string; label: string; run: boolean }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight tabular-nums">
        <AnimatedStatValue value={value} run={run} />
        {unit && <span className="ml-1 text-base md:text-lg text-text-secondary font-medium">{unit}</span>}
      </div>
      <p className="mt-1.5 text-[12px] md:text-sm text-text-secondary leading-snug max-w-[220px]">{label}</p>
    </div>
  );
}

// Pulls the integer out of a Stat value string ("5", "<60s", "3+",
// "100%") and animates it from 0 → target with useCountUp once `run`
// flips true. The non-numeric prefix/suffix is preserved so the
// rendered string still matches the original ("<60s", "3+").
function AnimatedStatValue({ value, run }: { value: string; run: boolean }) {
  const numMatch = value.match(/(\d+)/);
  const target = numMatch ? parseInt(numMatch[1], 10) : 0;
  const animated = useCountUp(target, run);
  if (!numMatch) return <>{value}</>;
  const before = value.slice(0, numMatch.index!);
  const after = value.slice(numMatch.index! + numMatch[1].length);
  return <>{before}{animated}{after}</>;
}

// ─── Spotlight wrapper — alternating left/right with mockup + copy ─────────

function Spotlight({
  eyebrow,
  title,
  body,
  bullets,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  // Copy reveals first, mockup follows ~140ms behind so the eye
  // tracks "read the headline" → "look at the visual" rather than
  // hitting both at once.
  const copy = useReveal<HTMLDivElement>();
  const visualReveal = useReveal<HTMLDivElement>();
  return (
    <section className="border-b border-border-subtle last:border-b-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div
            ref={copy.ref}
            className={`reveal order-1 ${reverse ? 'lg:order-2' : ''} ${copy.revealed ? 'is-visible' : ''}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-brand mb-3">
              {eyebrow}
            </div>
            <h2 className="text-2xl md:text-3xl lg:text-[2.5rem] font-bold tracking-tight leading-[1.15]">
              {title}
            </h2>
            <p className="mt-4 text-base text-text-secondary leading-relaxed">{body}</p>
            {bullets && (
              <ul className="mt-6 space-y-2.5">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-text-default">
                    <Check className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" strokeWidth={2.5} aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            ref={visualReveal.ref}
            style={{ transitionDelay: visualReveal.revealed ? '140ms' : '0ms' }}
            className={`reveal order-2 ${reverse ? 'lg:order-1' : ''} ${visualReveal.revealed ? 'is-visible' : ''}`}
          >
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Spotlight visuals ─────────────────────────────────────────────────────

const HINGLISH_MESSAGES: Array<{ ai?: boolean; human?: boolean; text: string }> = [
  {                  text: 'Hi, mujhe apni shaadi plan karwani hai' },
  { ai: true,        text: 'Hi! Bahut khushi hui aapka message dekh kar 🌸 Aapki shaadi kis city mein hold ho rahi hai?' },
  {                  text: 'Delhi mein, December 2026' },
  { ai: true,        text: 'Wonderful — Delhi December weddings are gorgeous! Aapne approximate budget range kya socha hai?' },
  {                  text: 'Budget 25-30 lakhs around' },
  { ai: true,        text: 'Got it — 25-30L range, Delhi, December 2026. Thank you! One of our wedding planners will reach out shortly with a customised plan.' },
];

function HinglishChatMockup() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const shown = useStream(HINGLISH_MESSAGES.length, 850, revealed);
  // The "Qualified" card slides in only after the last AI message,
  // mirroring the real flow — qualification fires post-final reply.
  const qualified = shown >= HINGLISH_MESSAGES.length;
  return (
    <div ref={ref}>
      <FloatingCard>
        <BrowserChrome compact />
        <div className="bg-warm chat-pattern p-4 space-y-2 min-h-[440px]">
          {HINGLISH_MESSAGES.slice(0, shown).map((m, i) => (
            <div key={i} className="bubble-in">
              {m.ai ? <ChatRight ai>{m.text}</ChatRight> : <ChatLeft>{m.text}</ChatLeft>}
            </div>
          ))}
          {qualified && (
            <div className="mt-3 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-[11px] flex items-center gap-2 bubble-in">
              <Check className="w-3.5 h-3.5 text-success flex-shrink-0" aria-hidden />
              <div>
                <div className="font-semibold text-success">Qualified · routed to human queue</div>
                <div className="text-text-secondary mt-0.5">City · Delhi  ·  Event · Dec 2026  ·  Budget · ₹25-30L</div>
              </div>
            </div>
          )}
        </div>
      </FloatingCard>
    </div>
  );
}

const HANDOFF_MESSAGES: Array<{ human?: boolean; text: string }> = [
  {              text: 'Can you share approximate pricing for full planning + decor?' },
  { human: true, text: 'Hi Mehak! Sharing a personalised plan now — one moment 🌸' },
  {              text: 'Sure, take your time!' },
];

function HandoffMockup() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const shown = useStream(HANDOFF_MESSAGES.length, 800, revealed);
  // Suggested-reply card lands after the last lead message and pulses
  // a brand-color halo twice — the "AI just dropped a draft" beat.
  const suggested = shown >= HANDOFF_MESSAGES.length;
  return (
    <div ref={ref}>
      <FloatingCard>
        <div className="bg-elevated">
          <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold inline-flex items-center gap-1">
                Mehak Khanna
                <Flame className="w-3.5 h-3.5 text-danger" fill="currentColor" aria-hidden />
              </div>
              <div className="text-[10px] text-text-secondary">+91 98••• ••204 · returning · last active 8m ago</div>
            </div>
            <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5 text-[10px]">
              <span className="px-2.5 py-1 text-text-muted">AI</span>
              <span className="px-2.5 py-1 rounded-full bg-elevated font-semibold shadow-sm">Human</span>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-canvas border-b border-border-default flex items-center gap-2 flex-wrap text-[10px]">
            <Pill icon={MapPin}   label="City"   value="Mumbai" />
            <Pill icon={Calendar} label="Event"  value="Feb 2027" />
            <Pill icon={Users}    label="Guests" value="350" />
            <Pill icon={Wallet}   label="Budget" value="₹60L+" />
          </div>

          <div className="bg-warm chat-pattern p-4 space-y-2 min-h-[260px]">
            {HANDOFF_MESSAGES.slice(0, shown).map((m, i) => (
              <div key={i} className="bubble-in">
                {m.human ? <ChatRight human>{m.text}</ChatRight> : <ChatLeft>{m.text}</ChatLeft>}
              </div>
            ))}

            {suggested && (
              <div className="mt-3 rounded-lg border border-brand/30 bg-brand-soft/50 px-3 py-2 bubble-in brand-glow">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" aria-hidden /> Suggested reply
                  </span>
                  <span className="text-[9px] text-text-muted">drafted by AI</span>
                </div>
                <p className="text-[11px] text-text-default leading-relaxed">
                  For Mumbai full planning + decor at the 60L+ tier, we typically put together a custom package across venue,
                  catering, decor, and on-site coordination. I&apos;ll WhatsApp you a one-pager in the next hour with a clearer
                  breakdown — sound good?
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <button className="text-[10px] bg-brand text-text-inverse px-2 py-1 rounded">Use draft</button>
                  <button className="text-[10px] text-text-secondary px-2 py-1">Edit</button>
                  <button className="text-[10px] text-text-secondary px-2 py-1">Dismiss</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}

const BRANDS: Array<{
  color: string;
  label: string;
  name: string;
  mode: 'AI' | 'Human';
  pipeline: string;
  stage: string;
  modeTone: 'success' | 'warning';
}> = [
  { color: '#7c3aed', label: 'TBS', name: 'The Bride Side', mode: 'AI',    pipeline: '#67 Planning',  stage: 'Lead In',     modeTone: 'success' },
  { color: '#ec4899', label: 'RD',  name: 'Revaah Decor',   mode: 'Human', pipeline: '#58 Decor',     stage: 'New Inquiry', modeTone: 'warning' },
  { color: '#0ea5e9', label: 'VL',  name: 'VenueList',      mode: 'AI',    pipeline: '#42 Venues',    stage: 'Inquiry',     modeTone: 'success' },
  { color: '#10b981', label: 'CT',  name: 'Catering Co',    mode: 'AI',    pipeline: '#71 Catering',  stage: 'Lead In',     modeTone: 'success' },
];

function BrandRailMockup() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  // Cycle through brands every 3.2s once the mockup scrolls into
  // view. The active chip on the rail and the headline config card
  // below both update from the same index.
  const i = useCycle(BRANDS.length, 3200, revealed);
  const active = BRANDS[i];
  const dotTone = active.modeTone === 'success' ? 'bg-success' : 'bg-warning';
  const modeTextTone = active.modeTone === 'success' ? 'text-text-default' : 'text-warning';
  return (
    <div ref={ref}>
      <FloatingCard>
        <div className="bg-inverse p-6 flex items-start gap-6 min-h-[440px]">
          {/* Big brand rail */}
          <div className="flex flex-col items-center gap-2">
            <div className="text-[9px] uppercase tracking-wide text-white/40 mb-1">Brands</div>
            {BRANDS.map((b, idx) => (
              <BigBrandChip
                key={b.label}
                color={b.color}
                label={b.label}
                name={b.name}
                active={idx === i}
              />
            ))}
            <BigBrandChip logo label="" name="Logo brand" />
            <div className="w-12 h-12 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-white/40 text-lg">+</div>
          </div>

          <div className="flex-1 space-y-3">
            {/* Active brand — keyed so React remounts on cycle,
                triggering the bubble-in entrance animation. */}
            <div key={active.label} className="rounded-lg bg-elevated p-4 bubble-in">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${dotTone}`} />
                <span className="text-[11px] font-semibold text-text-primary">{active.name} · WhatsApp</span>
              </div>
              <div className="text-[10px] text-text-secondary leading-relaxed">
                Default mode: <span className={`${modeTextTone} font-medium`}>{active.mode}</span>  ·
                Pipeline: <span className="text-text-default font-medium">{active.pipeline}</span>  ·
                Initial stage: <span className="text-text-default font-medium">{active.stage}</span>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 px-4 py-3 text-[10px] text-white/60 leading-relaxed">
              Each brand has its own AI system prompt, default conversation mode, and visual identity. Admins configure all of it from the Pipelines tab.
            </div>
            <div className="flex items-center gap-1 pt-1">
              {BRANDS.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    idx === i ? 'w-6 bg-white/70' : 'w-1 bg-white/20'
                  }`}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}

function PushToCRMMockup() {
  return (
    <FloatingCard>
      <div className="bg-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Push to CRM</h3>
          <X className="w-4 h-4 text-text-muted" aria-hidden />
        </div>
        <div className="space-y-3">
          <Field label="Client name" value="Priya Sharma" />
          <Field label="Phone" value="+91 98••• ••812" readOnly />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value="Goa" />
            <Field label="Event date" value="2026-12-14" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Guest count" value="300" />
            <Field label="Budget (lakhs)" value="45" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-text-secondary mb-1">Notes</label>
            <div className="w-full text-[11px] border border-border-default rounded-md px-2.5 py-2 bg-canvas text-text-default leading-relaxed h-20 overflow-hidden">
              Lead asked about Goa wedding in December 2026, 300 guests, ~₹45L budget. Wants planner to shortlist venues. Speaks English, friendly tone.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to" value="Vishwas (CRM)" />
            <Field label="Pipeline" value="#67 Planning → Lead In" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-4 mt-3 border-t border-border-subtle">
          <button className="text-[11px] text-text-secondary px-3 py-1.5">Cancel</button>
          <button className="text-[11px] bg-brand text-text-inverse px-4 py-1.5 rounded-md font-semibold inline-flex items-center gap-1">
            Push to CRM <ArrowRight className="w-3 h-3" aria-hidden />
          </button>
        </div>
      </div>
    </FloatingCard>
  );
}

// ─── Smaller features grid (the rest) ──────────────────────────────────────

const FEATURES: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  { icon: <FileText  className="w-5 h-5" />, title: 'Reply templates',          body: 'Save the messages you type 30 times a week and recall them with a / shortcut. Each template is editable before sending.' },
  { icon: <Bell      className="w-5 h-5" />, title: 'Browser notifications',     body: 'When a hot lead replies and your tab is in the background, the browser pings you. Unread badges in the sidebar too.' },
  { icon: <Zap       className="w-5 h-5" />, title: 'Lead scoring',              body: 'High-budget, near-term, multi-service leads bubble to the top automatically. The flame marker tells you where to look first.' },
  { icon: <CheckCheck className="w-5 h-5" />,title: 'Read + delivery receipts',  body: 'See exactly when WhatsApp delivered your message and when the lead read it. No more guessing whether they ghosted or just got busy.' },
  { icon: <MoonStar  className="w-5 h-5" />, title: 'Snooze + bulk actions',     body: 'Send a thread back to your queue tomorrow morning. Select multiple to snooze, tag, or assign in one go.' },
  { icon: <Tag       className="w-5 h-5" />, title: 'Tag taxonomy',              body: 'Admin-managed master list of tags. The DetailRail autocompletes from it; #vip / #VIP / #Vip collapse to the same canonical tag on save.' },
  { icon: <Smartphone className="w-5 h-5" />,title: 'Mobile-friendly',           body: 'The DetailRail slides over instead of pushing the chat off-screen. Tap-to-dismiss backdrop, same workflow as desktop.' },
  { icon: <Ban       className="w-5 h-5" />, title: 'AI knows when not to answer', body: 'If a lead asks about exact pricing or contract terms, the AI abstains and tags the conversation so a planner steps in cleanly.' },
  { icon: <Database  className="w-5 h-5" />, title: 'System health checks',      body: 'The System tab probes every table, column, and RPC the app depends on. Missed migrations surface at a glance — no silent failures.' },
  { icon: <Settings2 className="w-5 h-5" />, title: 'Admin panel',               body: 'Every brand-level setting in one place — channels, pipelines, default modes, brand colors, tags, per-brand AI prompts, teammate invites.' },
  { icon: <History   className="w-5 h-5" />, title: 'Activity log',              body: 'Mode toggles, assignments, snoozes, callbacks, CRM pushes — every change timestamped against the conversation timeline so you can replay any thread.' },
];

function SmallerFeatures() {
  return (
    <section id="features" className="border-y border-border-default bg-canvas">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <div className="inline-block text-xs font-semibold uppercase tracking-wider text-brand mb-3">
            What else is inside
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            The other things that make a shift smoother.
          </h2>
          <p className="mt-4 text-base text-text-secondary leading-relaxed">
            Smaller details that compound over a week of conversations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {FEATURES.map((f, i) => (
            <Feature key={f.title} icon={f.icon} title={f.title} body={f.body} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  body,
  index,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  index: number;
}) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  // Stagger cards across the grid by index — the first 3 reveal
  // immediately, the next row 60ms later, etc. Cap at 240ms so
  // late-row cards don't feel out of step with the rest.
  const delay = Math.min(index * 60, 240);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
      className={`reveal group relative rounded-xl border border-border-default bg-elevated p-5 md:p-6 transition-shadow transition-colors hover:border-border-strong hover:shadow-md ${revealed ? 'is-visible' : ''}`}
    >
      <div className="w-10 h-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

// ─── How it works ──────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section id="how" className="bg-elevated">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <div className="inline-block text-xs font-semibold uppercase tracking-wider text-brand mb-3">
            How a lead flows through
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            From first WhatsApp ping to a closed booking.
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-5">
          <Step n={1} title="Lead messages your brand"   body="An ad click, a referral, or an Instagram story tap — the lead sends a message to your brand's WhatsApp number. The webhook routes it to the right brand automatically." />
          <Step n={2} title="AI qualifies in their language" body="Within seconds, the AI agent replies — asking about city, dates, guest count, and budget. Hindi, English, or Hinglish, whichever the lead used." />
          <Step n={3} title="Smart handoff to a planner" body="The instant the lead is ready to talk pricing or book, the conversation lands in your queue with all qualification data already collected." />
          <Step n={4} title="Push the deal to CRM"       body="One click sends the qualified lead into the right CRM pipeline + stage, with notes, contact, and budget pre-filled. No double entry." />
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  const delay = (n - 1) * 80;
  return (
    <div
      ref={ref}
      style={{ transitionDelay: revealed ? `${delay}ms` : '0ms' }}
      className={`reveal relative ${revealed ? 'is-visible' : ''}`}
    >
      <div className="w-9 h-9 rounded-full bg-brand text-text-inverse flex items-center justify-center font-bold text-sm mb-4">
        {n}
      </div>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

function ClosingCTA() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
      <div
        ref={ref}
        className={`reveal relative overflow-hidden rounded-2xl bg-inverse text-text-inverse px-6 md:px-12 py-12 md:py-16 text-center ${revealed ? 'is-visible' : ''}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
            New to the team? Get set up in two minutes.
          </h2>
          <p className="mt-4 text-base text-white/70 max-w-xl mx-auto leading-relaxed">
            Create an account with your work email, pick the brands you handle, and the rest of the inbox
            unlocks automatically. If you&apos;ve been onboarded before, just sign in.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand text-text-inverse hover:bg-brand-hover transition-colors shadow-lg"
            >
              Create your account
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-default bg-elevated">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-brand rounded-md flex items-center justify-center">
            <span className="text-text-inverse font-bold text-[11px]">A</span>
          </div>
          <span className="text-xs text-text-secondary">
            Inbox · Internal tool · Acceltancy © 2026
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Create account
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Reusable mockup primitives ────────────────────────────────────────────

function FloatingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-br from-brand/15 via-brand-soft/20 to-transparent rounded-3xl blur-2xl" />
      <div className="relative rounded-2xl border border-border-default bg-elevated shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function BrowserChrome({ compact, label }: { compact?: boolean; label?: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 ${compact ? 'py-1.5' : 'py-2'} border-b border-border-default bg-canvas`}>
      <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
      <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
      <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
      <div className="flex-1 ml-2 h-5 rounded bg-elevated border border-border-default flex items-center px-2 text-[9px] text-text-muted font-mono">
        {label ?? ''}
      </div>
    </div>
  );
}

function BrandChip({ color, label, active }: { color: string; label: string; active?: boolean }) {
  return (
    <div
      style={{ backgroundColor: active ? color : `${color}33`, color: '#fff' }}
      className={`w-9 h-9 rounded-md flex items-center justify-center text-[9px] font-bold transition-all ${active ? 'shadow-lg ring-1 ring-white/30' : ''}`}
    >
      {label}
    </div>
  );
}

function BigBrandChip({
  color,
  label,
  name,
  active,
  logo,
}: {
  color?: string;
  label: string;
  name: string;
  active?: boolean;
  logo?: boolean;
}) {
  return (
    <div
      title={name}
      style={color ? { backgroundColor: active ? color : `${color}55`, color: '#fff' } : undefined}
      className={`w-12 h-12 rounded-lg flex items-center justify-center text-[11px] font-bold overflow-hidden transition-all ${
        active ? 'shadow-lg ring-2 ring-white/30' : ''
      } ${logo ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : ''}`}
    >
      {logo ? '◆' : label}
    </div>
  );
}

function MockConvRow({
  name, preview, time, unread, active, mode, hot,
}: {
  name: string;
  preview: string;
  time: string;
  unread?: number;
  active?: boolean;
  mode?: 'AI' | 'HUMAN';
  hot?: boolean;
}) {
  return (
    <div className={`px-3 py-2 border-b border-border-subtle ${active ? 'bg-brand-soft' : ''}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className={`text-[11px] truncate ${unread ? 'font-semibold text-text-primary' : 'font-medium text-text-default'}`}>
          {name}
          {hot && <Flame className="w-3 h-3 ml-1 text-danger flex-shrink-0 inline" fill="currentColor" aria-hidden />}
        </span>
        <span className="text-[9px] text-text-muted">{time}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className={`text-[10px] truncate flex-1 ${unread ? 'text-text-primary' : 'text-text-secondary'}`}>
          {preview}
        </p>
        {unread && (
          <span className="text-[8px] font-semibold px-1 rounded-full bg-success text-text-inverse">
            {unread}
          </span>
        )}
        {mode === 'HUMAN' && (
          <span className="text-[8px] font-medium px-1 rounded bg-warning-soft text-warning">H</span>
        )}
      </div>
    </div>
  );
}

function MockBubble({ side, children, ai }: { side: 'left' | 'right'; children: React.ReactNode; ai?: boolean }) {
  if (side === 'left') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-elevated rounded-lg rounded-tl-sm px-2.5 py-1.5 text-[11px] text-text-primary shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-brand-tint rounded-lg rounded-tr-sm px-2.5 py-1.5 text-[11px] text-text-primary shadow-sm">
        {ai && (
          <div className="text-[8px] font-semibold uppercase text-brand mb-0.5 tracking-wide">AI</div>
        )}
        {children}
      </div>
    </div>
  );
}

function ChatLeft({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-elevated rounded-lg rounded-tl-sm px-3 py-2 text-[11px] text-text-primary shadow-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function ChatRight({ children, ai, human }: { children: React.ReactNode; ai?: boolean; human?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className={`max-w-[85%] rounded-lg rounded-tr-sm px-3 py-2 text-[11px] text-text-primary shadow-sm leading-relaxed ${
        ai ? 'bg-brand-tint' : human ? 'bg-warning-soft' : 'bg-brand-tint'
      }`}>
        {ai && (
          <div className="text-[8px] font-semibold uppercase text-brand mb-0.5 tracking-wide inline-flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" aria-hidden /> AI
          </div>
        )}
        {human && (
          <div className="text-[8px] font-semibold uppercase text-warning mb-0.5 tracking-wide inline-flex items-center gap-1">
            <UserIcon className="w-2.5 h-2.5" aria-hidden /> Vishwas
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-elevated border border-border-default">
      <Icon className="w-3 h-3 text-text-muted" aria-hidden />
      <span className="text-text-muted uppercase tracking-wide">{label}</span>
      <span className="font-medium text-text-default">{value}</span>
    </span>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-text-secondary mb-1">{label}</label>
      <div className={`w-full text-[11px] border border-border-default rounded-md px-2.5 py-2 text-text-default ${
        readOnly ? 'bg-canvas text-text-secondary' : 'bg-elevated'
      }`}>
        {value}
      </div>
    </div>
  );
}
