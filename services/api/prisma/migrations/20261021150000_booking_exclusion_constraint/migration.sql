-- Database-enforced rule (spec §2, §3.1): two bookings of the same court can never overlap.
-- Not expressible in the Prisma schema; keep in sync by hand.
--
-- * Half-open range [starts_at, ends_at): 18:00-19:30 and 19:30-21:00 do not clash.
-- * Only rows that occupy the court count. `cancelled` and `expired` free the slot.
--   A `held` row occupies it until the hold job flips it to `expired`.
-- * Moving a booking is an UPDATE of starts_at/ends_at/court_id and is checked the same way.
-- * Later kinds of reservation (class, tournament, block) must reuse this constraint
--   by writing their rows into `bookings`.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_no_overlap_excl"
        EXCLUDE USING gist (
            "court_id" WITH =,
            tstzrange("starts_at", "ends_at", '[)') WITH &&
        )
        WHERE ("status" IN ('held', 'confirmed', 'completed', 'no_show'));
