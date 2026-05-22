# LetsGoRide Frontend

This folder contains the static LetsGoRide website.

## Local Development

Run the frontend web server and preview the site locally:

```bash
npm.cmd install
npm.cmd run dev
```

Then open:

- `http://localhost:3000`

## Production Deployment

This website is fully contained inside `frontend/public`.

To deploy:

1. Copy the contents of `frontend/public` to your static web host.
2. Serve the folder with any static file server.
3. Ensure `index.html` is the default entry point.

For simple hosting, you can use the same command used for local preview:

```bash
npx serve public -l 3000
```

## Notes

- The static site is inside `frontend/public`.
- `package.json` uses the same `dev` and `start` command for preview.
- Backend and mobile code are not part of this frontend deployment.
