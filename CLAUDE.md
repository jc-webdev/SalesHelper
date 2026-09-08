# Oqla Sales Assistant

React SPA do zarządzania sprzedażą (CRM w stylu kanban) dla klubów padlowych — zespół dzwoni do klubów, prowadzi ich przez skrypt rozmowy, planuje spotkania i śledzi status na tablicy. Dane trzymane w Supabase (Postgres), z fallbackiem do localStorage gdy Supabase nie jest skonfigurowany.

## Stack

- **Frontend**: React 18 + Vite, jeden plik `src/App.jsx` (cały stan i UI), style w `src/styles.css` (bez CSS-in-JS, bez frameworka CSS).
- **Backend**: Supabase (auth + Postgres + RLS) jako główny magazyn danych.
- **Serverless API** (`api/*.js`, format Vercel-style `(req, res)`): operacje wymagające `SUPABASE_SERVICE_ROLE_KEY`, których nie da się zrobić z klienta (tworzenie kont zespołu, listowanie userów, reset hasła).
- **Lokalny dev serwer API**: `local-api-server.mjs` — czysty `node:http`, montuje handlery z `api/` pod `http://127.0.0.1:8787`, bo Vite dev server nie hostuje funkcji serverless. Uruchamiany równolegle z `vite dev`.

## Jak to uruchomić

```
npm install
npm run dev              # Vite na :5173
node local-api-server.mjs  # w drugim terminalu, obsługuje /api/*
```

Zmienne środowiskowe (patrz `.env.example`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — używane przez frontend (`src/supabaseClient.js`).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — używane tylko przez `api/*.js` (server-side, nigdy nie trafiają do bundla).

Bez skonfigurowanego Supabase aplikacja działa w trybie lokalnym: dane w `localStorage`, bez logowania/zespołu/wspólnych notatek.

## Model danych (`supabase/schema.sql`)

- `clubs` — jeden wiersz na klub; kolumny `call_status`, `planned_today`, `call_note` są zdenormalizowane dla filtrowania/RLS, a pełny obiekt klubu (w tym `notesTimeline`, `scheduledMeetings`) leży w `payload jsonb`.
- `profiles` — 1:1 z `auth.users`, tworzony automatycznie triggerem `handle_new_user` przy rejestracji; `is_admin` steruje dostępem do panelu admina.
- `shared_memos` — notatki widoczne dla całego zespołu (nie per-klub).
- RLS: każdy zalogowany user widzi wszystkie kluby i memo; profil może edytować tylko siebie (lub admin — dowolny, przez `is_admin_user()`).

## Struktura `src/App.jsx`

Jeden komponent `App()` trzyma cały stan (auth, kluby, kalendarz, panel admina, import CSV) i renderuje wszystko przez lokalne funkcje `render*`. Z grubsza w pliku:

1. **Stałe i słownik statusów** (na górze) — `STATUS_*`, `COLUMN_DEFINITIONS` (kolumny tablicy kanban), `conversationNodes` (drzewo skryptu rozmowy sprzedażowej — każdy węzeł to `title`/`script`/`buttons` z przejściami do kolejnych węzłów).
2. **Czyste funkcje pomocnicze** (przed `export default function App()`) — normalizacja statusu/klubu, import/eksport CSV (własny mini-parser, nie biblioteka), mapowanie klub ↔ wiersz Supabase, routing przez query string (`?mode=conversation&club=...`).
3. **`App()`** — stan (dużo `useState`), efekty synchronizujące z Supabase (sesja, auto-zapis klubów z debounce, wspólne notatki), potem funkcje `render*` dla poszczególnych widoków: ekran logowania, panel admina, modal ręcznego dodania klubu, timeline notatek, kalendarz spotkań, karta klubu, modal szczegółów klubu, widok rozmowy (skrypt sprzedażowy).

Dwa widoki główne, przełączane przez `state.view` i odzwierciedlane w URL: `list` (tablica kanban) i `conversation` (skrypt rozmowy krok po kroku dla wybranego klubu).

## Ważne dla dalszej pracy

- Import CSV robi dopasowanie po nazwie klubu + mailu i pokazuje ekran konfliktów (`importReview`) do ręcznego wyboru, które pola nadpisać — nie nadpisuje cicho.
- `oqla_sales_assistant.html` to starszy, samodzielny prototyp (vanilla HTML/CSS/JS) sprzed przepisania na React — nieużywany przez appkę, trzymany jako referencja w `legacy/`.
- Pliki CSV w katalogu głównym (`Kamery na kortach - Status*.csv`, `import_test.csv`) to lokalne dane robocze, celowo w `.gitignore` — nie commitować.
