import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";

const sections = [
  {
    title: "Acceptance of Terms",
    body: [
      "By accessing or using ChooseAMovie, you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "Eligibility and Accounts",
    body: [
      "You must provide accurate information when creating an account and keep your login credentials secure. You are responsible for activity that occurs under your account.",
      "You may use guest access where available, but some features require a registered account. We may suspend or terminate access if account information is inaccurate, misleading, or used in violation of these Terms.",
    ],
  },
  {
    title: "Use of the Service",
    body: [
      "ChooseAMovie lets users create groups, invite participants, rate titles, and view group results. You agree to use the service only for lawful purposes and in a way that does not interfere with the operation, security, or availability of the platform.",
    ],
  },
  {
    title: "Prohibited Conduct",
    body: [
      "You may not misuse the service, including by attempting unauthorized access, scraping or extracting data at scale, reverse engineering protected systems, interfering with infrastructure, uploading malicious code, impersonating another person, or using the service to harass, defraud, or violate the rights of others.",
    ],
  },
  {
    title: "User Content and Group Data",
    body: [
      "You retain responsibility for information you submit to ChooseAMovie, including account details, group names, custom title lists, and ratings. You represent that you have the rights needed to submit that content.",
      "By submitting content through the service, you grant ChooseAMovie a limited, non-exclusive license to host, store, reproduce, and display that content solely as needed to operate, improve, and secure the service.",
    ],
  },
  {
    title: "Third-Party Services and Data",
    body: [
      "ChooseAMovie may rely on third-party services, including hosting, authentication, analytics, and movie or TV metadata providers. Those third-party services may have their own terms and privacy policies.",
      "Movie and television information may be provided by third-party databases such as TMDB. We do not guarantee the completeness, accuracy, or availability of third-party data.",
    ],
  },
  {
    title: "Intellectual Property",
    body: [
      "ChooseAMovie, including its software, branding, design, and original content, is protected by applicable intellectual property laws. Except as expressly allowed by these Terms, you may not copy, distribute, modify, or create derivative works from the service without permission.",
    ],
  },
  {
    title: "Termination",
    body: [
      "You may stop using the service at any time. We may suspend or terminate your access if we reasonably believe you violated these Terms, created risk for other users, or exposed the service to legal or security harm.",
      "Sections that by their nature should survive termination, including intellectual property, disclaimers, limitations of liability, and dispute-related terms, will remain in effect after termination.",
    ],
  },
  {
    title: "Disclaimers",
    body: [
      "ChooseAMovie is provided on an \"as is\" and \"as available\" basis. To the fullest extent permitted by law, we disclaim warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, non-infringement, availability, and accuracy.",
    ],
  },
  {
    title: "Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, ChooseAMovie and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenues, goodwill, data, or business opportunities arising out of or related to your use of the service.",
      "Where liability cannot be excluded, our total liability will be limited to the amount you paid, if any, to use ChooseAMovie during the twelve months before the event giving rise to the claim.",
    ],
  },
  {
    title: "Changes to the Service or Terms",
    body: [
      "We may change, suspend, or discontinue any part of the service at any time. We may also update these Terms from time to time. When we do, we will update the effective date on this page. Continued use of the service after updated Terms take effect means you accept the revised Terms.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about these Terms, contact us at hello@chooseamovie.app.",
    ],
  },
];

export default function TermsPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-5 py-4 sm:py-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-md px-1 py-1 text-sm text-white/72 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35"
        >
          Home
        </Link>
        <Card>
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Terms of Service
              </h1>
              <p className="mt-3 text-sm text-white/60">Effective date: February 28, 2026</p>
              <p className="mt-4 text-base leading-7 text-white/76">
                These Terms of Service govern your access to and use of ChooseAMovie and related
                services.
              </p>
            </div>

            <div className="space-y-6">
              {sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <h2 className="text-xl font-semibold tracking-tight text-white">
                    {section.title}
                  </h2>
                  <div className="space-y-3 text-base leading-7 text-white/76">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
