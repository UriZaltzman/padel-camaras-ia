'use client';

import type { ApiClient, Schema } from '@app/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import { useEffect, useState, type ReactNode } from 'react';

import { t, type MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  monthlyPrice,
  pesosToCents,
  saveDraft,
  STEPS,
  toRequest,
  validateStep,
  type CourtDraft,
  type ErrorKey,
  type OnboardingDraft,
  type Step,
} from '@/lib/onboarding/model';
import { formatCents } from '@/lib/player/format';

const box =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
const btn = 'min-h-11 rounded-xl px-4 font-semibold';
const primary = `${btn} bg-court text-white disabled:opacity-60`;
const secondary = `${btn} border border-line bg-white text-night`;

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  );

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 font-semibold">
      {label}
      {children}
      {error && (
        <span role="alert" className="border-l-4 border-alert pl-2 text-sm">
          {error}
        </span>
      )}
    </label>
  );
}

/** SA-04: on-site onboarding in five steps; the draft is kept in the browser at every step. */
export function OnboardingWizard({ client = apiClient }: { client?: ApiClient }) {
  const [step, setStep] = useState<Step>('club');
  const [draft, setDraft] = useState<OnboardingDraft>(() => emptyDraft(today()));
  const [errors, setErrors] = useState<ErrorKey[]>([]);
  const [resumed, setResumed] = useState(false);
  const [ready, setReady] = useState(false);
  const [created, setCreated] = useState<Schema<'AdminClubDetail'> | null>(null);

  // Read the draft after mount so server and client render the same first markup.
  useEffect(() => {
    const saved = loadDraft(window.localStorage);
    if (saved) {
      setDraft(saved.draft);
      setStep(saved.step);
      setResumed(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready && !created) saveDraft(window.localStorage, { step, draft });
  }, [ready, created, step, draft]);

  const tariffs = useQuery({
    queryKey: ['admin', 'tariffs'],
    queryFn: async () => {
      const { data, error } = await client.GET('/admin/tariffs', { params: { query: {} } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data.items;
    },
  });
  const version = tariffs.data?.find((v) => v.id === draft.tariffVersionId);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await client.POST('/admin/clubs', { body: toRequest(draft) });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: (club) => {
      clearDraft(window.localStorage);
      setCreated(club);
      setStep('delivery');
    },
  });

  const patch = (changes: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...changes }));
  const patchModules = (changes: Partial<OnboardingDraft['modules']>) =>
    setDraft((d) => ({ ...d, modules: { ...d.modules, ...changes } }));
  const err = (key: ErrorKey) =>
    errors.includes(key) ? t(`admin.onb.err.${key}` as MessageKey) : undefined;

  const index = STEPS.indexOf(step);
  function next() {
    const problems = validateStep(step, draft);
    setErrors(problems);
    if (problems.length > 0) return;
    if (step === 'setup') create.mutate();
    else setStep(STEPS[index + 1] ?? step);
  }

  const price = monthlyPrice(version, draft);
  const dep = draft.modules.deposit;
  const brand = draft.modules.branding;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t('admin.onb.title')}</h1>
      <ol aria-label={t('admin.onb.steps')} className="flex flex-wrap gap-2 print:hidden">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === step ? 'step' : undefined}
            className={`rounded-xl border px-3 py-1 font-semibold ${
              s === step ? 'border-court bg-court text-white' : 'border-line bg-white text-night'
            }`}
          >
            {i + 1}. {t(`admin.onb.step.${s}` as MessageKey)}
          </li>
        ))}
      </ol>
      {resumed && !created && (
        <p role="status" className="flex flex-wrap items-center gap-3 print:hidden">
          {t('admin.onb.resumed')}
          <button
            type="button"
            className={secondary}
            onClick={() => {
              clearDraft(window.localStorage);
              setDraft(emptyDraft(today()));
              setStep('club');
              setResumed(false);
            }}
          >
            {t('admin.onb.discard')}
          </button>
        </p>
      )}

      {step === 'club' && (
        <section className="flex flex-col gap-3">
          <Field label={t('admin.onb.f.name')} error={err('name')}>
            <input
              className={box}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.legalName')} error={err('legalName')}>
            <input
              className={box}
              value={draft.legalName}
              onChange={(e) => patch({ legalName: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.taxId')} error={err('taxId')}>
            <input
              className={box}
              inputMode="numeric"
              value={draft.taxId}
              onChange={(e) => patch({ taxId: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label={t('admin.onb.f.address')} error={err('address')}>
            <input
              className={box}
              value={draft.address}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.city')} error={err('city')}>
            <input
              className={box}
              value={draft.city}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.ownerName')} error={err('ownerName')}>
            <input
              className={box}
              value={draft.ownerName}
              onChange={(e) => patch({ ownerName: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.ownerPhone')} error={err('ownerPhone')}>
            <input
              className={box}
              type="tel"
              value={draft.ownerPhone}
              onChange={(e) => patch({ ownerPhone: e.target.value.replace(/[\s-]/g, '') })}
            />
          </Field>
          <Field label={t('admin.onb.f.ownerEmail')} error={err('ownerEmail')}>
            <input
              className={box}
              type="email"
              value={draft.ownerEmail}
              onChange={(e) => patch({ ownerEmail: e.target.value })}
            />
          </Field>
        </section>
      )}

      {step === 'plan' && (
        <section className="flex flex-col gap-3">
          <Field label={t('admin.onb.f.plan')}>
            <select
              className={box}
              value={draft.plan}
              onChange={(e) => patch({ plan: e.target.value as OnboardingDraft['plan'] })}
            >
              <option value="loan">{t('admin.plan.loan')}</option>
              <option value="purchase">{t('admin.plan.purchase')}</option>
            </select>
          </Field>
          <Field label={t('admin.onb.f.tariff')} error={err('tariff')}>
            <select
              className={box}
              value={draft.tariffVersionId}
              onChange={(e) => patch({ tariffVersionId: e.target.value })}
            >
              <option value="" />
              {tariffs.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.onb.f.players')}>
            <input
              className={box}
              type="number"
              min={0}
              value={draft.expectedPlayers}
              onChange={(e) =>
                patch({ expectedPlayers: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })
              }
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={dep.enabled}
              onChange={(e) => patchModules({ deposit: { ...dep, enabled: e.target.checked } })}
            />
            {t('admin.onb.f.depositOn')}
          </label>
          {dep.enabled && (
            <>
              <Field label={t('admin.onb.f.depositKind')}>
                <select
                  className={box}
                  value={dep.kind}
                  onChange={(e) =>
                    patchModules({ deposit: { ...dep, kind: e.target.value as typeof dep.kind } })
                  }
                >
                  <option value="percent">{t('admin.onb.f.percent')}</option>
                  <option value="fixed">{t('admin.onb.f.fixed')}</option>
                </select>
              </Field>
              {dep.kind === 'percent' ? (
                <Field label={t('admin.onb.f.depositPercent')} error={err('deposit')}>
                  <input
                    className={box}
                    type="number"
                    min={1}
                    max={100}
                    value={dep.percent ?? ''}
                    onChange={(e) =>
                      patchModules({
                        deposit: {
                          ...dep,
                          percent: e.target.value ? Number(e.target.value) : null,
                          amount_cents: null,
                        },
                      })
                    }
                  />
                </Field>
              ) : (
                <Field label={t('admin.onb.f.depositAmount')} error={err('deposit')}>
                  <input
                    className={box}
                    inputMode="decimal"
                    value={dep.amount_cents === null ? '' : String(dep.amount_cents / 100)}
                    onChange={(e) =>
                      patchModules({
                        deposit: {
                          ...dep,
                          amount_cents: e.target.value ? pesosToCents(e.target.value) : null,
                          percent: null,
                        },
                      })
                    }
                  />
                </Field>
              )}
            </>
          )}
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={brand.mode === 'own'}
              onChange={(e) =>
                patchModules({ branding: { ...brand, mode: e.target.checked ? 'own' : 'generic' } })
              }
            />
            {t('admin.onb.f.brandOwn')}
          </label>
          <Field label={t('admin.onb.f.lessons')}>
            <select
              className={box}
              value={draft.modules.lesson_mode}
              onChange={(e) => patchModules({ lesson_mode: e.target.value as 'app' | 'whatsapp' })}
            >
              <option value="app">{t('admin.onb.f.lessonsApp')}</option>
              <option value="whatsapp">{t('admin.onb.f.lessonsWhatsapp')}</option>
            </select>
          </Field>
          <Field label={t('admin.onb.f.aiVideo')}>
            <select
              className={box}
              value={draft.modules.ai_video}
              onChange={(e) => patchModules({ ai_video: e.target.value as Schema<'AiVideoPayer'> })}
            >
              <option value="off">{t('admin.onb.f.aiOff')}</option>
              <option value="club_pays">{t('admin.onb.f.aiClub')}</option>
              <option value="player_pays">{t('admin.onb.f.aiPlayer')}</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={draft.modules.tournaments}
              onChange={(e) => patchModules({ tournaments: e.target.checked })}
            />
            {t('admin.onb.f.tournaments')}
          </label>
          <p data-testid="monthly-price" className="rounded-xl border border-line bg-white p-3">
            <strong>{t('admin.onb.price')}: </strong>
            {price ? (
              <>
                {formatCents(price.total_cents)}
                <br />
                {t('admin.onb.priceLine', {
                  tier: price.tier.name,
                  sub: formatCents(price.subscription_cents),
                  modules: formatCents(price.modules_cents),
                })}
              </>
            ) : (
              t('admin.onb.priceNone')
            )}
          </p>
        </section>
      )}

      {step === 'payment' && (
        <section className="flex flex-col gap-3">
          <p role="note" className="border-l-4 border-court pl-2">
            {t('admin.onb.registered')} {t('admin.onb.noCard')}
          </p>
          <Field label={t('admin.onb.f.amount')} error={err('amount')}>
            <input
              className={box}
              inputMode="decimal"
              value={draft.paymentAmount}
              onChange={(e) => patch({ paymentAmount: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.method')}>
            <select
              className={box}
              value={draft.paymentMethod}
              onChange={(e) =>
                patch({ paymentMethod: e.target.value as OnboardingDraft['paymentMethod'] })
              }
            >
              {(['transfer', 'cash', 'check', 'card_in_person'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`admin.onb.method.${m}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.onb.f.paidOn')} error={err('paidOn')}>
            <input
              className={box}
              type="date"
              value={draft.paidOn}
              onChange={(e) => patch({ paidOn: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.reference')}>
            <input
              className={box}
              maxLength={120}
              value={draft.paymentReference}
              onChange={(e) => patch({ paymentReference: e.target.value })}
            />
          </Field>
          <Field label={t('admin.onb.f.photo')}>
            <input
              className={box}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => patch({ receiptPhotoName: e.target.files?.[0]?.name ?? '' })}
            />
          </Field>
          <p className="text-sm">{t('admin.onb.photoNote')}</p>
        </section>
      )}

      {step === 'setup' && (
        <section className="flex flex-col gap-3">
          {errors.includes('courts') && (
            <p role="alert" className="border-l-4 border-alert pl-2">
              {t('admin.onb.err.courts')}
            </p>
          )}
          {draft.courts.map((c, i) => {
            const set = (changes: Partial<CourtDraft>) =>
              patch({ courts: draft.courts.map((x, j) => (j === i ? { ...x, ...changes } : x)) });
            return (
              <fieldset key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                <Field label={`${t('admin.onb.f.courtName')} ${i + 1}`}>
                  <input
                    className={box}
                    value={c.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </Field>
                <Field label={`${t('admin.onb.f.courtKind')} ${i + 1}`}>
                  <select
                    className={box}
                    value={c.kind}
                    onChange={(e) => set({ kind: e.target.value as CourtDraft['kind'] })}
                  >
                    <option value="panoramic">{t('admin.onb.f.panoramic')}</option>
                    <option value="standard">{t('admin.onb.f.standard')}</option>
                  </select>
                </Field>
                <label className="flex min-h-11 items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={c.covered}
                    onChange={(e) => set({ covered: e.target.checked })}
                  />
                  {t('admin.onb.f.covered')} {i + 1}
                </label>
                <Field label={`${t('admin.onb.f.courtPrice')} ${i + 1}`}>
                  <input
                    className={box}
                    inputMode="decimal"
                    value={c.price}
                    onChange={(e) => set({ price: e.target.value })}
                  />
                </Field>
                {draft.courts.length > 1 && (
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => patch({ courts: draft.courts.filter((_, j) => j !== i) })}
                  >
                    {t('admin.onb.removeCourt')} {i + 1}
                  </button>
                )}
              </fieldset>
            );
          })}
          <button
            type="button"
            className={secondary}
            onClick={() =>
              patch({
                courts: [
                  ...draft.courts,
                  {
                    name: `Cancha ${draft.courts.length + 1}`,
                    kind: 'panoramic',
                    covered: false,
                    price: '',
                  },
                ],
              })
            }
          >
            {t('admin.onb.addCourt')}
          </button>
          {brand.mode === 'own' && (
            <>
              <Field label={t('admin.onb.f.primary')} error={err('colors')}>
                <input
                  className={box}
                  value={brand.primary_color ?? ''}
                  onChange={(e) =>
                    patchModules({ branding: { ...brand, primary_color: e.target.value } })
                  }
                />
              </Field>
              <Field label={t('admin.onb.f.secondary')}>
                <input
                  className={box}
                  value={brand.secondary_color ?? ''}
                  onChange={(e) =>
                    patchModules({ branding: { ...brand, secondary_color: e.target.value } })
                  }
                />
              </Field>
            </>
          )}
        </section>
      )}

      {step === 'delivery' && created && <Delivery club={created} draft={draft} />}

      {create.isError && (
        <p role="alert" className="border-l-4 border-alert pl-2 font-semibold">
          {create.error.message === 'CLUB_TAX_ID_TAKEN'
            ? t('admin.onb.err.CLUB_TAX_ID_TAKEN')
            : t('admin.onb.error')}
        </p>
      )}
      {errors.length > 0 && (
        <p role="alert" className="font-semibold">
          {t('admin.onb.fix')}
        </p>
      )}
      {step !== 'delivery' && (
        <div className="flex gap-3 print:hidden">
          {index > 0 && (
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setErrors([]);
                setStep(STEPS[index - 1] ?? step);
              }}
            >
              {t('admin.onb.back')}
            </button>
          )}
          <button type="button" className={primary} disabled={create.isPending} onClick={next}>
            {step === 'setup'
              ? create.isPending
                ? t('admin.onb.creating')
                : t('admin.onb.create')
              : t('admin.onb.next')}
          </button>
        </div>
      )}
    </main>
  );
}

function Delivery({ club, draft }: { club: Schema<'AdminClubDetail'>; draft: OnboardingDraft }) {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin ? new URL(club.whitelabel_url, origin).toString() : club.whitelabel_url;
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  const method = t(`admin.onb.method.${draft.paymentMethod}` as MessageKey);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold print:hidden">{t('admin.onb.done')}</h2>
      <div className="flex flex-col gap-2 print:hidden">
        <p className="font-semibold">{t('admin.onb.link')}</p>
        <a href={link} className="break-all underline" data-testid="club-link">
          {link}
        </a>
        <div
          role="img"
          aria-label={t('admin.onb.qr')}
          className="w-48 bg-white p-2"
          dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, scalable: true }) }}
        />
        <p>
          {t('admin.onb.invited', {
            owner: draft.ownerName,
            email: draft.ownerEmail ? t('admin.onb.invitedEmail') : '',
          })}
        </p>
      </div>
      <article
        aria-label={t('admin.onb.receipt')}
        className="rounded-xl border border-line bg-white p-4"
      >
        <h3 className="font-bold">{t('admin.onb.receipt')}</h3>
        <p>
          {t('admin.onb.receiptLine', {
            club: club.name,
            amount: formatCents(pesosToCents(draft.paymentAmount)),
            method,
            date: draft.paidOn,
          })}
        </p>
        {draft.paymentReference && <p>{draft.paymentReference}</p>}
        <p className="text-sm">{t('admin.onb.receiptPending')}</p>
      </article>
      <div className="flex gap-3 print:hidden">
        <button type="button" className={primary} onClick={() => window.print()}>
          {t('admin.onb.receiptPrint')}
        </button>
        <button type="button" className={secondary} onClick={() => window.location.assign(\'/admin/clubes/nuevo\')}>
          {t('admin.onb.another')}
        </button>
      </div>
    </section>
  );
}
