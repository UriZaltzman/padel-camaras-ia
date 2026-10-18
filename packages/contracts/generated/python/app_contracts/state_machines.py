# Generated from packages/contracts/openapi/openapi.yaml (`x-state-machine`) by
# `pnpm contracts:generate`. Do not edit: change the contract and regenerate.
"""Allowed status transitions of section 3 of the specification.

Any change outside these tables must be rejected with ``INVALID_STATE_TRANSITION``.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from types import MappingProxyType
from typing import Any, Final

from app_contracts.models import (
    BookingStatus,
    MatchStatus,
    PaymentStatus,
    ProcessingJobStatus,
    SettlementStatus,
)


@dataclass(frozen=True, slots=True)
class StateMachine[S: StrEnum]:
    """A status lifecycle: its states, its initial state and the allowed moves."""

    column: str
    """Database column that stores the status, e.g. ``matches.status``."""
    initial: S
    """Status of a newly created row."""
    states: tuple[S, ...]
    """Every status, in contract order."""
    transitions: Mapping[S, frozenset[S]]
    """For every status, the statuses it may move to. Empty for a final status."""

    def can_transition(self, current: S, target: S) -> bool:
        """Whether ``current`` may move to ``target``."""
        return target in self.transitions[current]


MATCH_STATUS_MACHINE: Final = StateMachine[MatchStatus](
    column="matches.status",
    initial=MatchStatus.scheduled,
    states=(
        MatchStatus.scheduled,
        MatchStatus.recording,
        MatchStatus.recorded,
        MatchStatus.processing,
        MatchStatus.published,
        MatchStatus.needs_review,
        MatchStatus.archived,
        MatchStatus.failed,
        MatchStatus.cancelled,
    ),
    transitions=MappingProxyType(
        {
            MatchStatus.scheduled: frozenset({MatchStatus.recording, MatchStatus.cancelled}),
            MatchStatus.recording: frozenset({MatchStatus.recorded}),
            MatchStatus.recorded: frozenset({MatchStatus.processing}),
            MatchStatus.processing: frozenset({MatchStatus.published, MatchStatus.failed}),
            MatchStatus.published: frozenset({MatchStatus.needs_review, MatchStatus.archived}),
            MatchStatus.needs_review: frozenset({MatchStatus.published}),
            MatchStatus.archived: frozenset(),
            MatchStatus.failed: frozenset({MatchStatus.processing}),
            MatchStatus.cancelled: frozenset(),
        }
    ),
)
"""``matches.status``."""

BOOKING_STATUS_MACHINE: Final = StateMachine[BookingStatus](
    column="bookings.status",
    initial=BookingStatus.held,
    states=(
        BookingStatus.held,
        BookingStatus.confirmed,
        BookingStatus.completed,
        BookingStatus.cancelled,
        BookingStatus.no_show,
        BookingStatus.expired,
    ),
    transitions=MappingProxyType(
        {
            BookingStatus.held: frozenset({BookingStatus.confirmed, BookingStatus.expired}),
            BookingStatus.confirmed: frozenset(
                {BookingStatus.completed, BookingStatus.cancelled, BookingStatus.no_show}
            ),
            BookingStatus.completed: frozenset(),
            BookingStatus.cancelled: frozenset(),
            BookingStatus.no_show: frozenset(),
            BookingStatus.expired: frozenset(),
        }
    ),
)
"""``bookings.status``."""

PROCESSING_JOB_STATUS_MACHINE: Final = StateMachine[ProcessingJobStatus](
    column="processing_jobs.status",
    initial=ProcessingJobStatus.queued,
    states=(
        ProcessingJobStatus.queued,
        ProcessingJobStatus.running,
        ProcessingJobStatus.succeeded,
        ProcessingJobStatus.failed,
    ),
    transitions=MappingProxyType(
        {
            ProcessingJobStatus.queued: frozenset({ProcessingJobStatus.running}),
            ProcessingJobStatus.running: frozenset(
                {ProcessingJobStatus.succeeded, ProcessingJobStatus.failed}
            ),
            ProcessingJobStatus.succeeded: frozenset(),
            ProcessingJobStatus.failed: frozenset(),
        }
    ),
)
"""``processing_jobs.status``."""

PAYMENT_STATUS_MACHINE: Final = StateMachine[PaymentStatus](
    column="payments.status",
    initial=PaymentStatus.pending,
    states=(
        PaymentStatus.pending,
        PaymentStatus.approved,
        PaymentStatus.rejected,
        PaymentStatus.refunded,
    ),
    transitions=MappingProxyType(
        {
            PaymentStatus.pending: frozenset({PaymentStatus.approved, PaymentStatus.rejected}),
            PaymentStatus.approved: frozenset({PaymentStatus.refunded}),
            PaymentStatus.rejected: frozenset(),
            PaymentStatus.refunded: frozenset(),
        }
    ),
)
"""``payments.status``."""

SETTLEMENT_STATUS_MACHINE: Final = StateMachine[SettlementStatus](
    column="settlements.status",
    initial=SettlementStatus.draft,
    states=(
        SettlementStatus.draft,
        SettlementStatus.approved,
        SettlementStatus.invoiced,
        SettlementStatus.paid,
    ),
    transitions=MappingProxyType(
        {
            SettlementStatus.draft: frozenset({SettlementStatus.approved}),
            SettlementStatus.approved: frozenset({SettlementStatus.invoiced}),
            SettlementStatus.invoiced: frozenset({SettlementStatus.paid}),
            SettlementStatus.paid: frozenset(),
        }
    ),
)
"""``settlements.status``."""

STATE_MACHINES: Final[Mapping[str, StateMachine[Any]]] = MappingProxyType(
    {
        "MatchStatus": MATCH_STATUS_MACHINE,
        "BookingStatus": BOOKING_STATUS_MACHINE,
        "ProcessingJobStatus": PROCESSING_JOB_STATUS_MACHINE,
        "PaymentStatus": PAYMENT_STATUS_MACHINE,
        "SettlementStatus": SETTLEMENT_STATUS_MACHINE,
    }
)
"""Every state machine, by status schema name."""
