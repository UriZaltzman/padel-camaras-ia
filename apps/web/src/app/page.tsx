import { ContactForm } from '@/components/contact-form';
import { LogoSymbol, Wordmark } from '@/components/logo';
import { t, type MessageKey } from '@/i18n';

import { sendContact } from './actions';

const features = ['cameras', 'stats', 'bookings', 'app'] as const;

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <section className="bg-night px-4 py-16 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-white sm:px-12 sm:py-24">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <div className="flex items-center gap-3">
            <LogoSymbol className="size-10" />
            <Wordmark />
          </div>
          <p className="font-mono text-xs font-medium tracking-label text-ball uppercase">
            {t('home.eyebrow')}
          </p>
          <h1 className="font-display text-5xl leading-none font-black tracking-display sm:text-7xl">
            <span className="block">{t('home.titleLine1')}</span>
            <span className="block text-ball">{t('home.titleLine2')}</span>
          </h1>
          <p className="max-w-2xl text-lg text-line">{t('home.lead')}</p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href="#clubes"
              className="rounded-xl bg-court px-6 py-3 text-center font-semibold text-white hover:bg-courtDark"
            >
              {t('home.ctaClubs')}
            </a>
            <a
              href="#partido"
              className="rounded-xl border border-line bg-white px-6 py-3 text-center font-semibold text-night hover:border-court"
            >
              {t('home.ctaMatch')}
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="features-title" className="px-4 py-16 sm:px-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <h2 id="features-title" className="font-display text-3xl font-black tracking-display">
            {t('features.title')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {features.map((key) => (
              <li key={key} className="rounded-2xl border border-line bg-white p-6">
                <h3 className="font-display text-xl font-black">
                  {t(`features.${key}.title` as MessageKey)}
                </h3>
                <p className="mt-2">{t(`features.${key}.body` as MessageKey)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="clubes"
        aria-labelledby="contact-title"
        className="px-4 pb-[max(5rem,env(safe-area-inset-bottom))] sm:px-12"
      >
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <h2 id="contact-title" className="font-display text-3xl font-black tracking-display">
            {t('contact.title')}
          </h2>
          <p>{t('contact.lead')}</p>
          <ContactForm action={sendContact} />
        </div>
      </section>
    </main>
  );
}
