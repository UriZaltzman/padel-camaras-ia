'use client';

import type { ApiClient } from '@app/contracts';
import { Button, Card, DataLabel } from '@app/ui/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { t } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { apiClient } from '@/lib/api/client';
import { CASH_METHODS, incomeFor, parsePesosToCents } from '@/lib/club-cash/model';
import type { CashRegister as Register } from '@/lib/club-cash/model';
import { addDays } from '@/lib/club-calendar/model';
import { formatCents, formatTime, todayLocal } from '@/lib/player/format';

const inputClass =
  'min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-night focus:border-court focus:outline-2 focus:outline-court';
const errorClass = 'border-l-4 border-alert pl-2 text-sm font-semibold text-night';

interface Props {
  clubId: string;
  client?: ApiClient;
  /** Today's date `YYYY-MM-DD`; tests pin it. */
  today?: string;
}

export function CashRegister({ clubId, client = apiClient, today = todayLocal() }: Props) {
  const [date, setDate] = useState(today);
  const queryClient = useQueryClient();
  const key = ['club-cash', clubId, date];

  const register = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await client.GET('/club-admin/cash-register', {
        params: { query: { club_id: clubId, date } },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
  });
  const apply = (data: Register) => queryClient.setQueryData(key, data);

  const addExpense = useMutation({
    mutationFn: async (body: { amount_cents: number; description: string }) => {
      const { data, error } = await client.POST('/club-admin/cash-register/expenses', {
        params: { query: { club_id: clubId } },
        body: { date, ...body },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: apply,
  });
  const close = useMutation({
    mutationFn: async (counted_cash_cents: number) => {
      const { data, error } = await client.POST('/club-admin/cash-register/close', {
        params: { query: { club_id: clubId } },
        body: { date, counted_cash_cents },
      });
      if (error || !data) throw new Error(error?.code ?? 'UNKNOWN');
      return data;
    },
    onSuccess: apply,
  });

  const data = register.data;
  const closed = data?.status === 'closed';

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <DataLabel label={t(closed ? 'cash.status.closed' : 'cash.status.open')} />
        <h1 className="font-display text-3xl font-bold">{t('cash.title')}</h1>
        <p className="text-ink2">{t('cash.lead')}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Button label={t('cash.prev')} onClick={() => setDate(addDays(date, -1))} />
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('cash.date')}
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <Button label={t('cash.next')} onClick={() => setDate(addDays(date, 1))} />
        <Button label={t('cash.today')} onClick={() => setDate(today)} />
      </div>

      {register.isPending && <p role="status">{t('cash.loading')}</p>}
      {register.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className={errorClass}>{t('cash.loadFailed')}</p>
          <Button label={t('cash.retry')} onClick={() => void register.refetch()} />
        </div>
      )}
      {data && (
        <>
          <Movements register={data} />
          <Totals register={data} />
          {!closed && (
            <ExpenseForm
              pending={addExpense.isPending}
              failed={addExpense.isError}
              onSubmit={(body) => addExpense.mutate(body)}
            />
          )}
          {closed ? (
            <Closing register={data} />
          ) : (
            <CloseForm
              expected={data.expected_cash_cents}
              pending={close.isPending}
              failed={close.isError}
              onSubmit={(cents) => close.mutate(cents)}
            />
          )}
        </>
      )}
    </main>
  );
}

function Movements({ register }: { register: Register }) {
  if (register.movements.length === 0) {
    return (
      <Card>
        <p role="status">{t('cash.empty')}</p>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-left">
        <caption className="sr-only">{t('cash.movements')}</caption>
        <thead>
          <tr className="border-b border-line text-sm text-ink3">
            <th scope="col" className="p-3">
              {t('cash.col.time')}
            </th>
            <th scope="col" className="p-3">
              {t('cash.col.description')}
            </th>
            <th scope="col" className="p-3">
              {t('cash.col.method')}
            </th>
            <th scope="col" className="p-3 text-right">
              {t('cash.col.amount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {register.movements.map((m) => (
            <tr key={m.id} className="border-b border-line last:border-0">
              <td className="p-3">{formatTime(m.occurred_at)}</td>
              <td className="p-3">
                {m.description}
                {m.kind === 'expense' && (
                  <span className="ml-2 text-sm font-semibold">({t('cash.expense')})</span>
                )}
              </td>
              <td className="p-3">{t(`cash.method.${m.method}` as MessageKey)}</td>
              <td className="p-3 text-right font-semibold">
                {m.kind === 'expense' ? '−' : ''}
                {formatCents(m.amount_cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totals({ register }: { register: Register }) {
  const rows: [string, string][] = [
    ...CASH_METHODS.map((m): [string, string] => [
      t(`cash.method.${m}` as MessageKey),
      formatCents(incomeFor(register, m)),
    ]),
    [t('cash.total.expenses'), formatCents(register.expenses_cents)],
    [t('cash.total.expected'), formatCents(register.expected_cash_cents)],
  ];
  return (
    <section aria-label={t('cash.totals')} className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-bold">{t('cash.totals')}</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-white p-4">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink3">{label}</dt>
            <dd className="text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ExpenseForm({
  pending,
  failed,
  onSubmit,
}: {
  pending: boolean;
  failed: boolean;
  onSubmit: (body: { amount_cents: number; description: string }) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cents = parsePesosToCents(amount);
    if (!cents || !description.trim()) return setInvalid(true);
    setInvalid(false);
    onSubmit({ amount_cents: cents, description: description.trim() });
    setDescription('');
    setAmount('');
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('cash.expense.title')}>
      <h2 className="font-display text-xl font-bold">{t('cash.expense.title')}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('cash.expense.description')}
          <input
            className={inputClass}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('cash.expense.amount')}
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <Button type="submit" label={t('cash.expense.add')} disabled={pending} />
      </div>
      {invalid && (
        <p role="alert" className={errorClass}>
          {t('cash.expense.invalid')}
        </p>
      )}
      {failed && (
        <p role="alert" className={errorClass}>
          {t('cash.expense.failed')}
        </p>
      )}
    </form>
  );
}

function CloseForm({
  expected,
  pending,
  failed,
  onSubmit,
}: {
  expected: number;
  pending: boolean;
  failed: boolean;
  onSubmit: (cents: number) => void;
}) {
  const [counted, setCounted] = useState('');
  const [invalid, setInvalid] = useState(false);
  const cents = parsePesosToCents(counted);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cents === null) return setInvalid(true);
    setInvalid(false);
    onSubmit(cents);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={t('cash.close.title')}>
      <h2 className="font-display text-xl font-bold">{t('cash.close.title')}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('cash.close.counted')}
          <input
            className={inputClass}
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        </label>
        <Button type="submit" label={t('cash.close.submit')} disabled={pending} />
      </div>
      {cents !== null && (
        <p role="status" className="text-ink2">
          {t('cash.close.preview', { difference: signed(cents - expected) })}
        </p>
      )}
      {invalid && (
        <p role="alert" className={errorClass}>
          {t('cash.close.invalid')}
        </p>
      )}
      {failed && (
        <p role="alert" className={errorClass}>
          {t('cash.close.failed')}
        </p>
      )}
    </form>
  );
}

function Closing({ register }: { register: Register }) {
  const difference = register.difference_cents ?? 0;
  return (
    <section aria-label={t('cash.closed.title')} className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-bold">{t('cash.closed.title')}</h2>
      <p role="status" className="font-semibold">
        {t('cash.closed.counted', { amount: formatCents(register.counted_cash_cents ?? 0) })}
      </p>
      <p className={difference === 0 ? 'font-semibold' : errorClass}>
        {difference === 0
          ? t('cash.closed.balanced')
          : t('cash.closed.difference', { difference: signed(difference) })}
      </p>
      {register.pdf_url && (
        <a
          href={register.pdf_url}
          download={`caja-${register.date}.pdf`}
          className="inline-flex min-h-11 w-fit items-center rounded-xl border border-court px-4 font-semibold text-court"
        >
          {t('cash.closed.pdf')}
        </a>
      )}
    </section>
  );
}

function signed(cents: number): string {
  return `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${formatCents(Math.abs(cents))}`;
}
