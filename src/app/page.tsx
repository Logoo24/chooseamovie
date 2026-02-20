import Link from "next/link";
import { LandingTitleCarouselCard } from "@/components/landing/LandingTitleCarouselCard";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Reveal } from "@/components/landing/Reveal";

const featureBullets = [
  "Endless discovery mode",
  "Custom list nights",
  "Group results with averages",
  "Shareable join link",
];

const howItWorksSteps = [
  {
    title: "Create a group",
    description: "Start in seconds with endless mode or build a custom list for a specific movie night.",
    Icon: GroupIcon,
  },
  {
    title: "Set filters",
    description: "Pick genres, release years, and provider preferences so everyone sees better options sooner.",
    Icon: FilterIcon,
  },
  {
    title: "Rate and decide",
    description: "Everyone rates quickly, and the best picks rise to the top with clear group results.",
    Icon: StarIcon,
  },
];

const howItWorksBenefits = [
  {
    title: "No arguing.",
    description: "Everyone gets equal input with the same simple rating flow.",
  },
  {
    title: "No endless browsing.",
    description: "Filters and ranking keep your group focused on strong options.",
  },
  {
    title: "No group texts.",
    description: "Share one join link and decide together in one place.",
  },
];

const primaryCtaClass =
  "inline-flex items-center justify-center rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))] px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_10px_24px_rgba(229,9,20,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/40";
const secondaryCtaClass =
  "inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

export default function Home() {
  return (
    <div className="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <LandingHeader />

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[-200px] mx-auto h-[480px] w-[min(1100px,100%)] rounded-full bg-[radial-gradient(circle,rgba(229,9,20,0.24)_0%,rgba(229,9,20,0)_72%)] blur-3xl"
          />
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Pick a movie together in minutes.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base text-white/75 sm:text-lg">
                Create a group, set filters, rate titles, and get a ranked list everyone agrees on.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/create" className={primaryCtaClass}>
                  Create a group
                </Link>
                <a href="#how-it-works" className={secondaryCtaClass}>
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-sm text-white/60">Works best with 2-8 people.</p>
            </Reveal>

            <Reveal className="mx-auto mt-10 max-w-3xl" delayMs={80}>
              <LandingTitleCarouselCard />
            </Reveal>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-28">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
              <p className="mt-3 text-base text-white/70">It takes about a minute to get started.</p>
            </Reveal>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {howItWorksBenefits.map((item, index) => (
                <Reveal key={item.title} className="h-full" delayMs={index * 60}>
                  <article className="how-gradient-sweep h-full rounded-2xl border border-white/12 p-4">
                    <h3 className="text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-white/72">{item.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {howItWorksSteps.map(({ title, description, Icon }, index) => (
                <Reveal key={title} className="h-full" delayMs={index * 80}>
                  <article className="how-gradient-sweep h-full rounded-2xl border border-white/12 p-5">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white">
                      <Icon />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm text-white/70">{description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.02]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built for group movie nights</h2>
              <ul className="mt-6 space-y-3">
                {featureBullets.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-white/80">
                    <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[rgb(var(--yellow))]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delayMs={120}>
              <LandingTitleCarouselCard stacked />
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="cta-gradient-sweep rounded-3xl border border-white/15 p-8 text-center shadow-[0_20px_45px_rgba(0,0,0,0.35)] sm:p-12">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to stop scrolling?</h2>
              <div className="mt-6">
                <Link href="/create" className={primaryCtaClass}>
                  Create a group
                </Link>
              </div>
              <p className="mt-4 text-sm text-white/65">Free to start.</p>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black/25">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/70">
            <Link href="/about" className="transition hover:text-white">
              About
            </Link>
            <Link href="/privacy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-white">
              Terms
            </Link>
            <a href="mailto:hello@chooseamovie.app" className="transition hover:text-white">
              Contact
            </a>
            <Link href="/donate" className="text-xs text-white/60 transition hover:text-white">
              Donate
            </Link>
          </div>
          <p className="text-xs text-white/55">Movie data from TMDB.</p>
        </div>
      </footer>
    </div>
  );
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M16 11a3 3 0 1 0-2.82-4H9a3 3 0 1 0 0 2h4.18A3 3 0 0 0 16 11Zm-8 6a3 3 0 1 0-2.82-4H3v2h2.18A3 3 0 0 0 8 17Zm8 4a3 3 0 1 0-2.82-4H11v2h2.18A3 3 0 0 0 16 21Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 6h16v2l-6 6v4l-4 2v-6L4 8V6Z" fill="currentColor" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="m12 3 2.7 5.46 6.03.88-4.36 4.24 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.34l6.03-.88L12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}
