-- Booking horizon per club (§3.2, #255).
ALTER TABLE "clubs"
    ADD COLUMN "player_horizon_days" SMALLINT NOT NULL DEFAULT 14,
    ADD COLUMN "booking_window_opens_at" TIME(0),
    ADD CONSTRAINT "clubs_player_horizon_days_check" CHECK ("player_horizon_days" BETWEEN 1 AND 14);
