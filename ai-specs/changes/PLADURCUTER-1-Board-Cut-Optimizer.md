# PLADURCUTER-1 — Optimizador de Cortes de Tableros de Pladur

---

## [ORIGINAL]

> Quiero hacer una aplicación para optimizar el uso de tableros de pladur de 1,20 m X 2,80 m y lograr la mayor cantidad de cortes por tablero, PARA OPTIMIZAR EL USO DE TABLEROS Y MINIMIZAR EL DESPERDICIO. A la aplicación se le sube un archivo .pdf o .csv con los campos: Nota clave, Paquete Nº, Nombre, Longitud, Altura desconectada.
>
> Nota Clave: `[TIPO].[ESPESOR].[PROPIEDADES].SC.000`
> - TIPO: TRX= Corte Trasdosado, TBX= Corte de tabique
> - ESPESOR: 119, 90, 75
> - PROPIEDADES: E= Estándar, H= Hidrofugo, EE= Estándar doble cara, EH= Estándar hidrofugo
>
> Restricciones de combinación:
> 1. No se puede combinar cortes de diferente ESPESOR en un mismo tablero
> 2. No se pueden incluir cortes H en un tablero de cortes E
> 3. No se puede combinar cortes de TBX en tableros de corte TRX
> 4. No se puede combinar TRX H dentro de tableros TRX E
> 5. Solo se puede combinar TRX E dentro de tableros TRX H del mismo ESPESOR
>
> Se debe generar un diagrama de cada tablero con líneas de corte y zona de desperdicio, la lista de piezas para imprimir y enviar a producción, y un resumen final por tipo de tablero, total de piezas y porcentaje de desperdicio.

---

## [ENHANCED]

### Descripción

**Como** operario o encargado de producción de pladur,
**Quiero** subir un archivo CSV o PDF con la lista de piezas que necesito cortar,
**Para** obtener automáticamente un plan de corte optimizado que minimice el desperdicio de tableros, con diagramas visuales y listas de piezas listos para imprimir y enviar a producción.

---

### Dominio y Reglas de Negocio

#### Dimensiones del tablero estándar
- Anchura: **1.200 mm** (1,20 m)
- Altura: **2.800 mm** (2,80 m)

#### Estructura del código Nota Clave
Formato: `[TIPO].[ESPESOR].[PROPIEDADES].SC.[SEQ]`

| Campo | Valores permitidos | Descripción |
|---|---|---|
| TIPO | `TRX` \| `TBX` | TRX = Trasdosado, TBX = Tabique |
| ESPESOR | `119` \| `90` \| `75` | Grosor en mm |
| PROPIEDADES | `E` \| `H` \| `EE` \| `EH` | Calidad de la placa |
| SC | literal `SC` | Fijo, indica tipo de corte |
| SEQ | `000`–`999` | Número de secuencia (ignorado para agrupación) |

Ejemplo válido: `TRX.119.H.SC.005`

#### Reglas de compatibilidad de tableros (estrictas)

Cada tablero pertenece a un **grupo de compatibilidad** definido por `TIPO + ESPESOR + familia_hidrofuga`. Las piezas sólo se pueden colocar en tableros de su mismo grupo, **excepto la regla 5**:

| Regla | Descripción |
|---|---|
| R1 | Piezas de distinto ESPESOR nunca se mezclan en el mismo tablero |
| R2 | Piezas H o EH no pueden ir en tableros E o EE |
| R3 | Piezas TBX no pueden ir en tableros TRX, ni viceversa |
| R4 | Piezas `TRX.*.H` o `TRX.*.EH` no pueden ir en tableros `TRX.*.E` |
| R5 | Piezas `TRX.*.E` o `TRX.*.EE` **sí pueden** ir en tableros `TRX.*.H` del mismo ESPESOR |

**Tabla de grupos de tableros resultante** (por ESPESOR aplicado a cada uno):

| Grupo de tablero | Acepta piezas de |
|---|---|
| `TRX.[esp].E` | `TRX.[esp].E`, `TRX.[esp].EE` |
| `TRX.[esp].H` | `TRX.[esp].H`, `TRX.[esp].EH`, `TRX.[esp].E`, `TRX.[esp].EE` |
| `TBX.[esp].E` | `TBX.[esp].E`, `TBX.[esp].EE` |
| `TBX.[esp].H` | `TBX.[esp].H`, `TBX.[esp].EH` |

> Nota: La regla R5 sólo aplica a TRX. TBX.E no puede ir en tableros TBX.H.

#### Campos de entrada por pieza

| Campo | Tipo | Restricción |
|---|---|---|
| `notaClave` | `string` | Formato `[TIPO].[ESP].[PROP].SC.[SEQ]` |
| `packageNumber` | `string` | Orden de almacenamiento |
| `name` | `string` | Identificador de la pieza |
| `length` | `number` (mm) | 0 < length ≤ 1.200 |
| `height` | `number` (mm) | 0 < height ≤ 2.800 |

---

### Criterios de Aceptación

#### AC1 — Carga y validación del archivo CSV
- **GIVEN** un archivo CSV con columnas: `Nota Clave`, `Paquete Nº`, `Nombre`, `Longitud`, `Altura desconectada`
- **WHEN** el usuario sube el archivo
- **THEN** el sistema parsea todas las filas y muestra una tabla de previsualización con los datos y el estado de validación de cada fila
- **AND** reporta errores por fila si: Nota Clave no cumple el formato, Longitud > 1.200 mm, Altura > 2.800 mm, o valores vacíos en campos obligatorios
- **AND** no permite iniciar la optimización si hay errores de validación

#### AC2 — Carga y validación del archivo PDF
- **GIVEN** un archivo PDF con datos tabulares en las mismas columnas
- **WHEN** el usuario sube el archivo
- **THEN** el sistema extrae la tabla del PDF y la procesa con las mismas validaciones que el CSV
- **AND** si el PDF tiene múltiples páginas, procesa todas las páginas buscando filas de la tabla

#### AC3 — Agrupación por compatibilidad
- **GIVEN** una lista de piezas parseadas y válidas
- **WHEN** el sistema inicia la optimización
- **THEN** agrupa las piezas en conjuntos compatibles según las reglas R1–R5
- **AND** cada pieza pertenece a exactamente un grupo de optimización
- **AND** en ningún caso un grupo viola las restricciones de compatibilidad

#### AC4 — Optimización de cortes
- **GIVEN** un grupo de piezas compatibles
- **WHEN** el algoritmo de optimización se ejecuta
- **THEN** distribuye las piezas en el mínimo número de tableros de 1.200 × 2.800 mm
- **AND** ninguna pieza se solapa con otra
- **AND** todas las piezas caben dentro del tablero
- **AND** el algoritmo puede rotar piezas (intercambiar Longitud y Altura) para mejorar el aprovechamiento, siempre que ambas dimensiones rotadas sigan siendo ≤ 1.200 y ≤ 2.800 mm respectivamente
- **AND** el porcentaje de desperdicio de cada tablero se calcula como `(área_tablero - suma_área_piezas) / área_tablero * 100`

#### AC5 — Diagrama visual por tablero
- **GIVEN** un tablero con piezas colocadas
- **WHEN** se muestran los resultados
- **THEN** se renderiza un diagrama SVG del tablero que muestra:
  - Contorno del tablero (fondo blanco)
  - Cada pieza como rectángulo con color diferenciado por tipo (`TRX`/`TBX`) y propiedad (E/H/EE/EH)
  - Nombre de la pieza y sus dimensiones dentro del rectángulo (si el espacio lo permite)
  - Área de desperdicio como zona gris con patrón de rayas diagonales
  - Líneas de corte entre piezas
- **AND** el diagrama es a escala proporcional (no necesariamente a escala real)
- **AND** el título del diagrama muestra: número de tablero, tipo de tablero, y porcentaje de desperdicio

#### AC6 — Lista de piezas por tablero
- **GIVEN** un tablero con piezas colocadas
- **THEN** junto al diagrama se muestra una tabla con las columnas: `Paquete Nº`, `Nombre`, `Longitud (mm)`, `Altura (mm)`, `Nota Clave`, `Rotada` (sí/no)
- **AND** las filas están ordenadas por `Paquete Nº`

#### AC7 — Impresión y envío a producción
- **GIVEN** el resultado de optimización completo
- **WHEN** el usuario hace clic en "Imprimir / Enviar a producción"
- **THEN** se abre el diálogo de impresión del navegador
- **AND** el layout de impresión muestra cada tablero en su propia página, con el diagrama en la parte superior y la lista de piezas debajo
- **AND** el encabezado de cada página incluye: número de tablero, tipo, fecha de generación

#### AC8 — Resumen ejecutivo final
- **GIVEN** todos los tableros generados
- **THEN** al final de la página de resultados se muestra una tabla de resumen con:

| Tipo de tablero | Tableros usados | Piezas | % Desperdicio medio |
|---|---|---|---|
| TRX.119.H | 3 | 18 | 12,4% |
| TBX.90.E | 1 | 5 | 8,1% |
| ... | ... | ... | ... |
| **TOTAL** | **4** | **23** | **11,2%** |

---

### Arquitectura Técnica

#### Stack

- **Frontend**: React 18 + TypeScript + React Bootstrap 5
- **Backend**: Node.js + TypeScript + Express
- **Sin base de datos**: procesamiento completamente stateless (no se persiste nada)
- **Algoritmo**: Strip Packing con heurística Bottom-Left First Fit Decreasing (BL-FFD)

#### Estructura de archivos a crear

```
frontend/src/
├── types/
│   └── optimizer.types.ts          # All shared TypeScript types
├── utils/
│   ├── noteKeyParser.ts            # Parse & validate Nota Clave strings
│   └── compatibilityGrouper.ts     # Group pieces by board compatibility rules
├── services/
│   └── optimizerService.ts         # HTTP calls to backend API
├── components/
│   ├── FileDropZone.tsx            # Drag-and-drop file upload area
│   ├── PiecePreviewTable.tsx       # Validation preview before optimizing
│   ├── BoardDiagram.tsx            # SVG diagram of a single board
│   ├── PieceList.tsx               # Piece table beside the diagram
│   └── SummaryTable.tsx            # Final summary table
└── pages/
    ├── FileUploadPage.tsx           # Step 1: upload + preview + validate
    └── OptimizationResultsPage.tsx  # Step 2: results + print

backend/src/
├── domain/models/
│   ├── Piece.ts                    # Piece entity with notaClave components
│   └── BoardLayout.ts              # Board entity with placed pieces
├── application/services/
│   ├── noteKeyParserService.ts     # Parse Nota Clave → components
│   ├── compatibilityService.ts     # Group pieces following R1-R5
│   ├── boardOptimizerService.ts    # 2D strip-packing algorithm
│   ├── parseCsvService.ts          # CSV file parsing + validation
│   └── parsePdfService.ts          # PDF table extraction + validation
├── application/validator.ts        # Piece field validation rules
├── presentation/controllers/
│   ├── uploadController.ts         # POST /api/upload handler
│   └── optimizeController.ts       # POST /api/optimize handler
└── routes/
    ├── upload.routes.ts
    └── optimize.routes.ts
```

#### Tipos de datos (TypeScript)

```typescript
// optimizer.types.ts

export type PieceTipo = 'TRX' | 'TBX';
export type PieceEspesor = 119 | 90 | 75;
export type PiecePropiedades = 'E' | 'H' | 'EE' | 'EH';

export type NotaClaveComponents = {
  tipo: PieceTipo;
  espesor: PieceEspesor;
  propiedades: PiecePropiedades;
  sequence: string;
};

export type Piece = {
  notaClave: string;
  components: NotaClaveComponents;
  packageNumber: string;
  name: string;
  length: number;   // mm — max 1200
  height: number;   // mm — max 2800
};

export type PlacedPiece = Piece & {
  x: number;        // mm from board left edge
  y: number;        // mm from board top edge
  placedLength: number;  // may differ from piece.length if rotated
  placedHeight: number;
  rotated: boolean;
};

export type BoardLayout = {
  boardIndex: number;
  boardGroupKey: string;   // e.g. "TRX.119.H"
  boardWidth: 1200;
  boardHeight: 2800;
  pieces: PlacedPiece[];
  usedArea: number;        // mm²
  wasteArea: number;       // mm²
  wastePercentage: number; // 0–100
};

export type BoardTypeSummary = {
  boardGroupKey: string;
  boardCount: number;
  pieceCount: number;
  averageWastePercentage: number;
};

export type OptimizationResult = {
  boards: BoardLayout[];
  summary: BoardTypeSummary[];
  totalBoards: number;
  totalPieces: number;
  overallWastePercentage: number;
  generatedAt: string; // ISO date
};

export type ParseResult = {
  pieces: Piece[];
  errors: Array<{ row: number; field: string; message: string }>;
};
```

#### Endpoints de la API

```
POST /api/upload
  Content-Type: multipart/form-data
  Body: { file: File }              ← CSV o PDF
  Response 200: ParseResult
  Response 400: { error: string, details: ValidationError[] }

POST /api/optimize
  Content-Type: application/json
  Body: { pieces: Piece[] }
  Response 200: OptimizationResult
  Response 400: { error: string }
  Response 422: { error: 'No valid pieces after grouping' }
```

#### Algoritmo de optimización (boardOptimizerService)

1. **Agrupar** las piezas por grupo de compatibilidad (`compatibilityService`)
2. **Por cada grupo**:
   a. Ordenar piezas por área descendente (mayor primero)
   b. Intentar colocar cada pieza en un tablero existente usando **Bottom-Left Fill**
   c. Si no cabe en ningún tablero existente, abrir un nuevo tablero
   d. En cada intento, probar la pieza en orientación normal y rotada; elegir la que produce menos desperdicio
3. **Calcular** área de desperdicio por tablero
4. **Devolver** todos los tableros + resumen

---

### Dependencias a instalar

**Backend**:
```bash
npm install multer csv-parse pdf-parse
npm install -D @types/multer
```

**Frontend**:
```bash
npm install react-dropzone
```

---

### Requisitos No Funcionales

| Requisito | Detalle |
|---|---|
| **Rendimiento** | Optimización < 5 s para archivos con hasta 500 piezas |
| **Impresión** | Diagramas correctamente escalados en A4 horizontal y vertical |
| **Validación** | Mensajes de error claros indicando fila, campo y motivo |
| **Seguridad** | Validar tipo MIME del archivo; rechazar archivos que no sean CSV o PDF |
| **Sin estado** | El servidor no guarda archivos ni resultados; todo se procesa y devuelve en la misma request |
| **Accesibilidad** | Todos los controles con `aria-label`; tablas con encabezados semánticos |
| **Cobertura de tests** | ≥ 90% en ramas, funciones, líneas y sentencias |

---

### Definition of Done

- [ ] Upload de CSV parsea correctamente con validación fila a fila
- [ ] Upload de PDF extrae la tabla correctamente
- [ ] El agrupador de compatibilidad respeta las reglas R1–R5 sin excepciones
- [ ] El optimizador coloca todas las piezas sin solapamientos en el mínimo de tableros
- [ ] Rotación de piezas implementada y activa cuando mejora el aprovechamiento
- [ ] Diagrama SVG muestra piezas, desperdicio y líneas de corte de forma clara
- [ ] Lista de piezas junto al diagrama, ordenada por Paquete Nº
- [ ] Resumen final con totales correctos por tipo y global
- [ ] Botón de imprimir genera una página por tablero con diagrama + lista
- [ ] Tests unitarios ≥ 90%: `noteKeyParserService`, `compatibilityService`, `boardOptimizerService`, `parseCsvService`
- [ ] Test Cypress E2E: sube CSV → optimiza → verifica número de tableros → imprime
- [ ] TypeScript strict mode activado; sin uso de `any`
- [ ] Sin base de datos ni persistencia; aplicación completamente stateless
