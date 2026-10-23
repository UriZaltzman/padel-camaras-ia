import { AppError } from '../errors/app-error';
import {
  accessFor,
  dunningStage,
  daysOverdue,
  type DunningStage,
  type ServiceAccess,
} from './dunning';
import { indexedPrice } from './indexation';
import { quote, type PriceQuote, type TariffRegistry, type TariffTier } from './tariff';

/** Window of the active-player count (decision #253). */
export const ACTIVE_PLAYERS_WINDOW_DAYS = 90;

/** Distinct players with at least one recorded match in the club in the window. */
export interface ActivePlayersPort {
  countActivePlayers(clubId: string, since: Date, until: Date): Promise<number>;
}

export interface ClubSubscription {
  clubId: string;
  tariffVersionId: string;
  contractStart: Date;
  /** Index of each quarter (basis points), published by the owner. */
  indexByQuarter: readonly number[];
}

export interface SubscriptionCharge {
  id: string;
  clubId: string;
  periodStart: Date;
  amountCents: number;
  dueAt: Date;
  paidAt: Date | null;
  /** Last stage the club was warned about, so each step notifies once. */
  notifiedStage: DunningStage;
}

export interface SubscriptionsRepository {
  subscriptions(): Promise<ClubSubscription[]>;
  subscription(clubId: string): Promise<ClubSubscription | null>;
  openCharges(): Promise<SubscriptionCharge[]>;
  openChargeOf(clubId: string): Promise<SubscriptionCharge | null>;
  saveCharge(charge: SubscriptionCharge): Promise<void>;
}

export interface DunningNotifier {
  notify(clubId: string, stage: DunningStage, daysOverdue: number): Promise<void>;
}

export interface Invoice {
  tier: TariffTier;
  activePlayers: number;
  baseCents: number;
  listCents: number;
  /** What the club pays this month: list price after the quarterly index. */
  amountCents: number;
}

export class InMemorySubscriptionsRepository implements SubscriptionsRepository {
  readonly subs = new Map<string, ClubSubscription>();
  readonly charges = new Map<string, SubscriptionCharge>();
  subscriptions() {
    return Promise.resolve([...this.subs.values()]);
  }
  subscription(clubId: string) {
    return Promise.resolve(this.subs.get(clubId) ?? null);
  }
  openCharges() {
    return Promise.resolve([...this.charges.values()].filter((c) => c.paidAt === null));
  }
  openChargeOf(clubId: string) {
    const open = [...this.charges.values()]
      .filter((c) => c.clubId === clubId && c.paidAt === null)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return Promise.resolve(open[0] ?? null);
  }
  saveCharge(charge: SubscriptionCharge) {
    this.charges.set(charge.id, { ...charge });
    return Promise.resolve();
  }
}

/** Price and collection of the club's monthly fee: tier by active players, index, debt cutoffs. */
export class SubscriptionsService {
  constructor(
    private readonly repository: SubscriptionsRepository,
    private readonly tariffs: TariffRegistry,
    private readonly activePlayers: ActivePlayersPort,
    private readonly notifier: DunningNotifier,
  ) {}

  async quoteFor(clubId: string, now: Date): Promise<Invoice> {
    const sub = await this.repository.subscription(clubId);
    if (!sub) throw new AppError('NOT_FOUND');
    const since = new Date(now.getTime() - ACTIVE_PLAYERS_WINDOW_DAYS * 86_400_000);
    const activePlayers = await this.activePlayers.countActivePlayers(clubId, since, now);
    const price: PriceQuote = quote(this.tariffs.byId(sub.tariffVersionId), activePlayers);
    return {
      tier: price.tier,
      activePlayers,
      baseCents: price.baseCents,
      listCents: price.listCents,
      amountCents: indexedPrice(price.listCents, sub.contractStart, now, sub.indexByQuarter),
    };
  }

  /** Opens the charge of a period (e.g. when Mercado Pago bills the subscription). */
  async openCharge(clubId: string, id: string, periodStart: Date, dueAt: Date, now: Date) {
    const invoice = await this.quoteFor(clubId, now);
    const charge: SubscriptionCharge = {
      id,
      clubId,
      periodStart,
      amountCents: invoice.amountCents,
      dueAt,
      paidAt: null,
      notifiedStage: 'current',
    };
    await this.repository.saveCharge(charge);
    return charge;
  }

  /** A paid charge clears the debt at once and restores the service. */
  async markPaid(chargeId: string, clubId: string, paidAt: Date): Promise<void> {
    const charge = (await this.repository.openCharges()).find(
      (c) => c.id === chargeId && c.clubId === clubId,
    );
    if (!charge) throw new AppError('NOT_FOUND');
    await this.repository.saveCharge({ ...charge, paidAt });
  }

  /** The oldest unpaid charge decides the stage. */
  async stageOf(clubId: string, now: Date): Promise<DunningStage> {
    const charge = await this.repository.openChargeOf(clubId);
    return charge ? dunningStage(charge.dueAt, now) : 'current';
  }

  async accessOf(clubId: string, now: Date): Promise<ServiceAccess> {
    return accessFor(await this.stageOf(clubId, now));
  }

  /** Guard for features that stop with the service. */
  async assertCanRecord(clubId: string, now: Date): Promise<void> {
    if (!(await this.accessOf(clubId, now)).canRecord) throw new AppError('CLUB_SERVICE_SUSPENDED');
  }

  /**
   * Daily job: warns each club once per stage it reaches. Returns the clubs it warned, so a
   * run is easy to assert on and to log.
   */
  async runDunning(now: Date): Promise<{ clubId: string; stage: DunningStage }[]> {
    const warned: { clubId: string; stage: DunningStage }[] = [];
    for (const charge of await this.repository.openCharges()) {
      const stage = dunningStage(charge.dueAt, now);
      if (stage === 'current' || stage === charge.notifiedStage) continue;
      await this.notifier.notify(charge.clubId, stage, daysOverdue(charge.dueAt, now));
      await this.repository.saveCharge({ ...charge, notifiedStage: stage });
      warned.push({ clubId: charge.clubId, stage });
    }
    return warned;
  }
}
