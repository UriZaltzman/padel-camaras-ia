"""Parquet persistence for pipeline stages (spec section 5).

Each stage writes its typed records to ``<work_dir>/<stage>.parquet`` so the pipeline can be
resumed or reprocessed from any stage. The file stores the record type in its metadata, and
reading checks it, so one stage never loads another stage's output by mistake.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import BaseModel

RECORD_TYPE_METADATA_KEY = b"ml.record_type"
PARQUET_SUFFIX = ".parquet"


class Stage(StrEnum):
    """Pipeline stages that persist their output, in execution order."""

    PLAYERS = "players"
    TRACKS = "tracks"
    BALL = "ball"
    SHOTS = "shots"
    BOUNCES = "bounces"
    SHOT_TYPES = "shot_types"


class RecordTypeMismatchError(ValueError):
    """The Parquet file was written for a different record type than the one requested."""


def record_type_name(record_type: type[BaseModel]) -> str:
    """Stable identifier of a record type, stored in the Parquet metadata."""
    return f"{record_type.__module__}.{record_type.__qualname__}"


def stage_path(work_dir: Path, stage: Stage) -> Path:
    """Where a stage stores its output inside a match working directory."""
    return work_dir / f"{stage.value}{PARQUET_SUFFIX}"


def write_records[T: BaseModel](records: Sequence[T], record_type: type[T], path: Path) -> None:
    """Write records of exactly ``record_type`` to a Parquet file, atomically.

    The data goes to a temporary file first and is renamed into place, so a stage that
    crashes halfway never leaves a truncated file that a resumed run would trust.
    """
    for record in records:
        if type(record) is not record_type:
            msg = f"expected {record_type_name(record_type)}, got {record_type_name(type(record))}"
            raise TypeError(msg)
    table = pa.Table.from_pylist([record.model_dump(mode="json") for record in records])
    metadata = {RECORD_TYPE_METADATA_KEY: record_type_name(record_type).encode()}
    table = table.replace_schema_metadata(metadata)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.tmp")
    pq.write_table(table, tmp_path)
    tmp_path.replace(path)


def read_records[T: BaseModel](record_type: type[T], path: Path) -> list[T]:
    """Read and validate the records a stage wrote with :func:`write_records`."""
    table = pq.read_table(path)
    stored = (table.schema.metadata or {}).get(RECORD_TYPE_METADATA_KEY, b"").decode()
    expected = record_type_name(record_type)
    if stored != expected:
        msg = f"{path} holds {stored or 'unknown records'}, expected {expected}"
        raise RecordTypeMismatchError(msg)
    return [record_type.model_validate(row) for row in table.to_pylist()]


def write_stage[T: BaseModel](
    work_dir: Path, stage: Stage, records: Sequence[T], record_type: type[T]
) -> Path:
    """Store a stage's output in its standard location and return the file path."""
    path = stage_path(work_dir, stage)
    write_records(records, record_type, path)
    return path


def read_stage[T: BaseModel](work_dir: Path, stage: Stage, record_type: type[T]) -> list[T]:
    """Load a stage's output from its standard location."""
    return read_records(record_type, stage_path(work_dir, stage))
