# Desktop milestone 1

## Result

The private Grunjee Site Desk workspace can open the Juniper Lane Bakery sample by name or at `/?site=juniper-lane`. Its preview uses the bakery's production-built Next.js markup and Tailwind CSS. Site Desk applies supported wording changes to a stored revision of the component. The original Onlook application still requires its sandbox, model, and database services.

Upstream browser baseline: `423e2e924366419e418ee049093872d535eea41a` on `onlook-dev/onlook:v1`. The upstream Bun lockfile SHA-256 is `9e7d54c9fca483129cd78f4205c025e7de2b620d998f58e099f9d6a593e941a6`. The bakery has a separate lockfile.

## Reproduce the private edit

Use Node 24 and Bun 1.3.12. Run these commands from the root of the grunjee-desktop branch:

```sh
bun tooling/grunjee/install-browser.ts
(cd examples/juniper-lane && bun install --frozen-lockfile && bun run build)
node apps/grunjee-desk/build.mjs
node --test apps/grunjee-desk/acceptance.test.mjs
node apps/grunjee-desk/dev.mjs --port 5173
```

1. Open `http://localhost:5173/?site=juniper-lane`. The local adapter uses an in-memory bucket for one developer. Browser reloads retain changes until the adapter stops. The hosted owner-private Site uses R2.
2. Click **Saturday pickup: 8 AM** in the preview. Send **Make that seven.** Reload.
3. Version 2 shows **Saturday pickup: 7 AM** and **Store opens: 8 AM**. Open **View website** in a fresh tab. The published copy still shows 8 AM for both.
4. In **History**, download the edited component. Copy it into a separate copy of the bakery project as `app/page.tsx`. Run the first command's install and build steps inside that separate project. Its `out/index.html` contains the 7 AM pickup. The original export contains 8 AM.

The upstream template-node mapper identified `opening-time` at line 15 and `pickup-time` at line 19 of `app/page.tsx`, component `BakeryHome`. A comparison of the downloaded revision against the original produced exactly one changed line:

```diff
-          <p data-oid="pickup-time">Saturday pickup: 8 AM</p>
+          <p data-oid="pickup-time">Saturday pickup: 7 AM</p>
```

The hosted adapter reuses the compiled structure for static wording changes. It does not build arbitrary React projects on request. The before and after production exports were independently rebuilt during verification.

## Reproduce the upstream checkout

```sh
git clone --branch grunjee-desktop https://github.com/grunjee/grunjee-onlook-browser.git
cd grunjee-onlook-browser
git remote add upstream https://github.com/onlook-dev/onlook.git
git merge-base --is-ancestor 423e2e924366419e418ee049093872d535eea41a HEAD
```

A public clone omits the access-controlled `apps/admin` submodule. Bun 1.3.1 rejected the frozen install without its workspace manifest. In a checkout with the Grunjee changes applied, use `bun tooling/grunjee/install-browser.ts`. This supplies the dependency declarations from the existing lockfile for installation and then removes the temporary manifest. It leaves a populated admin checkout alone. The browser workspace installed with its upstream lockfile intact.

On a development machine with Docker and service credentials, use the pinned upstream guide at `docs/content/docs/developers/running-locally.mdx`. Start local Supabase with `bun backend:start`, configure the development environment with `bun run setup:env`, and run `bun db:push` and `bun db:seed` against a disposable database. The seed resets application data. Start the original browser editor with `bun run dev`.

| Dependency | Verified here | Remaining upstream use |
|---|---|---|
| Bun 1.3.1 / 1.3.12 and Node 24.22.3 | Frozen upstream dependencies installed. The original template mapper resolved both lines. | Starts the original Next.js client and preload service. |
| Next.js and Tailwind | Both versions of the standalone fixture passed production builds, including TypeScript. | The original editor uses its own locked dependency versions. |
| Supabase Auth and PostgreSQL | The upstream backend command stopped at Docker socket access. The client build reported missing database credentials. | Set SUPABASE_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY. |
| CodeSandbox | The upstream client build reported missing CSB_API_KEY. | Runs the isolated client project and serves its preview. Sandbox provisioning and writes remain untested. |
| OpenRouter | The upstream client build reported missing OPENROUTER_API_KEY. | Supplies normal upstream chat. The Site Desk proof parsed the time instruction deterministically. |
| Morph or Relace | Documented and present in the fast-apply code. No live provider call was made. | Needed when the chosen edit path invokes model-assisted code application. Check the selected provider on this revision. |
| GPT Sites and R2 | Site Desk's hosted architecture. Browser acceptance captures used its local adapter. | Outside the stock upstream application. |
| Freestyle | No deployment requested from the original editor. | Separate publishing integration, outside the private edit proof. |

## Claude Code continuation

Use the pinned browser baseline and the public-checkout installer. Start the original editor and local Supabase on a Docker-capable development host. Make the sample available as a disposable Next.js repository and import it into the real sandbox. Select pickup, send the request through upstream chat, reload, inspect the sandbox file, and independently check the published baseline. Record the actual model and sandbox calls and any additional setup the running fork reveals. Keep the milestone open until the upstream workflow passes. The existing Site Desk screenshots cover the Grunjee adapter.

## Browser captures

[Before sending the request](evidence/before.jpg) · [Private version after reload](evidence/after-reload.jpg)

[Open the owner-private hosted workspace](https://grunjee-site-desk.ethanshotz.chatgpt.site/?site=juniper-lane)
