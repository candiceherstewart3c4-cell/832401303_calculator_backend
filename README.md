# Clover Calc Backend

Node.js HTTP API for safe expression evaluation and persistent calculation history.

Course: EE308FZ. FZU student ID: 832401303. MUID: 241215237.

## Stack and requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite` module)
- SQLite database stored at `data/calculator.sqlite`
- No third-party runtime dependencies

## Run

Clone this backend repository separately and run the following from its root. There are no third-party dependencies to install; no frontend checkout is required.

```bash
npm start
```

The API listens on `http://127.0.0.1:3000` by default. Optional environment variables:

- `PORT`: API port
- `HOST`: bind address, defaults to `127.0.0.1`; use `0.0.0.0` behind a public reverse proxy/container
- `DATABASE_PATH`: SQLite file path
- `FRONTEND_ORIGIN`: allowed CORS origin (defaults to `*` for classroom testing)
- `FRONTEND_DIR`: optional absolute frontend public-directory path; unset by default so this repository runs as an API-only service

The database and table are created automatically at startup. No manual initialization is required.

Example configuration in PowerShell:

```powershell
$env:PORT = '3187'
$env:FRONTEND_ORIGIN = 'http://127.0.0.1:4187'
$env:DATABASE_PATH = 'E:\calculator-data\calculator.sqlite'
npm start
```

Point the separate frontend at `http://127.0.0.1:3187/api`. The database parent directory is created automatically and must be writable. Variables are read from the process environment; `.env` files are not loaded automatically. For Linux/macOS use shell exports or deployment-provider environment settings instead.

For deployment set `HOST=0.0.0.0`, expose the service through HTTPS, set the frontend origin and keep `DATABASE_PATH` on a persistent disk. Back up the database while the service is stopped. Database files are ignored by Git; a clean clone creates a new empty database. Publishing code is not a database backup.

## API

- `POST /api/calculate` with `{ "expression": "(1+2)*3" }`
- Scientific example: `{ "expression": "sin(pi/6)", "angleMode": "rad" }`. `angleMode` is `deg` (default) or `rad`; other values return HTTP 400. Supported functions: `sqrt`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `log` (base 10), `ln`, `exp` (e^x), `exp10` (10^x); constants: `pi`, `e`. Explicit multiplication is required (`2*pi`).
- `GET /api/history`
- `GET /api/history?page=1&pageSize=10&q=sin&favorites=true`: full-database literal substring search in expression/result, optionally favorites only. Returns `history`, matching `total`, unfiltered `allTotal`, `page`, `pages`, `pageSize`. Page size defaults to 100, maximum 100; UI uses 10. Out-of-range pages clamp to the last page (empty history is page 1/1).
- `PATCH /api/history/:id/favorite` with `{ "favorite": true }` (or false); returns the updated record, missing ID returns 404.
- `POST /api/convert` with `{ "kind": "base", "value": "255", "from": 10, "to": 16 }`, or `{ "kind": "unit", "category": "length", "value": "1", "from": "km", "to": "m" }`. Success returns 201 with result, resultLabel, expression, details and saved record; invalid input returns 400 without saving.
- `DELETE /api/history/:id`
- `DELETE /api/history` (optional clear-all extension)
- `GET /api/health`

Expressions are parsed by a recursive-descent parser. `eval`, `exec`, and equivalent code execution are not used.

Successful calculations return HTTP 201 and `{ success, expression, result, angleMode, record }`. History records include id, expression, result, createdAt, angleMode, favorite, kind and details. History queries and successful deletions return HTTP 200. Bad expressions/input return 400, missing records or endpoints 404, and internal errors 500. Errors consistently return `{ "success": false, "message": "..." }`. Calculation expressions are limited to 200 characters and JSON bodies to 4096 bytes; invalid calculations are not inserted into history.

Responses and history records include `angleMode`. An additive SQLite migration adds `angle_mode` to existing databases without deleting records (old entries default to `deg`). Tangent at odd quarter turns returns an error and is not saved. Standard floating-point precision limits still apply, especially for very large angles and values near tangent poles.

Inverse trig returns degrees or radians according to `angleMode`. Logarithms require positive arguments; asin/acos require [-1, 1]. Powers use `^`, bind above unary signs and associate right: `-2^2 = -4`, `2^-3 = 0.125`, `2^3^2 = 512`. Zero to a non-positive power, non-real powers and non-finite results return HTTP 400 and are not stored. This is a floating-point calculator, not a symbolic algebra system.

Use a persistent disk for DATABASE_PATH when deploying. Set FRONTEND_ORIGIN to the frontend HTTPS origin and expose the API through HTTPS. History and favorites are shared among visitors; accounts are not implemented. All records can be searched and paginated. Arithmetic and unit conversion use JavaScript floating point, rounded to 15 significant digits; integer base conversion uses BigInt and is exact.

## Conversion limits and persistence

Base conversion accepts signed integer strings with 1–128 digits and bases 2, 8, 10, 16. Omit prefixes (0x/0b), fractions and scientific notation. Negative numbers use a minus sign, not fixed-width two's complement.

Unit conversion supports length (mm, cm, m, km), mass (mg, g, kg), temperature (C, F, K). Input must be a decimal string; negative length/mass and temperatures below absolute zero are rejected. Length uses metres as the base; mass uses kilograms. Temperature uses Celsius with F = C×9/5+32 and K = C+273.15.

Additive migrations preserve existing rows and add `favorite` (default 0), `kind` (default calculate), `details` (JSON conversion inputs). Conversion recall uses details rather than parsing display text. A favorite/id index supports favorite filtering. Search uses parameterized `instr` queries (literal %, _ and SQL-looking strings are not wildcards or executable SQL). Clear history removes every record, including favorites, regardless of UI filters.

## Test

```bash
npm test
```
