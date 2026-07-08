# Аудит репозитория `ai-consultant-copilot`

Дата: 2026-06-15

## 1. Что это за проект

**AI Consultant Copilot** — сервис, который принимает структурированное описание бизнес-кейса клиента (компания, проблема, текущий процесс, данные, ограничения, цели) и с помощью LLM генерирует консультационный отчёт: обнаруженные проблемы, AI-возможности, рекомендованное решение, риски, план валидации и план MVP.

Каждый запуск анализа сохраняется в БД вместе с метриками (стоимость, токены, задержка, качество) — это задел под сравнение моделей и оценку качества (LLM evaluation pipeline).

Архитектура: **монорепозиторий из двух частей** — `server` (бэкенд) и `client` (фронтенд).

```
ai-consultant-copilot/
├── server/   ← Express + Prisma + Groq (основная логика)
└── client/   ← Next.js (пока пустой шаблон create-next-app)
```

---

## 2. Технологический стек

| Слой | Технологии |
|------|-----------|
| Бэкенд | Node.js, TypeScript (ESM), Express 5, Prisma 7 ORM |
| БД | PostgreSQL 16 (через Docker) |
| LLM | Groq SDK (провайдер абстрагирован, заложены openai/anthropic) |
| Валидация | Zod 4 |
| Фронтенд | Next.js 16, React 19, Tailwind CSS 4 |
| Инфраструктура | docker-compose (только Postgres) |

---

## 3. Карта файлов

### Корень

| Файл | Зачем нужен |
|------|-------------|
| `docker-compose.yml` | Поднимает контейнер PostgreSQL 16 для локальной разработки. Параметры берутся из `.env`. |
| `.env` | Переменные окружения (учётные данные Postgres, `DATABASE_URL`). **Не в git** (см. замечания). |
| `.gitignore` | Исключает `.env`, `node_modules`, сборки, логи. |

### `server/` — конфигурация

| Файл | Зачем нужен |
|------|-------------|
| `package.json` | Зависимости и скрипты: `dev` (tsx watch), `typecheck`, `llm:test`. |
| `tsconfig.json` | Настройки компилятора TypeScript (ESM). |
| `prisma.config.ts` | Конфиг Prisma: путь к схеме, миграциям и `DATABASE_URL`. |
| `.gitignore` | Исключает `node_modules`, `.env`, сгенерированный клиент Prisma. |

### `server/prisma/` — база данных

| Файл | Зачем нужен |
|------|-------------|
| `schema.prisma` | **Главная модель данных.** Две таблицы: `ClientCase` (входной кейс клиента) и `AnalysisRun` (результат прогона LLM + метрики). Плюс набор enum'ов (размер компании, частота процесса, доступность данных и т.д.). |
| `migrations/*` | История миграций БД (init → обновления схемы кейса → добавление `AnalysisRun` → добавление полей оценки качества). |
| `migrations/migration_lock.toml` | Фиксирует провайдер БД (postgresql). |

### `server/src/` — точка входа

| Файл | Зачем нужен |
|------|-------------|
| `server.ts` | Точка входа. Подключается к БД, запускает HTTP-сервер на порту (по умолчанию 4000). |
| `app.ts` | Конфигурация Express: CORS, JSON-парсер, маршрут `/health`, подключение роутера `/cases`. |

### `server/src/routes/` — HTTP-слой

| Файл | Зачем нужен |
|------|-------------|
| `cases.ts` | Три эндпоинта: `POST /cases` (создать кейс), `GET /cases/:id/analysis-runs` (история прогонов), `POST /cases/:id/analyze` (запустить анализ через LLM). Валидирует вход через Zod. |

### `server/src/services/` — бизнес-логика

| Файл | Зачем нужен |
|------|-------------|
| `analysis.service.ts` | **Оркестратор анализа.** Собирает промпт → вызывает LLM → парсит/валидирует ответ → считает стоимость → оценивает качество → сохраняет `AnalysisRun` в БД → возвращает отчёт. |

### `server/src/lib/` — инфраструктурные утилиты

| Файл | Зачем нужен |
|------|-------------|
| `prisma.ts` | Единый экземпляр Prisma Client (с pg-адаптером). Проверяет наличие `DATABASE_URL`. |
| `llm-client.ts` | **Абстракция над LLM.** Выбирает провайдера, замеряет задержку, возвращает унифицированный ответ. Сейчас реализован только Groq. |
| `llm-config.ts` | Читает `LLM_PROVIDER` и `LLM_MODEL` из env, валидирует. |
| `providers/groq.provider.ts` | Конкретная реализация вызова Groq API (chat completions, usage-токены). |
| `parse-consultant-report.ts` | Парсит ответ LLM в JSON и валидирует по схеме. Возвращает флаги `jsonParseSuccess` / `schemaValid`. |
| `parse-llm-json.ts` | Низкоуровневый безопасный `JSON.parse` с понятной ошибкой. |
| `validate-consultant-report.ts` | Обёртка над Zod-схемой отчёта. |

### `server/src/schemas/` — валидация (Zod)

| Файл | Зачем нужен |
|------|-------------|
| `client-case.schema.ts` | Схема входных данных кейса (что присылает клиент в `POST /cases`). |
| `consultant-report.schema.ts` | Схема выходного отчёта LLM. Гарантирует, что модель вернула корректную структуру (enum'ы подходов, рисков, методов валидации и т.д.). |

### `server/src/prompts/` — промпты

| Файл | Зачем нужен |
|------|-------------|
| `build-analysis-prompt.ts` | Строит текст промпта: инструкция «верни только JSON по этой структуре» + сериализованный кейс клиента. |

### `server/src/evaluation/` — оценка качества и стоимости

| Файл | Зачем нужен |
|------|-------------|
| `evaluate-analysis-output.ts` | Формирует объект оценки прогона. **Сейчас оценки качества захардкожены в `medium`** (заглушка). |
| `calculate-llm-cost.ts` | Считает стоимость в USD по числу токенов (тарифы вшиты: $0.59/$0.79 за 1M). |
| `evaluation.types.ts` | Типы результата оценки. |

### `server/src/repositories/` — доступ к данным

| Файл | Зачем нужен |
|------|-------------|
| `analysis-run.repository.ts` | CRUD для `AnalysisRun`: `createAnalysisRun` и `getAnalysisRunsByCaseId`. |

### `server/src/scripts/` — служебные скрипты

| Файл | Зачем нужен |
|------|-------------|
| `test-llm.ts` | Ручная проверка связи с LLM (`npm run llm:test`). |
| `parse-llm-json.ts` | **Дубликат** `lib/parse-llm-json.ts` (см. замечания). |

### `client/` — фронтенд (Next.js)

| Файл | Зачем нужен |
|------|-------------|
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Стандартный стартовый шаблон create-next-app — **реальный UI ещё не написан**. |
| `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs` | Конфигурация Next.js / TS / Tailwind / ESLint. |
| `CLAUDE.md` / `AGENTS.md` | Заметка: используется новая версия Next.js с breaking changes — перед написанием кода смотреть `node_modules/next/dist/docs/`. |
| `public/*.svg` | Иконки шаблона. |

---

## 4. Поток данных (как работает)

```
Клиент
  │  POST /cases  (JSON кейса)
  ▼
cases.ts ──► client-case.schema (Zod) ──► prisma.clientCase.create ──► БД
  │
  │  POST /cases/:id/analyze
  ▼
analysis.service.ts
  ├─► build-analysis-prompt   (промпт из кейса)
  ├─► callLlm → groq.provider (вызов Groq)
  ├─► parseConsultantReport   (JSON + Zod-валидация)
  ├─► calculateLlmCost        (стоимость)
  ├─► evaluateAnalysisOutput  (оценка — пока заглушка)
  └─► createAnalysisRun       (сохранить прогон в БД)
        │
        ▼
   Ответ: { report, evaluation }
```

---

## 5. Состояние и замечания

### ⚠️ Незакоммиченные изменения
В рабочей директории есть несохранённые правки и **новая миграция** `20260524172218_add_evaluation_levels_to_analysis_run` (добавляет в `AnalysisRun` поля `relevance`, `hallucinationRisk`, `businessValue`, `actionability`). Затронуты `schema.prisma`, `analysis-run.repository.ts`, `analysis.service.ts`. Стоит закоммитить как единое изменение.

### 🔴 Проблемы

1. **Заглушка оценки качества.** `evaluate-analysis-output.ts` всегда возвращает `medium` для relevance / hallucinationRisk / businessValue / actionability. Поля пишутся в БД, но реальной логики оценки (LLM-judge или эвристики) нет — это ключевой недоделанный кусок.

2. **Дубликат файла.** `scripts/parse-llm-json.ts` идентичен `lib/parse-llm-json.ts`. Скрипт-версия нигде не используется — стоит удалить.

3. **Несогласованность типов оценки стоимости.**
   - `evaluation.types.ts` объявляет два поля: `costEstimate?` и `costEstimateUsd?`. Используется только `costEstimateUsd`, `costEstimate` — мёртвое.
   - В `calculate-llm-cost.ts` тарифы Groq вшиты в код магическими числами — стоит вынести в конфиг рядом с моделью.

4. **`promptVersion` не заполняется.** Поле есть в схеме БД и в репозитории, но `analysis.service.ts` его не передаёт — всегда `null`. Для сравнения версий промптов (ради чего поле и заведено) его нужно прокидывать.

5. **Фронтенд не реализован.** `client/` — пустой стартовый шаблон. Весь UX ещё впереди.

6. **Нет тестов.** Скрипт `test` в `server/package.json` — заглушка (`exit 1`). Учитывая критичность парсинга/валидации ответов LLM, юнит-тесты на `parseConsultantReport` и схемы были бы полезны.

7. **`.env` в корне не в git, но лежит в рабочей папке.** Это нормально (секреты), но **нет `.env.example`** — новому разработчику непонятно, какие переменные нужны (`POSTGRES_*`, `DATABASE_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `GROQ_API_KEY`, `PORT`).

8. **Нет README.** Инструкций по запуску (поднять Postgres → миграции → `npm run dev`) в репозитории нет.

### 🟡 Мелочи / стиль

- Непоследовательное форматирование (смешанные отступы) в `cases.ts`, `analysis.service.ts`, `evaluate-analysis-output.ts` — стоит прогнать Prettier.
- В `groq.provider.ts` клиент `new Groq()` создаётся при каждом вызове — можно вынести на уровень модуля.
- `app.use(cors())` открыт для всех источников — допустимо для разработки, перед продакшеном ограничить.

---

## 6. Краткие рекомендации (по приоритету)

1. Закоммитить текущие изменения вместе с новой миграцией.
2. Реализовать настоящую логику в `evaluate-analysis-output.ts` (это сердце «evaluation pipeline»).
3. Добавить `.env.example` и `README.md` с инструкцией запуска.
4. Удалить дубликат `scripts/parse-llm-json.ts`; почистить мёртвое поле `costEstimate`.
5. Прокидывать `promptVersion` в `createAnalysisRun`.
6. Добавить юнит-тесты на парсинг/валидацию ответов LLM.
7. Начать реальный фронтенд в `client/`.
