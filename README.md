BBB Blinkenlights
=================

The website and server behind [blinken.org](https://blinken.org), which
lets anyone program the LED lights in the stairwell of the Bob and Betty
Beyster Building. For background, see the
[documentation](https://docs.google.com/document/d/1kO2LvbGgDD-2SHmxqKJG2VrXhhx4hQG96N9LBkynDJc/edit)
on Google Docs. The Raspberry Pi that drives the lights runs
[xmaspi](https://github.com/ewust/xmaspi).

## How it works

- **Playground** (`/play/`): visitors write a show in JavaScript and run it
  in a 3D simulator. Their code runs in a Web Worker inside a sandboxed
  iframe with an opaque origin, so it can't touch the site. Shows are
  saved as drafts in the visitor's browser, and can be downloaded and
  uploaded as files. From there they can share a link to their code, run
  it on the stairs, or submit it to the gallery.
- **Gallery** (`/`, the home page): approved shows, with live previews and
  anonymous voting. When no one has a show queued, the stairs play gallery
  shows, favoring well-voted ones.
- **Admin** (`/admin/`): review submissions; approve, hide, reject, edit,
  or delete shows; run any show next.
- **Tutorial** (`/tutorial/`): how to write a show.
- **Live** (`/status/`): what's playing, with a live view of the lights.

The server (`server/`) is a single Node.js service:

- `sandbox.js`, `sandbox-worker.js`, `prelude.js`: runs show code in
  QuickJS compiled to WebAssembly, on a worker thread, with no access to
  Node, the network, or timers. Each step has a 100 ms deadline, and each
  show has fixed memory and stack limits.
- `scheduler.js`: the queue for the stairs. Each show runs for up to two
  minutes.
- `strand.js`: converts frames to the strand's format, limits total power,
  and sends frames to WebSocket clients.
- `app.js`: the HTTP API. `db.js`: SQLite storage for shared code,
  gallery shows, and votes.

The Pi gets its frames by connecting to the same `/api/0/stream`
WebSocket that the Live page uses.

The original API (`/publish`, `/status`, `/cancel`, `/current`, `/random`,
`/hello-pi`, `/stream`) still works, so shows that load `client.js` from
jsbin and older embedded clients keep working.

## Development

Requires Node.js 22.13 or later.

    cd server
    npm install
    BLINKEN_ADMIN_USER=admin BLINKEN_ADMIN_PASSWORD=secret npm run dev

Then open <http://localhost:3000/>. The server serves `static/` itself in
development. `npm run dev` restarts the server when its code changes;
changes to `static/` only need a reload in the browser. Run the tests with `npm test`.

Two files in `static/` are generated and committed:
`vendor/codemirror.js` (the playground's editor) and `client.js` (the
library for shows on other sites, built from `js/client-main.js`,
`js/stairs.js`, and `js/bulb.js`). After changing those sources or
upgrading CodeMirror, run `npm run build:vendor` in `server/`.

### Configuration

Set with environment variables:

| Variable | Default | |
|---|---|---|
| `PORT`, `HOST` | `3000`, `localhost` | Where to listen |
| `BLINKEN_DB` | `blinken.db` | SQLite database |
| `BLINKEN_SITE_URL` | `https://blinken.org` | Public URL, used in links to shows |
| `BLINKEN_ADMIN_USER`, `BLINKEN_ADMIN_PASSWORD` | | Admin login; the admin API is off unless both are set |

## Deployment

On the server (Ubuntu), with Node.js and Caddy installed from apt:

    sudo useradd --system --home-dir /var/lib/blinken --shell /usr/sbin/nologin blinken
    sudo install -d -o blinken -g blinken /var/lib/blinken
    sudo git clone https://github.com/research/blinken.git /srv/blinken
    cd /srv/blinken/server && sudo npm ci --omit=dev

    sudo install -d -m 700 /etc/blinken
    sudo install -m 600 /dev/null /etc/blinken/blinken.env
    # Add BLINKEN_ADMIN_USER=... and BLINKEN_ADMIN_PASSWORD=... to that file

    sudo cp config/blinken.service /etc/systemd/system/
    sudo cp config/Caddyfile /etc/caddy/Caddyfile
    sudo systemctl daemon-reload
    sudo systemctl enable --now blinken
    sudo systemctl reload caddy

To update, `git pull`, run `npm ci --omit=dev` in `server/`, and
`systemctl restart blinken`. Logs are in `journalctl -u blinken`.

### Moving from the old setup

The old setup ran the Python gallery service and the server from
`/home/jhalderm/blinken`, and sent frames to the Pi over UDP.

1. Update the Pi first so it receives frames over the WebSocket
   (xmaspi's `stream-client.py`). It can run alongside the old UDP path.
2. After installing the new server but before starting it, import the
   old gallery from the old checkout's cache:

       sudo cp -r /home/jhalderm/blinken/gallery/cache /tmp/gallery-cache
       sudo chown -R blinken /tmp/gallery-cache
       cd /srv/blinken/server
       sudo -u blinken node import-gallery.js /tmp/gallery-cache /var/lib/blinken/blinken.db

   Shows that fail in the new sandbox are imported as hidden, for review
   on the admin page.
3. Stop and disable the old `gallery` and `blinken` services, then
   start the new one and reload Caddy as above.
