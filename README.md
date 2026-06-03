# Pladurcuter — Optimizador de Cortes de Pladur

Aplicación web para optimizar el uso de tableros de pladur **1.200 × 2.800 mm**, minimizando el desperdicio de material a partir de listas de corte en formato CSV o PDF.

## ¿Qué hace?

1. **Carga** un archivo CSV o PDF con la lista de piezas a cortar
2. **Agrupa** las piezas por tipo de tablero respetando las reglas de compatibilidad (R1–R5)
3. **Optimiza** la distribución usando el algoritmo Shelf / First-Fit Decreasing (FFD)
4. **Genera** diagramas SVG de cada tablero con líneas de corte y zona de desperdicio
5. **Imprime** un plan de producción (una página por tablero) listo para enviar a fábrica
6. **Muestra** un resumen con tableros usados, piezas totales y % de desperdicio por tipo

---

## Estructura del repositorio

```
pladurcuter/
├── server.js              # Servidor Express: parsing CSV/PDF + algoritmo de optimización
├── package.json
├── public/
│   ├── index.html         # Página única (upload → resultados → impresión)
│   ├── app.js             # Lógica cliente + renderizado SVG
│   └── styles.css         # Estilos + CSS de impresión
├── test-sample.csv        # CSV de ejemplo para probar
└── ai-specs/
    ├── specs/             # Estándares de desarrollo (backend, frontend, documentación)
    ├── .commands/         # Comandos reutilizables para agentes AI
    ├── .agents/           # Definiciones de roles de agentes AI
    └── changes/
        └── PLADURCUTER-1-Board-Cut-Optimizer.md  # Historia de usuario enriquecida
```

---

## Inicio rápido

### Requisitos

- Node.js v16+
- npm

### Instalación y arranque

```bash
git clone https://github.com/pacb9148/pladurcuter.git
cd pladurcuter
npm install
npm start
```

Abre el navegador en **<http://localhost:3000>**

---

## Formato del archivo de entrada

### CSV

| Columna             | Descripción                                               | Restricción        |
| ------------------- | --------------------------------------------------------- | ------------------ |
| Nota Clave          | Código de producción `[TIPO].[ESPESOR].[PROP].SC.[SEQ]`  | Ver tabla de tipos |
| Paquete Nº          | Orden de almacenamiento                                   | —                  |
| Nombre              | Identificador de la pieza                                 | —                  |
| Longitud            | Anchura de la pieza                                       | ≤ 1.200 mm         |
| Altura desconectada | Altura de la pieza                                        | ≤ 2.800 mm         |

Los valores pueden estar en **milímetros** (1200) o en **metros** (1,20) — la aplicación los detecta automáticamente.

### Nota Clave

```
[TIPO].[ESPESOR].[PROP].SC.[SEQ]

TIPO:     TRX (Trasdosado) | TBX (Tabique)
ESPESOR:  119 | 90 | 75
PROP:     E (Estándar) | H (Hidrofugo) | EE (Estándar doble cara) | EH (Estándar hidrofugo)
SEQ:      Número de secuencia (000, 001, ...)

Ejemplo: TRX.119.H.SC.005
```

### PDF

La aplicación extrae la tabla automáticamente del PDF. Se recomienda el formato CSV para mayor fiabilidad.

---

## Reglas de compatibilidad de tableros

| Regla | Descripción                                                           |
| ----- | --------------------------------------------------------------------- |
| R1    | No se mezclan cortes de distinto ESPESOR en el mismo tablero          |
| R2    | Cortes H o EH no pueden ir en tableros E o EE                         |
| R3    | Cortes TBX no pueden ir en tableros TRX, ni viceversa                 |
| R4    | Cortes TRX H no pueden ir en tableros TRX E                           |
| R5    | Cortes TRX E/EE **sí pueden** ir en tableros TRX H del mismo espesor  |

---

## Flujo de trabajo AI (comandos disponibles)

El proyecto incluye comandos para desarrollo asistido por AI:

```
/enrich-us        → Enriquecer una historia de usuario con criterios de aceptación
/plan-backend-ticket  → Generar plan de implementación backend
/plan-frontend-ticket → Generar plan de implementación frontend
/develop-backend  → Implementar siguiendo el plan backend
/develop-frontend → Implementar siguiendo el plan frontend
/commit           → Crear commit y PR profesional
```

---

## Stack tecnológico

- **Backend**: Node.js + Express + Multer + csv-parse + pdf-parse
- **Frontend**: HTML5 + Bootstrap 5 + SVG (vanilla JS, sin frameworks)
- **Algoritmo**: Shelf Packing / First-Fit Decreasing con rotación automática de piezas

---

## Licencia

MIT — Copyright (c) 2025 pacb9148
