"""Entry point: validate settings, set up logs and the local store, then exit.

The 7 processes of spec section 4 will hang from here in later issues.
"""

import logging
import sys

from edge_agent import __version__
from edge_agent.logs import configure_logging, log_context
from edge_agent.settings import SettingsError, load_settings
from edge_agent.store import open_store, schema_version, set_state

EXIT_CONFIG_ERROR = 2

logger = logging.getLogger("edge_agent")


def main() -> int:
    try:
        settings = load_settings()
    except SettingsError as error:
        sys.stderr.write(f"{error}\n")
        return EXIT_CONFIG_ERROR

    configure_logging(settings.log_level)
    with log_context(club_id=str(settings.club_id)):
        conn = open_store(settings.db_path)
        try:
            set_state(conn, "agent_version", __version__)
            logger.info(
                "edge_agent_started",
                extra={
                    "device_id": str(settings.device_id),
                    "version": __version__,
                    "schema_version": schema_version(conn),
                },
            )
        finally:
            conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
