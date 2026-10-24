# Casos de reglas del pádel

Casos escritos a mano (issue #138, especificación §14 "Reglas del pádel"). Los corre la suite de `ml` (`uv run --directory ml pytest`), así que un cambio que rompa una regla no entra.

| Archivo | Qué prueba | Cuántos |
| --- | --- | --- |
| `point_rules.yaml` | La máquina de estados del punto: las 7 reglas que cierran un punto y cada ambigüedad como opción (`docs/ml/rules-ambiguities.md`) | ver `ml/tests/test_rule_cases.py` |
| `scoring_rules.yaml` | Marcador, punto de oro, ventaja, sets, tie-break, super tie-break, rotación del saque y cambios de lado | ídem |

Cada caso tiene `id` único y `rule`: la regla de la especificación (`R1` a `R7`), la ambigüedad (`A1`…) o el tema del marcador que ejercita. Los eventos se escriben en el formato de `ml/tests/rules_dsl.py` para que un árbitro pueda leerlos sin leer Python. **Para agregar un caso:** sumá una entrada al YAML con su resultado esperado; si el reglamento oficial contradice un caso, se corrige el caso y la opción que lo gobierna, no el test.
