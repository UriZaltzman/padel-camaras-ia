import { LogoSymbol, Wordmark } from '@/components/logo';
import { t } from '@/i18n';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <section className="bg-night px-6 py-16 text-white sm:px-12 sm:py-24">
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
        </div>
      </section>
      <section className="px-6 py-12 sm:px-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row">
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
      </section>
    </main>
  );
}
