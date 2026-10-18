"""The exported Python transition tables match section 3 of the specification one by one.

SECTION_3 is transcribed from docs/especificacion-tecnica.md on purpose, independently of the
contract: it is the reference the generated tables are checked against, not a second source.
The enums in app_contracts.models are generated straight from the contract's status schemas,
so comparing them with the tables checks that the contract enums and the tables agree.
"""

from enum import StrEnum

import pytest

from app_contracts import models
from app_contracts.state_machines import (
    BOOKING_STATUS_MACHINE,
    MATCH_STATUS_MACHINE,
    PAYMENT_STATUS_MACHINE,
    PROCESSING_JOB_STATUS_MACHINE,
    SETTLEMENT_STATUS_MACHINE,
    STATE_MACHINES,
    StateMachine,
)

# name -> (column, initial, {state: allowed targets})
SECTION_3: dict[str, tuple[str, str, dict[str, set[str]]]] = {
    "MatchStatus": (
        "matches.status",
        "scheduled",
        {
            "scheduled": {"recording", "cancelled"},
            "recording": {"recorded"},
            "recorded": {"processing"},
            "processing": {"published", "failed"},
            "published": {"needs_review", "archived"},
            "needs_review": {"published"},
            "archived": set(),
            "failed": {"processing"},
            "cancelled": set(),
        },
    ),
    "BookingStatus": (
        "bookings.status",
        "held",
        {
            "held": {"confirmed", "expired"},
            "confirmed": {"completed", "cancelled", "no_show"},
            "completed": set(),
            "cancelled": set(),
            "no_show": set(),
            "expired": set(),
        },
    ),
    "ProcessingJobStatus": (
        "processing_jobs.status",
        "queued",
        {
            "queued": {"running"},
            "running": {"succeeded", "failed"},
            "succeeded": set(),
            "failed": set(),
        },
    ),
    "PaymentStatus": (
        "payments.status",
        "pending",
        {
            "pending": {"approved", "rejected"},
            "approved": {"refunded"},
            "rejected": set(),
            "refunded": set(),
        },
    ),
    "SettlementStatus": (
        "settlements.status",
        "draft",
        {
            "draft": {"approved"},
            "approved": {"invoiced"},
            "invoiced": {"paid"},
            "paid": set(),
        },
    ),
}

PAIRS = [
    (name, current, target)
    for name, (_, _, transitions) in SECTION_3.items()
    for current in transitions
    for target in transitions
]


def test_exports_exactly_the_five_machines_of_section_3() -> None:
    assert set(STATE_MACHINES) == set(SECTION_3)
    assert STATE_MACHINES["MatchStatus"] is MATCH_STATUS_MACHINE
    assert STATE_MACHINES["BookingStatus"] is BOOKING_STATUS_MACHINE
    assert STATE_MACHINES["ProcessingJobStatus"] is PROCESSING_JOB_STATUS_MACHINE
    assert STATE_MACHINES["PaymentStatus"] is PAYMENT_STATUS_MACHINE
    assert STATE_MACHINES["SettlementStatus"] is SETTLEMENT_STATUS_MACHINE


@pytest.mark.parametrize("name", list(SECTION_3))
def test_states_column_and_initial_match_section_3(name: str) -> None:
    column, initial, transitions = SECTION_3[name]
    machine = STATE_MACHINES[name]
    assert machine.column == column
    assert machine.initial == initial
    assert {state.value for state in machine.states} == set(transitions)


@pytest.mark.parametrize("name", list(SECTION_3))
def test_contract_enum_and_table_agree(name: str) -> None:
    enum: type[StrEnum] = getattr(models, name)
    machine = STATE_MACHINES[name]
    assert list(machine.states) == list(enum)
    assert set(machine.transitions) == set(enum)
    targets = {target for allowed in machine.transitions.values() for target in allowed}
    assert all(isinstance(state, enum) for state in {machine.initial, *targets})


@pytest.mark.parametrize(("name", "current", "target"), PAIRS)
def test_every_transition_is_allowed_exactly_when_section_3_lists_it(
    name: str, current: str, target: str
) -> None:
    enum: type[StrEnum] = getattr(models, name)
    machine: StateMachine[StrEnum] = STATE_MACHINES[name]
    allowed = target in SECTION_3[name][2][current]
    assert machine.can_transition(enum(current), enum(target)) is allowed


def test_tables_are_read_only() -> None:
    with pytest.raises(TypeError):
        MATCH_STATUS_MACHINE.transitions[models.MatchStatus.archived] = frozenset()  # type: ignore[index]
    with pytest.raises(AttributeError):
        MATCH_STATUS_MACHINE.initial = models.MatchStatus.recording  # type: ignore[misc]
