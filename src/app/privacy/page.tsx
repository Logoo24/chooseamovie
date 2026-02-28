import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";

const sections = [
  {
    title: "Information We Collect",
    body: [
      "When you use ChooseAMovie, we may collect information you provide directly, including your name, email address, phone number, account profile details, group names, invite activity, custom lists, ratings, and other content you submit while using the service.",
      "We also collect limited technical information needed to operate the service, such as device and browser information, log data, approximate location derived from IP address, and basic analytics about how the app is used.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "We use information to provide and improve ChooseAMovie, including creating and securing accounts, letting users create and join groups, saving ratings and results, preventing abuse, troubleshooting issues, responding to support requests, and maintaining the safety and reliability of the service.",
      "We may also use aggregated or de-identified information to understand product usage and improve app features. We do not use personal information for interest-based advertising within the app.",
    ],
  },
  {
    title: "Google Sign-In Data",
    body: [
      "If you choose to sign in with Google, ChooseAMovie receives basic profile information made available by Google for authentication, such as your name, email address, profile image, and Google account identifier.",
      "We use Google account information only to authenticate you, create or maintain your account, personalize your profile, and support core app functionality. We do not sell Google user data, and we do not use Google user data for advertising purposes.",
      "ChooseAMovie does not request access to Google Drive, Gmail, Contacts, Calendar, or other restricted Google API scopes. If that changes in the future, this policy will be updated before the new access is used.",
    ],
  },
  {
    title: "How Information Is Shared",
    body: [
      "We share information only when necessary to operate the service, comply with law, protect rights and safety, or complete a business transfer such as a merger, acquisition, or asset sale.",
      "Service providers that support hosting, authentication, analytics, and infrastructure may process information on our behalf under contractual or technical controls. Group information is also visible to other members of the groups you create or join, as needed for the product to function.",
    ],
  },
  {
    title: "Data Storage and Retention",
    body: [
      "ChooseAMovie stores account, group, and rating data for as long as needed to provide the service, comply with legal obligations, resolve disputes, and enforce agreements. Retention periods may vary depending on the type of data and whether an account or group remains active.",
      "When you delete your account or ask us to delete your information, we will remove or anonymize data when reasonably possible, subject to legal, security, backup, fraud-prevention, or operational retention needs.",
    ],
  },
  {
    title: "Your Choices and Controls",
    body: [
      "You may access and update certain account details through the app. You may also sign out, delete your account, or contact us to request help with account-related privacy questions.",
      "If you signed in with Google, you can also manage or revoke ChooseAMovie's access through your Google account settings. Revoking Google access may prevent future sign-in until you reconnect your account or use another supported sign-in method.",
    ],
  },
  {
    title: "Security",
    body: [
      "We use reasonable administrative, technical, and organizational safeguards designed to protect personal information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    title: "Children's Privacy",
    body: [
      "ChooseAMovie is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information to us, contact us so we can investigate and take appropriate action.",
    ],
  },
  {
    title: "International Data Processing",
    body: [
      "Your information may be processed and stored in countries other than where you live. By using the service, you understand that information may be transferred to and processed in locations where privacy laws may differ from those in your jurisdiction.",
    ],
  },
  {
    title: "Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. If we make material changes, we will update the effective date on this page and, where appropriate, provide additional notice within the app or by email.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about this Privacy Policy or our privacy practices, contact us at hello@chooseamovie.app.",
    ],
  },
];

export default function PrivacyPage() {
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
                Privacy Policy
              </h1>
              <p className="mt-3 text-sm text-white/60">Effective date: February 28, 2026</p>
              <p className="mt-4 text-base leading-7 text-white/76">
                This Privacy Policy explains how ChooseAMovie collects, uses, stores, and shares
                information when you use our website, apps, and related services.
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
