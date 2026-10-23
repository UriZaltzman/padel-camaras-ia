import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { newId } from '../../db/ids';
import type { Tx } from '../../db/prisma.service';

export interface NewUserInput {
  id: string;
  name: string;
  phone: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
}

/** Users and sign-in identities. Methods take the transaction of the caller (see PrismaService). */
@Injectable()
export class AuthUsersRepository {
  /** The user id behind a provider identity (e.g. a WhatsApp phone), if there is one. */
  async findUserIdByIdentity(
    tx: Tx,
    provider: 'whatsapp' | 'google' | 'apple' | 'email',
    externalId: string,
  ): Promise<string | null> {
    const identity = await tx.authIdentity.findUnique({
      where: { provider_externalId: { provider, externalId } },
      select: { userId: true },
    });
    return identity?.userId ?? null;
  }

  async findById(tx: Tx, id: string): Promise<User | null> {
    return tx.user.findUnique({ where: { id } });
  }

  /** Creates a user with a verified WhatsApp phone and the consents given at sign-up. */
  async createWithWhatsapp(tx: Tx, input: NewUserInput): Promise<User> {
    const user = await tx.user.create({
      data: {
        id: input.id,
        name: input.name,
        phone: input.phone,
        termsAcceptedAt: input.acceptedAt,
        termsVersion: input.termsVersion,
        privacyAcceptedAt: input.acceptedAt,
        privacyVersion: input.privacyVersion,
      },
    });
    await tx.authIdentity.create({
      data: { id: newId(), userId: user.id, provider: 'whatsapp', externalId: input.phone },
    });
    return user;
  }
}
