import type { ContactInput } from './schema';

export interface ContactRequest extends ContactInput {
  id: string;
  createdAt: string; // ISO 8601, UTC
}

/**
 * Where club contact requests are kept. Today it is an in-memory store: nothing is sent to third
 * parties or to clubs. When the backend has an endpoint, add an adapter that implements this
 * interface and return it from getContactStore().
 */
export interface ContactStore {
  save(input: ContactInput): Promise<ContactRequest>;
  list(): Promise<ContactRequest[]>;
}

export class InMemoryContactStore implements ContactStore {
  private readonly items: ContactRequest[] = [];

  save(input: ContactInput): Promise<ContactRequest> {
    const request: ContactRequest = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.items.push(request);
    return Promise.resolve(request);
  }

  list(): Promise<ContactRequest[]> {
    return Promise.resolve([...this.items]);
  }
}

const globalStore = globalThis as { __contactStore?: ContactStore };

/** Process-wide store (survives dev hot reloads). Data is lost when the server restarts. */
export function getContactStore(): ContactStore {
  globalStore.__contactStore ??= new InMemoryContactStore();
  return globalStore.__contactStore;
}
