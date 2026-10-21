'use client';

import type { ApiClient } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { t } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import {
  LOGO_POSITIONS,
  LOGO_TYPES,
  MAX_SPONSORS,
  STREAM_PRIVACY,
  logoError,
  newBrandForm,
  newSponsor,
  validateBrandForm,
  type BrandForm,
  type LogoFile,
  type LogoPosition,
  type SponsorForm,
  type StreamPrivacy,
} from '@/lib/club-brand/form';

const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';
const checkClass = 'flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-3';

interface Props {
  clubId: string;
  client?: ApiClient;
}

const toLogo = (file: File | undefined): LogoFile | null =>
  file ? { name: file.name, type: file.type, size: file.size } : null;

function LogoInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LogoFile | null;
  onChange: (logo: LogoFile | null) => void;
}) {
  const id = useId();
  const error = value ? logoError(value) : null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={LOGO_TYPES.join(',')}
        className={inputClass}
        onChange={(e) => onChange(toLogo(e.target.files?.[0]))}
      />
      <p className="text-sm text-ink2">{t('brand.logo.hint')}</p>
      {value && !error && <p className="text-sm">{t('brand.logo.chosen', { name: value.name })}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}

export function BrandSettingsPanel({ clubId, client = apiClient }: Props) {
  const query = useQuery({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const { data, error } = await client.GET('/clubs/{id}', { params: { path: { id: clubId } } });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const [form, setForm] = useState<BrandForm>(newBrandForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const ids = { position: useId(), channel: useId(), title: useId(), privacy: useId() };

  const update = (next: BrandForm) => {
    setForm(next);
    setSaved(false);
  };
  const updateSponsor = (i: number, patch: Partial<SponsorForm>) =>
    update({
      ...form,
      sponsors: form.sponsors.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });
  const streaming = form.streaming;
  const setStreaming = (patch: Partial<BrandForm['streaming']>) =>
    update({ ...form, streaming: { ...streaming, ...patch } });

  const save = () => {
    const found = validateBrandForm(form);
    setErrors(found);
    // TODO(web-paneles): send to the API once the brand/streaming contract exists.
    setSaved(found.length === 0);
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        {query.data && <DataLabel label={query.data.name} />}
        <h1 className="font-display text-3xl font-bold">{t('brand.title')}</h1>
        <p className="text-ink2">{t('brand.lead')}</p>
      </header>

      <Card>
        <section aria-labelledby="brand-logo" className="flex flex-col gap-3">
          <h2 id="brand-logo" className="text-xl font-bold">
            {t('brand.logo.heading')}
          </h2>
          <LogoInput
            label={t('brand.logo.label')}
            value={form.logo}
            onChange={(logo) => update({ ...form, logo })}
          />
          <label htmlFor={ids.position} className="font-semibold">
            {t('brand.logo.position')}
          </label>
          <select
            id={ids.position}
            className={inputClass}
            value={form.logoPosition}
            onChange={(e) => update({ ...form, logoPosition: e.target.value as LogoPosition })}
          >
            {LOGO_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`brand.position.${p}`)}
              </option>
            ))}
          </select>
        </section>
      </Card>

      <Card>
        <section aria-labelledby="brand-sponsors" className="flex flex-col gap-3">
          <h2 id="brand-sponsors" className="text-xl font-bold">
            {t('brand.sponsors.heading')}
          </h2>
          {form.sponsors.length === 0 && <p>{t('brand.sponsors.empty')}</p>}
          {form.sponsors.map((sponsor, i) => (
            <fieldset key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <legend className="font-semibold">{t('brand.sponsors.item', { n: i + 1 })}</legend>
              <label className="flex flex-col gap-1">
                {t('brand.sponsors.name')}
                <input
                  className={inputClass}
                  value={sponsor.name}
                  onChange={(e) => updateSponsor(i, { name: e.target.value })}
                />
              </label>
              <LogoInput
                label={t('brand.sponsors.logo')}
                value={sponsor.logo}
                onChange={(logo) => updateSponsor(i, { logo })}
              />
              <label className={checkClass}>
                <input
                  type="checkbox"
                  checked={sponsor.inVideos}
                  onChange={(e) => updateSponsor(i, { inVideos: e.target.checked })}
                />
                {t('brand.sponsors.inVideos')}
              </label>
              <label className={checkClass}>
                <input
                  type="checkbox"
                  checked={sponsor.inReels}
                  onChange={(e) => updateSponsor(i, { inReels: e.target.checked })}
                />
                {t('brand.sponsors.inReels')}
              </label>
              <Button
                variant="secondary"
                label={t('brand.sponsors.remove', { n: i + 1 })}
                onClick={() =>
                  update({ ...form, sponsors: form.sponsors.filter((_, j) => j !== i) })
                }
              />
            </fieldset>
          ))}
          <Button
            variant="secondary"
            label={t('brand.sponsors.add')}
            disabled={form.sponsors.length >= MAX_SPONSORS}
            onClick={() => update({ ...form, sponsors: [...form.sponsors, newSponsor()] })}
          />
        </section>
      </Card>

      <Card>
        <section aria-labelledby="brand-streaming" className="flex flex-col gap-3">
          <h2 id="brand-streaming" className="text-xl font-bold">
            {t('brand.streaming.heading')}
          </h2>
          <p role="note" className="text-sm text-ink2">
            {t('brand.streaming.testMode')}
          </p>
          <label className={checkClass}>
            <input
              type="checkbox"
              checked={streaming.enabled}
              onChange={(e) => setStreaming({ enabled: e.target.checked })}
            />
            {t('brand.streaming.enabled')}
          </label>
          {streaming.enabled && (
            <>
              <label htmlFor={ids.channel} className="font-semibold">
                {t('brand.streaming.channelId')}
              </label>
              <input
                id={ids.channel}
                className={inputClass}
                value={streaming.channelId}
                onChange={(e) => setStreaming({ channelId: e.target.value })}
              />
              <label htmlFor={ids.title} className="font-semibold">
                {t('brand.streaming.title')}
              </label>
              <input
                id={ids.title}
                className={inputClass}
                value={streaming.title}
                onChange={(e) => setStreaming({ title: e.target.value })}
              />
              <label htmlFor={ids.privacy} className="font-semibold">
                {t('brand.streaming.privacy')}
              </label>
              <select
                id={ids.privacy}
                className={inputClass}
                value={streaming.privacy}
                onChange={(e) => setStreaming({ privacy: e.target.value as StreamPrivacy })}
              >
                {STREAM_PRIVACY.map((p) => (
                  <option key={p} value={p}>
                    {t(`brand.privacy.${p}`)}
                  </option>
                ))}
              </select>
              <fieldset className="flex flex-col gap-2">
                <legend className="font-semibold">{t('brand.streaming.courts')}</legend>
                {query.data?.courts.map((court) => (
                  <label key={court.id} className={checkClass}>
                    <input
                      type="checkbox"
                      checked={streaming.courtIds.includes(court.id)}
                      onChange={(e) =>
                        setStreaming({
                          courtIds: e.target.checked
                            ? [...streaming.courtIds, court.id]
                            : streaming.courtIds.filter((id) => id !== court.id),
                        })
                      }
                    />
                    {court.name}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </section>
      </Card>

      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1">
          {errors.map((e) => (
            <p key={e} className={errorClass}>
              {e}
            </p>
          ))}
        </div>
      )}
      {saved && <p role="status">{t('brand.saved')}</p>}
      <Button label={t('brand.save')} onClick={save} />
    </main>
  );
}
