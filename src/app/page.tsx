import Link from 'next/link';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const cookieStore = cookies();
  const supabase = createSupabaseSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/inbox');

  return (
    <div className="min-h-screen bg-elevated text-text-primary">
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <ClosingCTA />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-elevated/80 border-b border-border-default">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-text-inverse font-bold text-sm">A</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Acceltancy Inbox</span>
        </Link>
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="#features"
            className="hidden md:inline text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Features
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
            Get started
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
              Built for India&apos;s wedding industry
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              Every wedding lead qualified the moment they message.
            </h1>
            <p className="mt-5 text-base md:text-lg text-text-secondary leading-relaxed max-w-xl">
              Acceltancy Inbox routes inbound WhatsApp and Instagram messages to an AI that asks the right
              questions — budget, dates, city, guest count, services — before any human is involved.
              Your planners step in only when a lead is ready to book.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand text-text-inverse hover:bg-brand-hover transition-colors shadow-sm"
              >
                Get started
                <Arrow className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold text-text-primary border border-border-default bg-elevated hover:bg-canvas transition-colors"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-5 text-[12px] text-text-muted">
              Live in production at The Bride Side. Self-serve setup in under 5 minutes.
            </p>
          </div>

          <InboxMockup />
        </div>
      </div>
    </section>
  );
}

function InboxMockup() {
  return (
    <div className="relative">
      {/* Soft glow behind the mockup */}
      <div className="absolute -inset-6 bg-gradient-to-br from-brand/20 via-brand-soft/30 to-transparent rounded-3xl blur-2xl" />

      <div className="relative rounded-2xl border border-border-default bg-elevated shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-default bg-canvas">
          <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
          <div className="flex-1 ml-2 h-5 rounded bg-elevated border border-border-default" />
        </div>

        {/* App body */}
        <div className="flex h-[420px] bg-elevated">
          {/* Brand rail */}
          <div className="w-10 bg-inverse flex flex-col items-center py-2 gap-2">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center text-[10px] font-bold text-text-inverse">A</div>
            <div className="w-7 h-7 rounded-md bg-elevated text-[10px] font-bold text-text-primary flex items-center justify-center shadow">TBS</div>
            <div className="w-7 h-7 rounded-md text-[10px] font-bold text-white/40 flex items-center justify-center">RD</div>
          </div>

          {/* Conversation list */}
          <div className="w-[180px] border-r border-border-default bg-elevated overflow-hidden">
            <div className="px-3 py-2 border-b border-border-subtle">
              <div className="h-6 rounded bg-muted" />
            </div>
            <MockConvRow name="Priya Sharma" preview="Hi! We are looking at Goa for…" time="2m" unread={3} active />
            <MockConvRow name="Aryan Patel" preview="Sounds great — what's your bu…" time="14m" mode="HUMAN" />
            <MockConvRow name="Mehak Khanna" preview="Approx 350 guests, December 2…" time="1h" hot />
            <MockConvRow name="Rohan Sethi" preview="Will check with my fiancé and…" time="3h" />
            <MockConvRow name="Vidya Iyer" preview="₹50L is our hard upper limit." time="1d" />
          </div>

          {/* Chat panel */}
          <div className="flex-1 flex flex-col bg-warm">
            <div className="px-3 py-2 border-b border-border-default bg-elevated">
              <div className="text-xs font-semibold">Priya Sharma</div>
              <div className="text-[10px] text-text-secondary">+91 98••• ••812 · AI mode</div>
            </div>
            <div className="flex-1 overflow-hidden p-3 space-y-2">
              <MockBubble side="left">Hi! We&apos;re planning our wedding in Goa next December.</MockBubble>
              <MockBubble side="right" ai>
                Lovely — congratulations! Goa is gorgeous in December. Roughly how many guests are you expecting?
              </MockBubble>
              <MockBubble side="left">Around 300, give or take.</MockBubble>
              <MockBubble side="right" ai>
                Got it. And do you have a venue in mind, or should our planners shortlist a few?
              </MockBubble>
              <MockBubble side="left">Please shortlist! Budget around 45L.</MockBubble>
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
          {hot && <span className="ml-1">🔥</span>}
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

function Stats() {
  return (
    <section className="border-y border-border-default bg-canvas">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
        <Stat value="5" unit="questions" label="Average qualification depth before any planner is involved" />
        <Stat value="<60s" label="From first inbound to AI's first reply" />
        <Stat value="3+" unit="brands" label="Run on one inbox with brand-scoped agent access" />
        <Stat value="100%" label="Audit-logged for accountability and compliance" />
      </div>
    </section>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight">
        {value}
        {unit && <span className="ml-1 text-base md:text-lg text-text-secondary font-medium">{unit}</span>}
      </div>
      <p className="mt-1.5 text-[12px] md:text-sm text-text-secondary leading-snug max-w-[200px]">{label}</p>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
      <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
        <div className="inline-block text-xs font-semibold uppercase tracking-wider text-brand mb-3">
          What&apos;s inside
        </div>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          An inbox that knows wedding planning.
        </h2>
        <p className="mt-4 text-base text-text-secondary leading-relaxed">
          Every feature is built around how Indian wedding planners actually work — fast WhatsApp replies,
          messy multi-event timelines, and the moment a lead is ready to talk numbers.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        <Feature
          icon={<AiIcon />}
          title="AI lead qualification"
          body="A trained AI agent collects city, dates, guest count, budget, and service needs — in Hindi, English, or Hinglish — before any planner is pinged."
        />
        <Feature
          icon={<HandoffIcon />}
          title="Smart handoff to humans"
          body="The AI hands off the moment a lead asks for pricing, mentions a deal, or wants to book. No babysitting required."
        />
        <Feature
          icon={<SuggestIcon />}
          title="Suggested replies in human mode"
          body="Even after handoff, the AI drafts the next message based on conversation context. Your team sends in two taps."
        />
        <Feature
          icon={<BrandIcon />}
          title="Multi-brand from day one"
          body="Run The Bride Side, Revaah Decor, and every future brand from one inbox. Agents only see brands they're assigned to."
        />
        <Feature
          icon={<ChannelIcon />}
          title="WhatsApp + Instagram"
          body="Connect WhatsApp Business and Instagram DM per brand. Inbound routes automatically based on which number received it."
        />
        <Feature
          icon={<ScoreIcon />}
          title="Lead scoring"
          body="High-budget, near-term, multi-service leads bubble to the top automatically. Stop missing the bookings that matter."
        />
        <Feature
          icon={<CrmIcon />}
          title="One-click push to CRM"
          body="Send a qualified deal to your existing CRM with budget, dates, guest count, and conversation history pre-filled."
        />
        <Feature
          icon={<TemplateIcon />}
          title="Reply templates"
          body="Save the 30 messages your planners type every week. Insert with a shortcut and tweak per lead."
        />
        <Feature
          icon={<NotifyIcon />}
          title="Browser notifications"
          body="Get pinged the instant a high-priority lead replies — even when the tab is in the background."
        />
        <Feature
          icon={<ReceiptIcon />}
          title="Read receipts"
          body="See exactly when a lead read your message. Stop guessing if they ghosted or just got busy."
        />
        <Feature
          icon={<SnoozeIcon />}
          title="Snooze + tags"
          body="Send a thread back to tomorrow morning. Slice the inbox by venue type, budget tier, or campaign source."
        />
        <Feature
          icon={<AuditIcon />}
          title="Full activity log"
          body="Every action — mode toggle, assignment, push to CRM, snooze — audit-logged so nothing slips through the cracks."
        />
      </div>
    </section>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="group relative rounded-xl border border-border-default bg-elevated p-5 md:p-6 hover:border-border-strong transition-colors">
      <div className="w-10 h-10 rounded-lg bg-brand-soft text-brand flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="bg-canvas border-y border-border-default">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <div className="inline-block text-xs font-semibold uppercase tracking-wider text-brand mb-3">
            How it works
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Three steps from inbound message to closed booking.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Step
            n={1}
            title="Lead messages your WhatsApp"
            body="An ad click, an Instagram story tap, or a referral — the lead sends a message to your business number. The webhook routes it to the right brand automatically."
          />
          <Step
            n={2}
            title="AI qualifies in their language"
            body="The AI replies within seconds, asking about city, dates, guest count, and budget. It speaks Hindi, English, or Hinglish — whichever the lead used."
          />
          <Step
            n={3}
            title="Your planner takes over to close"
            body="The moment the lead is ready to discuss pricing or book, the inbox flags it. Your planner sees the full conversation and a suggested next reply."
          />
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="relative">
      <div className="w-9 h-9 rounded-full bg-brand text-text-inverse flex items-center justify-center font-bold text-sm mb-4">
        {n}
      </div>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{body}</p>
    </div>
  );
}

function ClosingCTA() {
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
      <div className="relative overflow-hidden rounded-2xl bg-inverse text-text-inverse px-6 md:px-12 py-12 md:py-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-transparent to-transparent pointer-events-none" />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
            Spend your time closing weddings, not qualifying leads.
          </h2>
          <p className="mt-4 text-base text-white/70 max-w-xl mx-auto leading-relaxed">
            Set up your inbox in under five minutes. No credit card. No sales call. Just sign up and connect
            your WhatsApp number.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand text-text-inverse hover:bg-brand-hover transition-colors shadow-lg"
            >
              Get started
              <Arrow className="w-3.5 h-3.5" />
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
            © 2026 Acceltancy. Built for the Indian wedding industry.
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/login" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="text-xs text-text-secondary hover:text-text-primary transition-colors">
            Get started
          </Link>
        </div>
      </div>
    </footer>
  );
}

// --- Icons ---

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6l6 6-6 6" />
    </svg>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5">
      {children}
    </svg>
  );
}

function AiIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2m15.07-7.07l-2.12 2.12M6.93 17.07l-2.12 2.12m12.26 0l-2.12-2.12M6.93 6.93L4.81 4.81M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></Icon>;
}
function HandoffIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M9 17l-4-4m0 0l4-4m-4 4h14m-4 4l4-4m0 0l-4-4" /></Icon>;
}
function SuggestIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 14.5L4 20l2-5.5L4 9l5.5 2L15 5.5l-2 5.5 7 1.5-5.5 2L13 20l-3.5-5.5z" /></Icon>;
}
function BrandIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" /></Icon>;
}
function ChannelIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 11-1.6-4.8L21 4v6h-6" /></Icon>;
}
function ScoreIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h7v8l10-12h-7V2z" /></Icon>;
}
function CrmIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h7m4-7l3 3m0 0l-3 3m3-3h-9" /></Icon>;
}
function TemplateIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" /></Icon>;
}
function NotifyIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A7 7 0 0119 11V8a7 7 0 10-14 0v3a7 7 0 01-.6 4.6L3 17h5m7 0a3 3 0 11-6 0" /></Icon>;
}
function ReceiptIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7M2 12l5 5" /></Icon>;
}
function SnoozeIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></Icon>;
}
function AuditIcon() {
  return <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></Icon>;
}
