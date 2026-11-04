# Photos: upload, lightbox, public photo link

## Sub-features

- "+ Tambah" in the Foto block (`input[type=file]`, up to `PHOTO_MAX_PER_GROUP`, default 20).
- Upload sequence: browser compression in a worker (`/vendor/...`), `POST /api/photos/upload` mints
  a client token (JPEG only, 1.5 MB cap, random suffix, 10 min expiry), the browser PUTs straight
  to Blob, then the `attachPhoto` server action writes the `expense_photos` row with width, height
  and size.
- Gallery thumbnails ("Buka foto N dari M") via `next/image`; the lightbox ("Simpan foto",
  "Bagikan foto", "Hapus").
- "Bagikan foto" mints a `photo_share_links` token; `/f/<token>` shows the photo signed out.
- The upload route refuses signed-out callers and groups the caller does not own.

## How to get to it (user POV)

Open an expense, tap "+ Tambah" under Foto, pick a picture. Tap the thumbnail to open it, then the
share icon.

## Driving it with verify.sh

```sh
$V ui RUN $S/photo.mjs -- demoGroup002
$V sql RUN "select p.group_id, p.blob_pathname, p.width, p.height, p.size_bytes, s.token from expense_photos p left join photo_share_links s on s.photo_id = p.id"
$V blobs RUN photos/
```

End state: transcript `photos: 0 -> 1`, `photo share link copied to the clipboard ("Tautan disalin")`,
`result: PASS`; `-1-attached.png` shows the thumbnail, `-2-shared.png` the receipt in the lightbox.
SQL: one row, `demoGroup002`, pathname `photos/<21 chars>-<30 chars>.jpg`, `600 | 800 | 19500`,
a 12-character token. `blobs`: that one pathname, `19500 bytes`.

```sh
T=$($V sql RUN --value "select token from photo_share_links limit 1")
$V api RUN --anon GET "/f/$T"
$V api RUN --anon GET /f/AAAAAAAAAAAA
```

End state: `200`, `Foto · Expense Tracking`, `[Foto 1 dari 1]`, `[Simpan foto]`, and the saved
HTML's `<img src="https://etverifystore0000.public.blob.vercel-storage.com/photos/...">`; the made-up
token answers `404`.

Refusals (no browser needed):

```sh
$V api RUN --as stranger POST /api/photos/upload '{"type":"blob.generate-client-token","payload":{"pathname":"photos/AAAAAAAAAAAAAAAAAAAAA.jpg","clientPayload":"{\"groupId\":\"demoGroup001\"}","multipart":false}}'
$V api RUN --anon POST /api/photos/upload '{"type":"blob.generate-client-token","payload":{"pathname":"photos/AAAAAAAAAAAAAAAAAAAAA.jpg","clientPayload":"{\"groupId\":\"demoGroup001\"}","multipart":false}}'
```

End state: `400 {"error": "Expense group not found"}` and `400 {"error": "Not authenticated"}`.
The same body as `demo` answers `200` with a `vercel_blob_client_etverifystore0000_...` token.

## Gotchas

- The browser's PUT goes to the stand-in's HTTPS + HTTP/2 listener (SKILL.md Gotchas: Chromium
  streams the body only over h2). A `net::ERR_ALPN_NEGOTIATION_FAILED` in a transcript means the
  client bundle was built against a plain-HTTP Blob URL.
- The clipboard path, not the manual-copy field, is what headless Chromium drives; read the token
  from `photo_share_links`.
- Each run of `photo.mjs` adds one photo and one share token to the group; counts in later
  journeys go up accordingly.
