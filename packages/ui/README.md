# packages/ui

Dueño: `web-paneles` (los cambios que afectan a la app los revisa `app-movil`).

## Qué hay

| Import           | Contenido                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@app/ui`        | Tokens (`tokens.ts`), variantes de componentes (`src/variants.ts`), fuentes por plataforma (`src/fonts.ts`), contraste |
| `@app/ui/web`    | `Button`, `Card`, `DataLabel`, `ScorePill` para React DOM (Next.js)                                                    |
| `@app/ui/native` | Los mismos componentes para React Native (Expo)                                                                        |

## Cómo se comparte entre web y app

Las variantes (colores por estado, espaciado, tipografía) viven una sola vez en `src/variants.ts`, sin depender de ninguna plataforma. Cada plataforma tiene un renderer fino que solo traduce unidades: la web usa estilos inline con `font-family` + `font-weight` y `letter-spacing` en `em`; la app usa `View`/`Text`/`Pressable`, la familia por peso de `nativeFontFamily` (React Native registra un nombre por peso, sin `fontWeight`) y `letterSpacing` en puntos. Así el contraste se prueba una vez sobre las variantes y vale para las dos. No usamos `react-native-web` para no sumar peso ni una capa de estilos extra al panel web.

`nativeFontNames` lista los nombres que la app tiene que registrar con `expo-font`.

## Reglas

- Sin textos de usuario: etiquetas y descripciones accesibles llegan por props desde las traducciones `es-AR`.
- Cada variante declara los fondos sobre los que puede ir; las pruebas exigen WCAG AA en todos y que el amarillo pelota solo aparezca sobre `night`, `court` o `courtDark`.
