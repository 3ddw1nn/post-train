# GIPHY GIF Search Setup

Use this as a reusable starting spec when building a new project that needs a GIF search/adder feature.

## 1. Reusable Pattern

This project implements GIF search as a client-side picker component that is owned by a message/comment composer.

- The GIF search UI lives in `src/components/blog/GifPicker.tsx`.
- The composer that opens the picker, stores the selected GIF, previews it, and submits it lives in `src/components/blog/CommentSection.tsx`.
- The picker uses `@giphy/js-fetch-api` and `@giphy/react-components`.
- `GifPicker` creates a `GiphyFetch` client with `process.env.NEXT_PUBLIC_GIPHY_API_KEY`.
- `GifPicker` returns only `{ url, title }` to its parent through `onSelect`.
- `CommentSection` stores the selected GIF in local React state as `selectedGif`.
- On submit, `CommentSection` sends the selected GIF URL as `gif_url` to `POST /api/comments`.
- The database stores only `gif_url`, not the full GIPHY object.

The reusable shape is:

1. Composer owns `showGifPicker` and `selectedGif`.
2. GIF button toggles the picker.
3. Picker searches/trends with GIPHY and calls `onSelect(gif)`.
4. Composer shows a removable preview.
5. Submit payload includes the selected GIF fields.
6. Backend validates that text or GIF exists.
7. Stored content renders the GIF URL with an image component.

## 2. Desired UX

Users open the GIF picker from a GIF button in the composer toolbar.

Project references:

- `GifBadge` renders the visible GIF button label in `src/components/blog/CommentSection.tsx`.
- `showGifPicker` controls whether the picker is mounted.
- The button at `CommentSection` renders `<GifPicker />` when `showGifPicker` is true.
- `GifPicker` renders as an anchored desktop popover and a full-width mobile sheet.
- The picker auto-focuses the search input after opening.
- Users can close the picker by clicking the close button, pressing Escape, clicking outside, or tapping the mobile backdrop.
- After selecting a GIF, the picker closes and focus returns to the textarea.
- The selected GIF appears as a preview above the composer fields with a remove button.
- The send button appears when either text exists or a GIF is selected.

Useful implementation details from this project:

- `GifPicker` tracks `visible` for open/close animation.
- It uses `visualViewport` on mobile so the sheet stays above the soft keyboard.
- It locks body scroll on mobile while open.
- It measures the picker container with `ResizeObserver` and passes the calculated width to GIPHY `Grid`.

## 3. Environment Variables

This project uses:

```env
NEXT_PUBLIC_GIPHY_API_KEY=
```

References:

- `.env.example` includes `NEXT_PUBLIC_GIPHY_API_KEY`.
- `src/components/blog/GifPicker.tsx` reads `process.env.NEXT_PUBLIC_GIPHY_API_KEY`.

Because the variable starts with `NEXT_PUBLIC_`, the key is exposed to browser JavaScript. Treat this as a public client key. Do not put a secret server-only GIPHY key in a `NEXT_PUBLIC_` variable.

For a new project, choose one of these approaches:

- Client-side pattern matching this project: use `NEXT_PUBLIC_GIPHY_API_KEY` and call GIPHY from the picker.
- Safer server-side pattern: use `GIPHY_API_KEY` without `NEXT_PUBLIC_`, create a backend search endpoint, and have the picker call your backend.

## 4. GIPHY API Usage

This project uses the GIPHY JavaScript SDK rather than manually building fetch URLs.

Dependencies:

```json
"@giphy/js-fetch-api": "^5.7.0",
"@giphy/js-types": "^5.1.0",
"@giphy/react-components": "^10.1.1"
```

The picker creates the SDK client:

```ts
const gf = new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY!);
```

Search behavior in `fetchGifs(offset)`:

- If the search query is non-empty, call `gf.search(...)`.
- If the search query is empty, call `gf.trending(...)`.
- Results use `limit: 20`.
- Results pass the GIPHY pagination `offset` through from `Grid`.
- Rating is restricted with `rating: "g"`.
- The picker supports two tabs:
  - `GIFs`: normal GIF search/trending.
  - `Stickers`: search/trending with `type: "stickers"`.

Underlying GIPHY REST endpoints used by the SDK:

- Search: `GET https://api.giphy.com/v1/gifs/search`
- Trending GIFs: `GET https://api.giphy.com/v1/gifs/trending`
- Sticker search: `GET https://api.giphy.com/v1/stickers/search`
- Trending stickers: `GET https://api.giphy.com/v1/stickers/trending`

The exact endpoint is selected by `gf.search` or `gf.trending` plus the optional `type: "stickers"` setting.

## 5. Backend API

This project does not have a backend route for GIPHY search. GIPHY search happens directly in `src/components/blog/GifPicker.tsx` in the browser.

The backend route involved in storing selected GIFs is `src/app/api/comments/route.ts`.

Relevant behavior:

- `POST /api/comments` accepts `gif_url?: string`.
- It requires `post_slug` and either a text body or `gif_url`.
- It checks profanity for comment text/name/reply metadata.
- It enforces a max text length of 2000 characters.
- It inserts `gif_url` into the `comments` table.
- It returns the created comment with `gif_url`.
- `GET /api/comments` selects and returns `gif_url` for rendering.

Database schema references:

- `neon/schema.sql` defines `comments.gif_url text`.
- `supabase/schema_seed.sql` defines `public.comments.gif_url text`.

If you want to keep the GIPHY API key server-side in a future project, add a route like `GET /api/gifs/search?q=&offset=&type=` that:

- Reads `process.env.GIPHY_API_KEY`.
- Calls the GIPHY REST API from the server.
- Applies a safe `rating` such as `g` or `pg`.
- Validates and clamps `limit` and `offset`.
- Returns only the fields the frontend needs.
- Adds basic rate limiting by user/session/IP.

## 6. Frontend Components

Core components and functions from this project:

- `GifPicker` in `src/components/blog/GifPicker.tsx`
  - Props: `onSelect`, `onClose`.
  - State: `tab`, `query`, `width`, `isMobile`, `visible`, `vv`.
  - Hook: local `useDebounce(value, delay)`.
  - Function: `fetchGifs(offset)`.
  - Function: `handleGifClick(gif, e)`.
  - Uses GIPHY `Grid` to display and paginate results.

- `CommentSection` in `src/components/blog/CommentSection.tsx`
  - State: `selectedGif`.
  - State: `showGifPicker`.
  - Function: `submit()`.
  - Function: `renderComment(comment, isReply)`.
  - Uses `GifPicker` inside the composer toolbar.
  - Renders selected GIF previews before submit.
  - Renders saved comment GIFs from `comment.gif_url`.

- `CommentSectionLoader` in `src/components/blog/CommentSectionLoader.tsx`
  - Dynamically imports `CommentSection` with `ssr: false`.
  - This avoids an SSR crash because `@giphy/js-util` references Node.js `global`.

Image configuration:

- `next.config.ts` allows remote images from `media.giphy.com` and `media0.giphy.com` through `media4.giphy.com`.
- GIF images are rendered with Next `Image` and `unoptimized`.

## 7. Data Model / Stored GIF Fields

This project stores a minimal GIF model.

Selected GIF in React state:

```ts
{
  url: string;
  title: string;
}
```

Submitted API field:

```ts
gif_url: selectedGif?.url ?? null
```

Database field:

```sql
gif_url text
```

Fields currently stored:

- `url`: yes, stored as `comments.gif_url`.
- `title`: only kept temporarily in frontend state for preview alt text before submit.
- `preview URL`: no.
- `width`: no.
- `height`: no.
- `attribution`: no.
- `original GIPHY ID`: no.
- Full GIPHY object: no.

The selected URL is chosen in `GifPicker.handleGifClick`:

```ts
const url = gif.images.downsized?.url || gif.images.original?.url || "";
onSelect({ url, title: gif.title });
```

For a reusable future project, consider storing a richer object:

```ts
type StoredGif = {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  width: number | null;
  height: number | null;
  source: "giphy";
  attribution: "Powered by GIPHY";
};
```

## 8. Insert GIF Flow

Current flow:

1. User clicks the GIF button in `CommentSection`.
2. `showGifPicker` toggles true.
3. `CommentSection` renders `GifPicker`.
4. User searches or browses trending results.
5. User clicks a GIF in GIPHY `Grid`.
6. `GifPicker.handleGifClick` chooses `gif.images.downsized.url` or falls back to `gif.images.original.url`.
7. `GifPicker` calls `onSelect({ url, title })`.
8. `CommentSection` sets `selectedGif`, closes the picker, and focuses the textarea.
9. `CommentSection` shows a removable preview.
10. On submit, `POST /api/comments` receives `gif_url`.
11. The backend inserts `gif_url` into the comment row.
12. Comment rendering checks `comment.gif_url` and displays the image.

The GIF is not inserted into the text body as Markdown. It is stored as a separate field alongside the text body.

## 9. Loading, Empty, and Error States

GIF picker states:

- Empty search query shows trending GIFs or trending stickers.
- No results are displayed through GIPHY `Grid` with `noResultsMessage`: `No results found.`
- Search input has a clear button when `query` is non-empty.
- The project relies on `@giphy/react-components` `Grid` for result loading and infinite loading behavior.
- There is no custom GIPHY error UI in this project.

Comment/composer states related to GIFs:

- `canSend` is true when text exists or `selectedGif` exists.
- Selected GIF preview can be removed before submit.
- Submit errors from `POST /api/comments` are shown in `errorMsg`.
- Comment list loading shows `Loading comments...`.
- Empty comments show `No messages yet.` and `Be the first to say something!`.
- Comment pagination shows `Loading more...` and `End of thread`.

Debounce, pagination, and defaults:

- Search is debounced by 400 ms with `useDebounce`.
- GIPHY results request `limit: 20`.
- GIPHY pagination uses `offset` from `Grid`.
- Empty query defaults to trending results.
- Switching between `GIFs` and `Stickers` clears the query.
- Search/result cache resets by keying `Grid` with `${tab}-${debouncedQuery}`.
- No project-specific rate limiting is applied to GIPHY search.

## 10. Privacy And Safety Rules

Rules from this implementation:

- The current GIPHY API key is public because it uses `NEXT_PUBLIC_GIPHY_API_KEY`.
- Do not commit real environment values. Keep real keys in `.env.local` or the hosting provider's environment manager.
- Use GIPHY `rating: "g"` for safer search results.
- Store only the GIF URL unless the product needs richer metadata.
- Keep text moderation separate from GIF search. This project checks profanity for comment text/name/reply metadata, but it does not moderate selected GIF content beyond GIPHY rating.
- Include GIPHY attribution. This picker hides built-in grid attribution with `hideAttribution` but renders its own `Powered by GIPHY` label.
- Allow only GIPHY media hosts in the image allowlist when using Next `Image`.
- Validate backend submit payloads so an empty message cannot be created unless a GIF is present.
- If using a server-side GIPHY route, add rate limiting and do not expose the server API key to clients.
- Consider storing the original GIPHY ID in future projects so deleted/problematic GIFs can be audited or rehydrated.

## 11. What To Tell The AI Building The Project

Use this prompt when asking an AI to build the feature in another app:

```text
Build a reusable GIPHY GIF picker for the message/comment composer.

Use the same pattern as this reference:
- A client picker component owns search UI, tabs for GIFs/Stickers, debounced input, GIPHY result grid, empty state, close behavior, and selection.
- The parent composer owns `showGifPicker` and `selectedGif`.
- The GIF button toggles the picker.
- Selecting a GIF returns a normalized object to the parent, closes the picker, focuses the text input, and shows a removable preview.
- Submitting content sends text plus a separate GIF field to the backend.
- Rendering saved content displays the GIF from the stored field, not inline Markdown.

Prefer a server-side GIPHY proxy if the API key must stay private. If using the browser SDK, use `NEXT_PUBLIC_GIPHY_API_KEY` and treat it as public.

Use GIPHY search/trending with a safe rating, default empty queries to trending results, debounce search input, paginate with offset, include GIPHY attribution, and handle loading/empty/error states.

Store at least `url` and `title`; for a more complete implementation also store `id`, `previewUrl`, `width`, `height`, `source`, and attribution.
```

## 12. What Matters Most

- Keep the picker reusable: it should only search/select GIFs and report the selected object.
- Keep composer state in the parent: opening, closing, previewing, removing, and submitting belong to the composer.
- Decide early whether the GIPHY key is public or server-side.
- Use `rating: "g"` or another intentional rating limit.
- Default empty searches to trending results so the picker never opens blank.
- Debounce user input and paginate with `offset`.
- Store GIFs as structured content separate from message text.
- Include GIPHY attribution.
- In this project, only `gif_url` is persisted; richer metadata requires a schema/API change.
