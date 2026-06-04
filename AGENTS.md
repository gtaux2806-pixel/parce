<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: Grid de Leyendas (Tateti de Fútbol)

## 🎯 Objetivo y Descripción General
"Grid de Leyendas" es un juego interactivo de tablero 3x3 estilo Tateti / Tic-Tac-Toe basado en conocimiento de fútbol. Los jugadores (X y O) se turnan para nombrar a futbolistas que hayan jugado tanto en el equipo correspondiente a la fila como en el de la columna de una casilla vacía. Gana el primero en lograr 3 en línea (vertical, horizontal o diagonal).

## 🏗️ Arquitectura y Estructura de Archivos
- **Framework**: Next.js (App Router) + React (cliente) + Tailwind CSS.
- **`app/page.tsx`**: Contiene toda la lógica principal del juego, sistema de turnos, buscador de jugadores, autocompletado y renderizado del tablero con un diseño UI moderno (glassmorphism, animaciones, gradientes).
- **`lib/teams.ts`**: Simula una base de datos local exportando un objeto `teamsDatabase` con ~48 equipos destacados y un arreglo exhaustivo de sus jugadores históricos.
- **`lib/teamslogos.ts`**: Separa la lógica visual de la base de datos exportando las URLs directas (scrapeadas de orígenes fiables como FotMob) para el escudo o logo oficial de cada uno de los 48 equipos.

## ⚙️ Funcionalidades Clave implementadas
1. **Garantía de Tableros Resolubles (`generateSolvableBoard`)**: Antes de iniciar una partida, la lógica pre-calcula (intentando iteraciones) que las 6 combinaciones de equipos generadas produzcan al menos 1 jugador en común para **cada una de las 9 casillas**. Nunca habrá una casilla bloqueada.
2. **Posicionamiento Automático**: El jugador no necesita seleccionar manualmente un casillero. Introduce el nombre en el input persistente, y el sistema automáticamente escanea el tablero buscando una celda vacía válida para ese futbolista. 
3. **Autocompletado Global Inteligente**: El campo de texto indexa todos los jugadores de la DB, ignora acentos, mayúsculas y minúsculas (`normalizeString`) y muestra sugerencias en un menú desplegable a medida que se escribe.
4. **Sistema de Penalizaciones Estricto**: Si un usuario envía un nombre de jugador y resulta no ser la intersección de ninguna casilla vacía del tablero, no solo salta una alerta de error, sino que el jugador **pierde su turno**.
5. **Protección de Progreso**: Implementación de confirmaciones (vía `window.confirm` en botón de reiniciar y evento `beforeunload`) para que los usuarios no pierdan la partida por cerrar o recargar la página accidentalmente.
6. **Diseño Uniforme**: Una grilla estrictamente calculada (`grid-cols-4 grid-rows-4` con `aspect-square` generalizado) para asegurar que escudos, contenedores y marcadores X/O sean siempre un cuadrado perfecto simétrico sin deformarse en móviles.

## ⚠️ Lecciones Aprendidas (Errores a no repetir)
- **Cuidado con los React `useEffect` dependientes del estado del tablero**: Nunca invocar el inicio automático del juego (`startNewGame(true)`) como efecto secundario de un booleano como `hasGameStarted`. Esto provocó un *bug* donde la partida se reiniciaba al jugar la primera ficha. Las llamadas de inicialización de partida deben encapsularse en arreglos de dependencias vacíos `[]` o a través del input manual del usuario.
- **Scraping del lado del cliente vs Scripts Estáticos**: Hubo problemas de seguridad y CORS al intentar importar/scrapear imágenes de Wikipedia o APIs con llaves Premium del lado del cliente (Navegador). La mejor aproximación fue y siempre debe ser precargar estas URLs (ya sea scripts locales temporales) y guardar los strings directamente en variables estáticas para exportación (como lo que hicimos en `lib/teamslogos.ts`).
- **Problemas con `window.confirm` ocultos**: Si los resets se fuerzan por código (por un `useEffect` mal planteado) el `window.confirm` nativo no surte efecto. Verificar el flujo natural de eventos.
