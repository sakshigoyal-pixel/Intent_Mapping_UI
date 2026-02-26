# Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**: copy **Project URL** and **service_role** key (not anon).
3. Add to `server/.env`:
   ```env
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
4. In Supabase **SQL Editor**, run the migrations in order:
   - Run `server/supabase/migrations/001_initial.sql`
   - Run `server/supabase/migrations/002_timestamp_rows.sql`

This creates:

- **annotations** – intent annotations (replaces `db.json` / MongoDB)
- **queue** – video queue state (replaces `queue.json`)
- **timestamps** – legacy one-row-per-video segments (jsonb)
- **timestamp_rows** – segment rows with `video_name`, `start`, `end` (all strings). The API uses this for segments: it looks up by **video name** (same as in the queue) and parses `start`/`end` (e.g. `00:12`, `01:30`) to seconds.

**Segments for the playing video:** Use the **same name** in `timestamp_rows.video_name` as in the queue (e.g. `4D4AjB2wQPKmHUaNqcAOgA/qsZcY3KWRTCURHuNruepVg`). Then `GET /api/timestamps/:folder/:file` returns segments for that video.

**Import CSV rows:** `POST /api/timestamps/rows` with body `{ "rows": [ { "video_name": "ab", "start": "00:12", "end": "00:34" }, ... ] }`. Or import your CSV into the `timestamp_rows` table in Supabase (columns: `video_name`, `start`, `end`).

Videos are still served from local cache or remote URLs; only metadata and annotations move to Supabase.
