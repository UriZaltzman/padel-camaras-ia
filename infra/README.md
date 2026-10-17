# infra

Dueño: `club-devops`.

Docker, Terraform, scripts de despliegue y `hardware/bom.yaml`. Ver `.claude/agents/club-devops.md`.

## hardware

`hardware/bom.yaml` es la lista de materiales del combo. `hardware/` es además un miembro del workspace de uv (`hardware-bom`) con el esquema Pydantic y los totales que usa el cotizador de la consola interna:

```python
from hardware_bom import load_bom

quote = load_bom().quote(courts=4)  # usd_total, ars_total_cents, ars_purchase_plan_cents, is_estimate
```

Las pruebas fallan si se rompe el formato, si un ítem no tiene `status` o si el total de control (4 canchas = US$4.320, ARS 6.631.200) deja de cuadrar. Si cambian los precios en `docs/estructura.md`, se actualizan `bom.yaml` y el total de control de `hardware/tests/test_bom.py` juntos.

```bash
cd infra/hardware
uv run pytest
uv run ruff format --check . && uv run ruff check .
uv run mypy --config-file ../../packages/config/mypy.ini .
```
