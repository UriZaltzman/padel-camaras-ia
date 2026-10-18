import { brand } from '@app/config/brand';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/i18n';
import { InMemoryContactStore } from '@/lib/contact/store';
import { submitContact, type ContactFormState } from '@/lib/contact/submit';

import { ContactForm } from './contact-form';

function setup() {
  const store = new InMemoryContactStore();
  const action = (_state: ContactFormState, formData: FormData) => submitContact(formData, store);
  render(<ContactForm action={action} />);
  return store;
}

function fill(label: Parameters<typeof t>[0], value: string) {
  fireEvent.change(screen.getByLabelText(t(label)), { target: { value } });
}

afterEach(() => vi.restoreAllMocks());

describe('ContactForm', () => {
  it('renders every field with a label', () => {
    setup();
    for (const key of [
      'contact.field.name',
      'contact.field.club',
      'contact.field.contact',
      'contact.field.message',
    ] as const) {
      expect(screen.getByLabelText(t(key))).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: t('contact.submit') })).toBeInTheDocument();
  });

  it('shows validation errors and saves nothing', async () => {
    const store = setup();
    fill('contact.field.contact', 'no-es-un-contacto');
    fireEvent.click(screen.getByRole('button', { name: t('contact.submit') }));

    expect(await screen.findByText(t('contact.error.nameRequired'))).toBeInTheDocument();
    expect(screen.getByText(t('contact.error.clubRequired'))).toBeInTheDocument();
    expect(screen.getByText(t('contact.error.contactInvalid'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('contact.field.name'))).toHaveAttribute('aria-invalid', 'true');
    expect(await store.list()).toHaveLength(0);
  });

  it('saves a valid request in the local store without calling the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const store = setup();
    fill('contact.field.name', 'Ana Prueba');
    fill('contact.field.club', 'Club de Prueba');
    fill('contact.field.contact', '+54 11 5555-0000');
    fill('contact.field.message', 'Tenemos 4 canchas.');
    fireEvent.click(screen.getByRole('button', { name: t('contact.submit') }));

    expect(await screen.findByRole('status')).toHaveTextContent(t('contact.success'));
    await waitFor(async () => expect(await store.list()).toHaveLength(1));
    expect((await store.list())[0]).toMatchObject({
      name: 'Ana Prueba',
      club: 'Club de Prueba',
      contact: '+54 11 5555-0000',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts an email as contact', async () => {
    const store = new InMemoryContactStore();
    const form = new FormData();
    form.set('name', 'Ana');
    form.set('club', 'Club');
    form.set('contact', 'ana@example.com');
    expect(await submitContact(form, store)).toEqual({ status: 'success' });
  });
});

describe('landing sources', () => {
  it('never hardcode the brand name', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx?|json)$/.test(name) && !name.includes('.test.')) files.push(path);
      }
    };
    walk(root);
    const pattern = new RegExp(`\\b${brand.name}\\b`, 'i');
    expect(files.filter((file) => pattern.test(readFileSync(file, 'utf8')))).toEqual([]);
  });
});
